import type {
  DeploymentRecord,
  DeploymentTarget,
  DispatchReadiness,
  HealthCheckResult,
} from '../domain/dispatch'

export interface DispatchReadinessEvaluation {
  ready: boolean
  blocked: boolean
  blockers: string[]
  warnings: string[]
  lastCheckedAt: string
}

export function evaluateDispatchReadiness({
  target,
  readiness,
  latestRecord,
}: {
  target?: DeploymentTarget
  readiness?: DispatchReadiness
  latestRecord?: DeploymentRecord
}): DispatchReadinessEvaluation {
  const blockers = new Set<string>()
  const warnings = new Set<string>()

  if (!target) {
    blockers.add('No deployment target is configured.')
  } else {
    target.blockers.forEach((blocker) => blockers.add(blocker))

    if (target.remoteHost.includes('placeholder') || target.remoteUser.includes('placeholder')) {
      warnings.add('Host or user values are placeholders.')
    }

    if (!target.publicUrl) {
      blockers.add('Public URL is not configured.')
    }

    if (target.healthCheckUrls.length === 0) {
      warnings.add('No health check URLs are defined.')
    }

    if (target.backupRequired && !readiness?.backupReady) {
      warnings.add('Backup is required but not marked ready.')
    }

    if (target.destructiveOperationsRequireConfirmation) {
      warnings.add('Destructive operations require explicit typed confirmation.')
    }
  }

  readiness?.blockers.forEach((blocker) => blockers.add(blocker))
  readiness?.warnings.forEach((warning) => warnings.add(warning))

  if (!readiness?.artifactReady) {
    warnings.add('Deployment artifact readiness is unknown or false.')
  }

  if (!readiness?.buildStatusKnown) {
    warnings.add('Build status is not known.')
  }

  if (latestRecord?.status === 'failed' || latestRecord?.status === 'rollback-needed') {
    blockers.add(`Latest deployment status is ${latestRecord.status}.`)
  }

  const blockerList = Array.from(blockers)
  const warningList = Array.from(warnings)

  return {
    ready: Boolean(target) && blockerList.length === 0 && warningList.length === 0,
    blocked: blockerList.length > 0,
    blockers: blockerList,
    warnings: warningList,
    lastCheckedAt: new Date().toISOString(),
  }
}

export function summarizeHealthChecks(results: HealthCheckResult[]) {
  if (results.length === 0) {
    return {
      status: 'not-checked' as const,
      message: 'No health checks have been recorded.',
    }
  }

  if (results.some((result) => result.status === 'failed')) {
    return {
      status: 'failed' as const,
      message: 'One or more health checks failed.',
    }
  }

  if (results.some((result) => result.status === 'warning')) {
    return {
      status: 'warning' as const,
      message: 'Health checks returned warnings.',
    }
  }

  if (results.every((result) => result.status === 'passing')) {
    return {
      status: 'passing' as const,
      message: 'All recorded health checks are passing.',
    }
  }

  return {
    status: 'not-checked' as const,
    message: 'Health checks have not been checked.',
  }
}
