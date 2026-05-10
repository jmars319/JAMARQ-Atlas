import type { ProjectRecord } from '../domain/atlas'
import {
  getLatestDeploymentRecord,
  summarizePreflightStatus,
  type DeploymentRecord,
  type DeploymentTarget,
  type DispatchPreflightCheck,
  type DispatchPreflightCheckType,
  type DispatchPreflightRun,
  type DispatchPreflightSource,
  type DispatchPreflightStatus,
  type DispatchReadiness,
  type HealthCheckResult,
} from '../domain/dispatch'
import type { DispatchState } from '../domain/dispatch'
import type {
  GithubApiError,
  GithubApiResponse,
  GithubCheckRun,
  GithubCommit,
  GithubDeployment,
  GithubRelease,
  GithubWorkflowRun,
} from './githubIntegration'
import { fetchGithubJson } from './githubIntegration'
import { probeHealthChecks } from './dispatchHealthChecks'

const FAILURE_CONCLUSIONS = new Set(['failure', 'timed_out', 'action_required'])
const WARNING_CONCLUSIONS = new Set(['cancelled', 'neutral', 'skipped', 'stale'])

function localId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`
}

function check({
  type,
  source,
  label,
  status,
  message,
  checkedAt,
  url,
  details,
}: {
  type: DispatchPreflightCheckType
  source: DispatchPreflightSource
  label: string
  status: DispatchPreflightStatus
  message: string
  checkedAt: string
  url?: string
  details?: string[]
}): DispatchPreflightCheck {
  return {
    id: localId('preflight-check'),
    type,
    source,
    label,
    status,
    message,
    checkedAt,
    url,
    details,
  }
}

function hasPlaceholder(value: string) {
  return value.toLowerCase().includes('placeholder') || value.toLowerCase().includes('example')
}

function statusFromHealth(status: HealthCheckResult['status']): DispatchPreflightStatus {
  if (status === 'passing') {
    return 'passing'
  }

  if (status === 'warning') {
    return 'warning'
  }

  if (status === 'failed') {
    return 'failed'
  }

  return 'skipped'
}

function statusFromConclusion(status: string, conclusion: string | null): DispatchPreflightStatus {
  if (conclusion && FAILURE_CONCLUSIONS.has(conclusion)) {
    return 'failed'
  }

  if (conclusion && WARNING_CONCLUSIONS.has(conclusion)) {
    return 'warning'
  }

  if (conclusion === 'success') {
    return 'passing'
  }

  if (status && status !== 'completed') {
    return 'warning'
  }

  return 'skipped'
}

function githubWarning(
  error: GithubApiError | null,
  resource: string,
  fullName: string,
  checkedAt: string,
) {
  return check({
    type: 'github-permission',
    source: 'github',
    label: `${fullName} ${resource}`,
    status: 'warning',
    checkedAt,
    message: error
      ? `${resource} unavailable: ${error.message}`
      : `${resource} unavailable for ${fullName}.`,
  })
}

export function buildTargetPreflightChecks({
  target,
  readiness,
  latestDeployment,
  checkedAt,
}: {
  target?: DeploymentTarget
  readiness?: DispatchReadiness
  latestDeployment?: DeploymentRecord
  checkedAt: string
}): DispatchPreflightCheck[] {
  if (!target) {
    return [
      check({
        type: 'target-config',
        source: 'dispatch',
        label: 'Deployment target',
        status: 'failed',
        checkedAt,
        message: 'No deployment target is configured for this project.',
      }),
    ]
  }

  const checks: DispatchPreflightCheck[] = [
    check({
      type: 'target-config',
      source: 'dispatch',
      label: 'Public URL',
      status: target.publicUrl ? 'passing' : 'failed',
      checkedAt,
      url: target.publicUrl || undefined,
      message: target.publicUrl
        ? `Public URL is configured for ${target.environment}.`
        : 'Public URL is not configured.',
    }),
    check({
      type: 'target-config',
      source: 'dispatch',
      label: 'Host and paths',
      status:
        hasPlaceholder(target.remoteHost) ||
        hasPlaceholder(target.remoteUser) ||
        hasPlaceholder(target.remoteFrontendPath) ||
        hasPlaceholder(target.remoteBackendPath)
          ? 'warning'
          : 'passing',
      checkedAt,
      message: 'Remote host, user, and target paths are recorded for human review.',
    }),
    check({
      type: 'backup',
      source: 'dispatch',
      label: 'Backup posture',
      status: target.backupRequired ? (readiness?.backupReady ? 'passing' : 'warning') : 'skipped',
      checkedAt,
      message: target.backupRequired
        ? readiness?.backupReady
          ? 'Backup is required and manually marked ready.'
          : 'Backup is required but not manually marked ready.'
        : 'Backup is not required for this target.',
    }),
    check({
      type: 'rollback',
      source: 'dispatch',
      label: 'Rollback reference',
      status: latestDeployment ? (latestDeployment.rollbackRef ? 'passing' : 'warning') : 'skipped',
      checkedAt,
      message: latestDeployment
        ? latestDeployment.rollbackRef
          ? `Rollback reference recorded: ${latestDeployment.rollbackRef}.`
          : 'Latest deployment record does not include a rollback reference.'
        : 'No deployment record exists yet, so rollback posture cannot be inferred.',
    }),
  ]

  if (target.healthCheckUrls.length === 0) {
    checks.push(
      check({
        type: 'health',
        source: 'health-check',
        label: 'Health checks',
        status: 'skipped',
        checkedAt,
        message: 'No health check URLs are configured.',
      }),
    )
  }

  return checks
}

async function githubResource<T>(
  owner: string,
  repo: string,
  resource: string,
  signal?: AbortSignal,
  params = new URLSearchParams({ page: '1', per_page: '1' }),
) {
  return fetchGithubJson<GithubApiResponse<T>>(
    `/api/github/repos/${owner}/${repo}/${resource}?${params.toString()}`,
    signal,
  )
}

async function buildGithubPreflightChecks(record: ProjectRecord, checkedAt: string, signal?: AbortSignal) {
  if (record.project.repositories.length === 0) {
    return [
      check({
        type: 'github-permission',
        source: 'github',
        label: 'GitHub repository',
        status: 'skipped',
        checkedAt,
        message: 'No GitHub repository is bound to this Atlas project.',
      }),
    ]
  }

  const checks: DispatchPreflightCheck[] = []

  for (const repo of record.project.repositories) {
    const fullName = `${repo.owner}/${repo.name}`

    try {
      const commits = await githubResource<GithubCommit[]>(repo.owner, repo.name, 'commits', signal)

      if (commits.error) {
        checks.push(githubWarning(commits.error, 'commits', fullName, checkedAt))
      } else {
        const latestCommit = commits.data?.[0]
        checks.push(
          check({
            type: 'github-commit',
            source: 'github',
            label: `${fullName} latest commit`,
            status: latestCommit ? 'passing' : 'warning',
            checkedAt,
            url: latestCommit?.htmlUrl,
            message: latestCommit
              ? `${latestCommit.shortSha} by ${latestCommit.author ?? 'unknown author'}`
              : 'No commits were returned by GitHub.',
            details: latestCommit
              ? [latestCommit.message.split('\n')[0] || 'Commit', latestCommit.date ?? 'unknown date']
              : undefined,
          }),
        )
      }

      const workflowRuns = await githubResource<GithubWorkflowRun[]>(
        repo.owner,
        repo.name,
        'workflow-runs',
        signal,
      )

      if (workflowRuns.error) {
        checks.push(githubWarning(workflowRuns.error, 'workflow runs', fullName, checkedAt))
      } else {
        const latestRun = workflowRuns.data?.[0]
        checks.push(
          check({
            type: 'github-workflow',
            source: 'github',
            label: `${fullName} latest workflow`,
            status: latestRun
              ? statusFromConclusion(latestRun.status, latestRun.conclusion)
              : 'skipped',
            checkedAt,
            url: latestRun?.htmlUrl,
            message: latestRun
              ? `${latestRun.displayTitle || latestRun.name || 'Workflow run'} is ${
                  latestRun.conclusion ?? latestRun.status
                }.`
              : 'No workflow runs were returned by GitHub.',
          }),
        )
      }

      const releases = await githubResource<GithubRelease[]>(repo.owner, repo.name, 'releases', signal)

      if (releases.error) {
        checks.push(githubWarning(releases.error, 'releases', fullName, checkedAt))
      } else {
        const latestRelease = releases.data?.[0]
        checks.push(
          check({
            type: 'github-release',
            source: 'github',
            label: `${fullName} latest release`,
            status: latestRelease ? 'passing' : 'skipped',
            checkedAt,
            url: latestRelease?.htmlUrl,
            message: latestRelease
              ? `${latestRelease.name ?? latestRelease.tagName} was published ${latestRelease.publishedAt ?? 'without a publish timestamp'}.`
              : 'No releases were returned by GitHub.',
          }),
        )
      }

      const deployments = await githubResource<GithubDeployment[]>(
        repo.owner,
        repo.name,
        'deployments',
        signal,
      )

      if (deployments.error) {
        checks.push(githubWarning(deployments.error, 'deployments', fullName, checkedAt))
      } else {
        const latestDeployment = deployments.data?.[0]
        checks.push(
          check({
            type: 'github-deployment',
            source: 'github',
            label: `${fullName} latest GitHub deployment`,
            status: latestDeployment ? 'passing' : 'skipped',
            checkedAt,
            message: latestDeployment
              ? `${latestDeployment.environment || 'deployment'} at ${latestDeployment.shortSha}.`
              : 'No GitHub deployment records were returned.',
          }),
        )
      }

      const latestCommitRef = commits.data?.[0]?.sha || repo.defaultBranch || 'HEAD'
      const checkParams = new URLSearchParams({
        page: '1',
        per_page: '1',
        ref: latestCommitRef,
      })
      const checkRuns = await githubResource<GithubCheckRun[]>(
        repo.owner,
        repo.name,
        'checks',
        signal,
        checkParams,
      )

      if (checkRuns.error) {
        checks.push(githubWarning(checkRuns.error, 'checks', fullName, checkedAt))
      } else {
        const latestCheck = checkRuns.data?.[0]
        checks.push(
          check({
            type: 'github-workflow',
            source: 'github',
            label: `${fullName} latest check`,
            status: latestCheck
              ? statusFromConclusion(latestCheck.status, latestCheck.conclusion)
              : 'skipped',
            checkedAt,
            url: latestCheck?.htmlUrl || latestCheck?.detailsUrl || undefined,
            message: latestCheck
              ? `${latestCheck.name} is ${latestCheck.conclusion ?? latestCheck.status}.`
              : 'No check runs were returned by GitHub.',
          }),
        )
      }
    } catch (error) {
      checks.push(
        check({
          type: 'github-permission',
          source: 'github',
          label: `${fullName} GitHub signals`,
          status: 'warning',
          checkedAt,
          message: error instanceof Error ? error.message : 'GitHub signals could not be read.',
        }),
      )
    }
  }

  return checks
}

export async function runDispatchPreflight({
  record,
  dispatch,
  target,
  signal,
}: {
  record: ProjectRecord
  dispatch: DispatchState
  target?: DeploymentTarget
  signal?: AbortSignal
}): Promise<DispatchPreflightRun> {
  const startedAt = new Date().toISOString()
  const readiness = target
    ? dispatch.readiness.find(
        (candidate) =>
          candidate.projectId === target.projectId && candidate.targetId === target.id,
      )
    : undefined
  const latestDeployment = target ? getLatestDeploymentRecord(dispatch, target.id) : undefined
  const checks = buildTargetPreflightChecks({
    target,
    readiness,
    latestDeployment,
    checkedAt: startedAt,
  })

  if (target && target.healthCheckUrls.length > 0) {
    const healthResults = await probeHealthChecks(target.healthCheckUrls, signal)
    checks.push(
      ...healthResults.map((result) =>
        check({
          type: 'health',
          source: 'health-check',
          label: result.url,
          status: statusFromHealth(result.status),
          checkedAt: result.checkedAt ?? startedAt,
          url: result.url,
          message: result.statusCode ? `${result.statusCode}: ${result.message}` : result.message,
        }),
      ),
    )
  }

  checks.push(...(await buildGithubPreflightChecks(record, startedAt, signal)))

  const completedAt = new Date().toISOString()
  const status = summarizePreflightStatus(checks)
  const failed = checks.filter((candidate) => candidate.status === 'failed').length
  const warnings = checks.filter((candidate) => candidate.status === 'warning').length

  return {
    id: localId('preflight-run'),
    projectId: record.project.id,
    targetId: target?.id ?? 'unconfigured',
    startedAt,
    completedAt,
    status,
    summary:
      failed > 0
        ? `${failed} failed checks and ${warnings} warnings need human review.`
        : warnings > 0
          ? `${warnings} warnings need human review.`
          : 'Read-only preflight completed without failed checks.',
    checks,
  }
}
