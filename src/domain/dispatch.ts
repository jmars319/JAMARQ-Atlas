export type DeploymentEnvironment = 'production' | 'staging' | 'preview' | 'local' | 'other'

export type DeploymentHostType =
  | 'cpanel'
  | 'godaddy-cpanel'
  | 'vps'
  | 'static-host'
  | 'vercel'
  | 'netlify'
  | 'cloudflare-pages'
  | 'github-pages'
  | 'other'

export const DEPLOYMENT_STATUSES = [
  'not-configured',
  'configured',
  'ready',
  'blocked',
  'deploying',
  'verification',
  'stable',
  'failed',
  'rollback-needed',
  'archived',
] as const

export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number]

export type HealthCheckStatus = 'not-checked' | 'passing' | 'warning' | 'failed'

export interface HealthCheckResult {
  id: string
  url: string
  status: HealthCheckStatus
  checkedAt: string | null
  statusCode?: number
  message: string
}

export interface DeploymentTarget {
  id: string
  projectId: string
  name: string
  environment: DeploymentEnvironment
  hostType: DeploymentHostType
  remoteHost: string
  remoteUser: string
  remoteFrontendPath: string
  remoteBackendPath: string
  publicUrl: string
  healthCheckUrls: string[]
  hasDatabase: boolean
  databaseName: string
  backupRequired: boolean
  destructiveOperationsRequireConfirmation: boolean
  status: DeploymentStatus
  lastVerified: string
  deploymentNotes: string[]
  blockers: string[]
  notes: string[]
}

export interface DeploymentRecord {
  id: string
  projectId: string
  targetId: string
  environment: DeploymentEnvironment
  versionLabel: string
  sourceRef: string
  commitSha: string
  artifactName: string
  startedAt: string
  completedAt: string
  status: DeploymentStatus
  deployedBy: string
  summary: string
  healthCheckResults: HealthCheckResult[]
  rollbackRef: string
  databaseBackupRef: string
  notes: string[]
}

export interface DispatchReadiness {
  projectId: string
  targetId: string
  repoCleanKnown: boolean
  buildStatusKnown: boolean
  artifactReady: boolean
  backupReady: boolean
  healthChecksDefined: boolean
  ready: boolean
  blocked: boolean
  blockers: string[]
  warnings: string[]
  lastCheckedAt: string
}

export interface DispatchState {
  targets: DeploymentTarget[]
  records: DeploymentRecord[]
  readiness: DispatchReadiness[]
}

export type DeploymentRunnerPhase =
  | 'preflight'
  | 'backup'
  | 'package'
  | 'upload'
  | 'release'
  | 'verify'
  | 'rollback'

export interface DeploymentRunnerResult {
  phase: DeploymentRunnerPhase
  status: 'not-implemented' | 'skipped' | 'blocked'
  requiresConfirmation: boolean
  message: string
}

export function findTargetsForProject(state: DispatchState, projectId: string) {
  return state.targets.filter((target) => target.projectId === projectId)
}

export function findReadiness(
  state: DispatchState,
  projectId: string,
  targetId: string,
): DispatchReadiness | undefined {
  return state.readiness.find(
    (readiness) => readiness.projectId === projectId && readiness.targetId === targetId,
  )
}

export function getTargetRecords(state: DispatchState, targetId: string) {
  return state.records
    .filter((record) => record.targetId === targetId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function getLatestDeploymentRecord(state: DispatchState, targetId: string) {
  return getTargetRecords(state, targetId)[0]
}

export function getHealthCheckSummary(results: HealthCheckResult[] | undefined) {
  if (!results || results.length === 0) {
    return {
      status: 'not-checked' as HealthCheckStatus,
      label: 'Not checked',
    }
  }

  if (results.some((result) => result.status === 'failed')) {
    return {
      status: 'failed' as HealthCheckStatus,
      label: 'Failing',
    }
  }

  if (results.some((result) => result.status === 'warning')) {
    return {
      status: 'warning' as HealthCheckStatus,
      label: 'Warnings',
    }
  }

  if (results.every((result) => result.status === 'passing')) {
    return {
      status: 'passing' as HealthCheckStatus,
      label: 'Passing',
    }
  }

  return {
    status: 'not-checked' as HealthCheckStatus,
    label: 'Not checked',
  }
}

export function formatDeploymentStatus(status: DeploymentStatus) {
  return status
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}
