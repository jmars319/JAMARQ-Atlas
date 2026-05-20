import type { GithubRepositoryLink } from '../domain/atlas'
import type {
  GithubApiError,
  GithubBranch,
  GithubCheckRun,
  GithubCommit,
  GithubDeployment,
  GithubIssue,
  GithubPermissionState,
  GithubPullRequest,
  GithubRelease,
  GithubRepositorySummary,
  GithubTag,
  GithubWorkflowRun,
} from './githubIntegration'
import type { LocalGitRepositoryStatusResponse } from './localGit'

export type GithubRepoHealthState = 'healthy' | 'attention' | 'stale' | 'unknown'
export type GithubRepoCommandSeverity = 'ok' | 'warning' | 'danger' | 'muted'

export type GithubAttentionSignalCategory =
  | 'branches'
  | 'checks'
  | 'deployment'
  | 'issues'
  | 'local-git'
  | 'permissions'
  | 'pull-requests'
  | 'release'
  | 'repository'
  | 'tags'
  | 'workflow'

export interface GithubPermissionGap {
  resource: string
  type: GithubApiError['type'] | LocalGitRepositoryStatusResponse['status']
  message: string
  status: number | null
  permission: GithubPermissionState | 'unavailable'
}

export interface GithubFailureExplanation {
  type: 'workflow-run' | 'check-run'
  workflowRunId: number | null
  workflowName: string | null
  jobName: string | null
  stepName: string | null
  conclusion: string
  completedAt: string | null
  htmlUrl: string
  commitSha: string | null
  stale: boolean
  staleReason: string | null
}

export interface GithubAttentionSignal {
  id: string
  category: GithubAttentionSignalCategory
  severity: GithubRepoCommandSeverity
  title: string
  detail: string
  evidence: string[]
  occurredAt: string | null
  url: string | null
  stale: boolean
}

export interface GithubRepoCommandSummaryInput {
  owner: string
  repo: string
  repository: GithubRepositorySummary | null
  latestCommit: GithubCommit | null
  openPullRequests: GithubPullRequest[]
  openIssues: GithubIssue[]
  latestWorkflowRun: GithubWorkflowRun | null
  latestCheckRun: GithubCheckRun | null
  checkRuns: GithubCheckRun[]
  latestRelease: GithubRelease | null
  latestDeployment: GithubDeployment | null
  branches: GithubBranch[]
  tags: GithubTag[]
  localGit: LocalGitRepositoryStatusResponse
  githubErrors: GithubApiError[]
  failureExplanation: GithubFailureExplanation | null
  fetchedAt: string
}

export interface GithubRepoCommandSummary {
  owner: string
  repo: string
  fullName: string
  repository: GithubRepositorySummary | null
  state: GithubRepoHealthState
  severity: GithubRepoCommandSeverity
  signals: GithubAttentionSignal[]
  permissionGaps: GithubPermissionGap[]
  latestCommit: GithubCommit | null
  latestWorkflowRun: GithubWorkflowRun | null
  latestCheckRun: GithubCheckRun | null
  latestRelease: GithubRelease | null
  latestDeployment: GithubDeployment | null
  failureExplanation: GithubFailureExplanation | null
  localGit: LocalGitRepositoryStatusResponse
  counts: {
    openPullRequests: number
    openIssues: number
    checkRuns: number
    branches: number
    tags: number
  }
  branchNames: string[]
  tagNames: string[]
  fetchedAt: string
  writeControlsEnabled: false
}

export interface GithubProjectCommandRollup {
  projectId: string
  projectName: string
  boundRepoCount: number
  loadedRepoCount: number
  worstState: GithubRepoHealthState
  severity: GithubRepoCommandSeverity
  latestCiStatus: string
  dirtyLocalRepoCount: number
  openPullRequests: number
  openIssues: number
  topAttentionSignals: Array<GithubAttentionSignal & { repositoryKey: string }>
  permissionGaps: GithubPermissionGap[]
}

export interface GithubProjectCommandRollupInput {
  projectId: string
  projectName: string
  repositories: GithubRepositoryLink[]
  summaries: GithubRepoCommandSummary[]
}

const DANGER_CONCLUSIONS = new Set(['action_required', 'failure', 'timed_out'])
const WARNING_CONCLUSIONS = new Set(['cancelled', 'neutral', 'skipped', 'startup_failure'])
const FAILURE_CONCLUSIONS = new Set([...DANGER_CONCLUSIONS, 'cancelled', 'startup_failure'])

const severityRank: Record<GithubRepoCommandSeverity, number> = {
  danger: 0,
  warning: 1,
  muted: 2,
  ok: 3,
}

const stateRank: Record<GithubRepoHealthState, number> = {
  attention: 0,
  stale: 1,
  unknown: 2,
  healthy: 3,
}

function repoKey(owner: string, repo: string) {
  return `${owner}/${repo}`
}

function signal({
  id,
  category,
  severity,
  title,
  detail,
  evidence = [],
  occurredAt = null,
  url = null,
  stale = false,
}: GithubAttentionSignal): GithubAttentionSignal {
  return {
    id,
    category,
    severity,
    title,
    detail,
    evidence,
    occurredAt,
    url,
    stale,
  }
}

function conclusionOf(run: GithubWorkflowRun | GithubCheckRun | null) {
  if (!run) {
    return null
  }

  return run.conclusion ?? run.status
}

function hasFailureConclusion(conclusion: string | null | undefined) {
  return conclusion ? FAILURE_CONCLUSIONS.has(conclusion) : false
}

function hasDangerConclusion(conclusion: string | null | undefined) {
  return conclusion ? DANGER_CONCLUSIONS.has(conclusion) : false
}

function checkIsFailing(check: GithubCheckRun) {
  const result = conclusionOf(check)

  return hasDangerConclusion(result) || result === 'failure' || result === 'timed_out'
}

export function githubRunIsStale(
  latestCommit: GithubCommit | null,
  latestWorkflowRun: GithubWorkflowRun | null,
) {
  return Boolean(
    latestCommit?.sha &&
      latestWorkflowRun?.headSha &&
      latestCommit.sha !== latestWorkflowRun.headSha,
  )
}

function permissionGapFromGithubError(error: GithubApiError): GithubPermissionGap {
  return {
    resource: error.resource,
    type: error.type,
    message: error.message,
    status: error.status,
    permission:
      error.type === 'insufficient-permission'
        ? 'insufficient'
        : error.type === 'missing-token'
          ? 'missing-token'
          : 'unknown',
  }
}

function permissionGapFromLocalGit(
  localGit: LocalGitRepositoryStatusResponse,
): GithubPermissionGap | null {
  if (localGit.ok || localGit.status === 'not-found' || localGit.status === 'not-configured') {
    return null
  }

  return {
    resource: 'local-git',
    type: localGit.status,
    message: localGit.error?.message ?? 'Local Git status is unavailable.',
    status: null,
    permission: 'unavailable',
  }
}

function derivePermissionGaps({
  githubErrors,
  localGit,
}: Pick<GithubRepoCommandSummaryInput, 'githubErrors' | 'localGit'>) {
  return [
    ...githubErrors.map(permissionGapFromGithubError),
    permissionGapFromLocalGit(localGit),
  ].filter((gap): gap is GithubPermissionGap => gap !== null)
}

function deriveSignals(input: GithubRepoCommandSummaryInput, permissionGaps: GithubPermissionGap[]) {
  const {
    owner,
    repo,
    repository,
    latestCommit,
    openPullRequests,
    openIssues,
    latestWorkflowRun,
    latestCheckRun,
    checkRuns,
    latestRelease,
    latestDeployment,
    branches,
    tags,
    localGit,
    failureExplanation,
  } = input
  const fullName = repoKey(owner, repo)
  const signals: GithubAttentionSignal[] = []
  const workflowResult = conclusionOf(latestWorkflowRun)
  const workflowStale = githubRunIsStale(latestCommit, latestWorkflowRun)

  if (!repository) {
    signals.push(
      signal({
        id: `${fullName}-repository-unavailable`,
        category: 'repository',
        severity: 'warning',
        title: 'Repository data unavailable',
        detail: `${fullName} could not be read through the current GitHub session.`,
        evidence: permissionGaps.map((gap) => `${gap.resource}: ${gap.type}`),
        occurredAt: null,
        url: null,
        stale: false,
      }),
    )
  }

  if (latestWorkflowRun && workflowStale) {
    signals.push(
      signal({
        id: `${fullName}-workflow-stale-${latestWorkflowRun.id}`,
        category: 'workflow',
        severity: 'warning',
        title: 'Latest workflow is historical',
        detail: `The latest workflow run is for ${latestWorkflowRun.headSha?.slice(0, 7) ?? 'an older commit'}, while the repository head is ${latestCommit?.shortSha ?? 'newer'}.`,
        evidence: [
          workflowResult ?? 'workflow result unknown',
          `run ${latestWorkflowRun.runNumber}`,
          latestCommit?.shortSha ?? 'latest commit unknown',
        ],
        occurredAt: latestWorkflowRun.updatedAt,
        url: latestWorkflowRun.htmlUrl,
        stale: true,
      }),
    )
  }

  if (latestWorkflowRun && hasFailureConclusion(workflowResult)) {
    signals.push(
      signal({
        id: `${fullName}-workflow-${latestWorkflowRun.id}-${workflowResult ?? 'unknown'}`,
        category: 'workflow',
        severity: workflowStale ? 'warning' : 'danger',
        title: workflowStale ? 'Historical workflow failure' : 'Latest workflow failed',
        detail:
          failureExplanation?.jobName || failureExplanation?.stepName
            ? [
                failureExplanation.jobName,
                failureExplanation.stepName,
                failureExplanation.conclusion,
              ]
                .filter(Boolean)
                .join(' / ')
            : `${latestWorkflowRun.name ?? 'Workflow'} ended with ${workflowResult ?? 'unknown'}.`,
        evidence: [
          latestWorkflowRun.displayTitle || latestWorkflowRun.name || 'workflow run',
          latestWorkflowRun.headSha?.slice(0, 7) ?? 'no head SHA',
          workflowStale ? 'stale' : 'current',
        ],
        occurredAt: latestWorkflowRun.updatedAt,
        url: latestWorkflowRun.htmlUrl,
        stale: workflowStale,
      }),
    )
  }

  if (latestWorkflowRun && WARNING_CONCLUSIONS.has(workflowResult ?? '')) {
    signals.push(
      signal({
        id: `${fullName}-workflow-warning-${latestWorkflowRun.id}`,
        category: 'workflow',
        severity: 'warning',
        title: 'Latest workflow needs review',
        detail: `${latestWorkflowRun.name ?? 'Workflow'} ended with ${workflowResult}.`,
        evidence: [latestWorkflowRun.event, latestWorkflowRun.branch ?? 'unknown branch'],
        occurredAt: latestWorkflowRun.updatedAt,
        url: latestWorkflowRun.htmlUrl,
        stale: workflowStale,
      }),
    )
  }

  if (!latestWorkflowRun && !permissionGaps.some((gap) => gap.resource === 'workflow-runs')) {
    signals.push(
      signal({
        id: `${fullName}-workflow-missing`,
        category: 'workflow',
        severity: 'warning',
        title: 'No workflow data',
        detail: 'GitHub returned no workflow runs for this repository.',
        evidence: ['workflow-runs empty'],
        occurredAt: null,
        url: repository?.htmlUrl ?? null,
        stale: false,
      }),
    )
  }

  const failingChecks = checkRuns.filter(checkIsFailing)

  if (failingChecks.length > 0) {
    const first = failingChecks[0]

    signals.push(
      signal({
        id: `${fullName}-checks-failed-${first.id}`,
        category: 'checks',
        severity: 'danger',
        title: 'Latest checks failed',
        detail: `${failingChecks.length} check run(s) failed or require action.`,
        evidence: [
          first.name,
          first.conclusion ?? first.status,
          first.app ?? 'GitHub checks',
        ],
        occurredAt: first.completedAt ?? first.startedAt,
        url: first.htmlUrl || first.detailsUrl,
        stale: false,
      }),
    )
  } else if (checkRuns.length === 0 && !permissionGaps.some((gap) => gap.resource === 'checks')) {
    signals.push(
      signal({
        id: `${fullName}-checks-missing`,
        category: 'checks',
        severity: 'muted',
        title: 'No check run data',
        detail: 'GitHub returned no check runs for the latest commit.',
        evidence: ['checks empty'],
        occurredAt: null,
        url: repository?.htmlUrl ?? null,
        stale: false,
      }),
    )
  } else if (latestCheckRun && WARNING_CONCLUSIONS.has(conclusionOf(latestCheckRun) ?? '')) {
    signals.push(
      signal({
        id: `${fullName}-checks-warning-${latestCheckRun.id}`,
        category: 'checks',
        severity: 'warning',
        title: 'Latest check needs review',
        detail: `${latestCheckRun.name} ended with ${conclusionOf(latestCheckRun)}.`,
        evidence: [latestCheckRun.app ?? 'GitHub checks'],
        occurredAt: latestCheckRun.completedAt ?? latestCheckRun.startedAt,
        url: latestCheckRun.htmlUrl || latestCheckRun.detailsUrl,
        stale: false,
      }),
    )
  }

  if (openPullRequests.length > 0) {
    signals.push(
      signal({
        id: `${fullName}-open-prs`,
        category: 'pull-requests',
        severity: 'warning',
        title: 'Open pull requests',
        detail: `${openPullRequests.length} open pull request(s) need operator review.`,
        evidence: openPullRequests.slice(0, 3).map((pull) => `#${pull.number} ${pull.title}`),
        occurredAt: openPullRequests[0]?.updatedAt ?? null,
        url: openPullRequests[0]?.htmlUrl ?? repository?.htmlUrl ?? null,
        stale: false,
      }),
    )
  }

  if (openIssues.length > 0) {
    signals.push(
      signal({
        id: `${fullName}-open-issues`,
        category: 'issues',
        severity: 'warning',
        title: 'Open issues',
        detail: `${openIssues.length} open issue(s) are visible for this repository.`,
        evidence: openIssues.slice(0, 3).map((issue) => `#${issue.number} ${issue.title}`),
        occurredAt: openIssues[0]?.updatedAt ?? null,
        url: openIssues[0]?.htmlUrl ?? repository?.htmlUrl ?? null,
        stale: false,
      }),
    )
  }

  if (localGit.status === 'available' && localGit.data) {
    const { data } = localGit
    const localEvidence = [
      data.branch,
      data.upstream ?? 'no upstream',
      data.latestCommit?.shortSha ?? 'no commit',
    ]

    if (data.dirty) {
      signals.push(
        signal({
          id: `${fullName}-local-dirty`,
          category: 'local-git',
          severity: 'warning',
          title: 'Local clone has changes',
          detail: `${data.changedFiles} changed file(s) under ${data.path}.`,
          evidence: localEvidence,
          occurredAt: data.checkedAt,
          url: null,
          stale: false,
        }),
      )
    }

    if ((data.ahead ?? 0) > 0 || (data.behind ?? 0) > 0) {
      signals.push(
        signal({
          id: `${fullName}-local-diverged`,
          category: 'local-git',
          severity: 'warning',
          title: 'Local clone differs from upstream',
          detail: `Local branch is ${data.ahead ?? 0} ahead and ${data.behind ?? 0} behind upstream.`,
          evidence: localEvidence,
          occurredAt: data.checkedAt,
          url: null,
          stale: false,
        }),
      )
    }
  } else if (localGit.status === 'not-found') {
    signals.push(
      signal({
        id: `${fullName}-local-missing`,
        category: 'local-git',
        severity: 'warning',
        title: 'Missing local clone',
        detail: localGit.error?.message ?? `${fullName} was not found under configured roots.`,
        evidence: localGit.roots,
        occurredAt: null,
        url: repository?.htmlUrl ?? null,
        stale: false,
      }),
    )
  } else if (localGit.status === 'not-configured') {
    signals.push(
      signal({
        id: `${fullName}-local-not-configured`,
        category: 'local-git',
        severity: 'muted',
        title: 'Local Git roots not configured',
        detail: localGit.error?.message ?? 'ATLAS_LOCAL_REPO_ROOTS is not configured.',
        evidence: ['ATLAS_LOCAL_REPO_ROOTS missing'],
        occurredAt: null,
        url: null,
        stale: false,
      }),
    )
  }

  if (!latestRelease) {
    signals.push(
      signal({
        id: `${fullName}-release-missing`,
        category: 'release',
        severity: 'muted',
        title: 'No release data',
        detail: 'GitHub returned no releases for this repository.',
        evidence: ['releases empty'],
        occurredAt: null,
        url: repository?.htmlUrl ?? null,
        stale: false,
      }),
    )
  }

  if (!latestDeployment) {
    signals.push(
      signal({
        id: `${fullName}-deployment-missing`,
        category: 'deployment',
        severity: 'muted',
        title: 'No deployment data',
        detail: 'GitHub returned no deployments for this repository.',
        evidence: ['deployments empty'],
        occurredAt: null,
        url: repository?.htmlUrl ?? null,
        stale: false,
      }),
    )
  }

  if (branches.length === 0) {
    signals.push(
      signal({
        id: `${fullName}-branches-missing`,
        category: 'branches',
        severity: 'muted',
        title: 'No branch inventory',
        detail: 'GitHub returned no branch records for this repository.',
        evidence: ['branches empty'],
        occurredAt: null,
        url: repository?.htmlUrl ?? null,
        stale: false,
      }),
    )
  }

  if (tags.length === 0) {
    signals.push(
      signal({
        id: `${fullName}-tags-missing`,
        category: 'tags',
        severity: 'muted',
        title: 'No tag inventory',
        detail: 'GitHub returned no tags for this repository.',
        evidence: ['tags empty'],
        occurredAt: null,
        url: repository?.htmlUrl ?? null,
        stale: false,
      }),
    )
  }

  permissionGaps.forEach((gap) => {
    signals.push(
      signal({
        id: `${fullName}-permission-${gap.resource}-${gap.type}`,
        category: 'permissions',
        severity: gap.type === 'missing-token' ? 'warning' : 'warning',
        title: 'GitHub data gap',
        detail: gap.message,
        evidence: [gap.resource, gap.type, gap.permission],
        occurredAt: null,
        url: repository?.htmlUrl ?? null,
        stale: false,
      }),
    )
  })

  return signals
}

export function deriveGithubRepoCommandSummary(
  input: GithubRepoCommandSummaryInput,
): GithubRepoCommandSummary {
  const permissionGaps = derivePermissionGaps(input)
  const signals = deriveSignals(input, permissionGaps)
  const activeSignals = signals.filter((candidate) => candidate.severity !== 'muted')
  const stale = signals.some((candidate) => candidate.stale)
  const danger = activeSignals.some((candidate) => candidate.severity === 'danger')
  const warning = activeSignals.some((candidate) => candidate.severity === 'warning')
  const state: GithubRepoHealthState = !input.repository
    ? 'unknown'
    : stale
      ? 'stale'
      : danger || warning
        ? 'attention'
        : 'healthy'
  const severity: GithubRepoCommandSeverity = danger
    ? 'danger'
    : warning || stale
      ? 'warning'
      : signals.some((candidate) => candidate.severity === 'muted')
        ? 'muted'
        : 'ok'

  return {
    owner: input.owner,
    repo: input.repo,
    fullName: repoKey(input.owner, input.repo),
    repository: input.repository,
    state,
    severity,
    signals,
    permissionGaps,
    latestCommit: input.latestCommit,
    latestWorkflowRun: input.latestWorkflowRun,
    latestCheckRun: input.latestCheckRun,
    latestRelease: input.latestRelease,
    latestDeployment: input.latestDeployment,
    failureExplanation: input.failureExplanation,
    localGit: input.localGit,
    counts: {
      openPullRequests: input.openPullRequests.length,
      openIssues: input.openIssues.length,
      checkRuns: input.checkRuns.length,
      branches: input.branches.length,
      tags: input.tags.length,
    },
    branchNames: input.branches.map((branch) => branch.name),
    tagNames: input.tags.map((tag) => tag.name),
    fetchedAt: input.fetchedAt,
    writeControlsEnabled: false,
  }
}

function worseSeverity(
  left: GithubRepoCommandSeverity,
  right: GithubRepoCommandSeverity,
): GithubRepoCommandSeverity {
  return severityRank[left] <= severityRank[right] ? left : right
}

function worseState(left: GithubRepoHealthState, right: GithubRepoHealthState) {
  return stateRank[left] <= stateRank[right] ? left : right
}

function latestCiStatus(summary: GithubRepoCommandSummary) {
  const workflow = summary.latestWorkflowRun
  const check = summary.latestCheckRun

  if (workflow) {
    return `${workflow.name ?? 'Workflow'}: ${workflow.conclusion ?? workflow.status}`
  }

  if (check) {
    return `${check.name}: ${check.conclusion ?? check.status}`
  }

  return 'Unavailable'
}

export function deriveGithubProjectCommandRollup({
  projectId,
  projectName,
  repositories,
  summaries,
}: GithubProjectCommandRollupInput): GithubProjectCommandRollup {
  const summaryByKey = new Map(
    summaries.map((summary) => [summary.fullName.toLowerCase(), summary]),
  )
  const loadedSummaries = repositories
    .map((repository) => summaryByKey.get(repoKey(repository.owner, repository.name).toLowerCase()))
    .filter((summary): summary is GithubRepoCommandSummary => summary !== undefined)
  const worstState = loadedSummaries.reduce<GithubRepoHealthState>(
    (current, summary) => worseState(current, summary.state),
    loadedSummaries.length > 0 ? 'healthy' : 'unknown',
  )
  const severity = loadedSummaries.reduce<GithubRepoCommandSeverity>(
    (current, summary) => worseSeverity(current, summary.severity),
    loadedSummaries.length > 0 ? 'ok' : 'muted',
  )
  const topAttentionSignals = loadedSummaries
    .flatMap((summary) =>
      summary.signals
        .filter((candidate) => candidate.severity !== 'muted')
        .map((candidate) => ({ ...candidate, repositoryKey: summary.fullName })),
    )
    .sort((left, right) => severityRank[left.severity] - severityRank[right.severity])
    .slice(0, 5)

  return {
    projectId,
    projectName,
    boundRepoCount: repositories.length,
    loadedRepoCount: loadedSummaries.length,
    worstState,
    severity,
    latestCiStatus: loadedSummaries[0] ? latestCiStatus(loadedSummaries[0]) : 'Unavailable',
    dirtyLocalRepoCount: loadedSummaries.filter((summary) => summary.localGit.data?.dirty).length,
    openPullRequests: loadedSummaries.reduce(
      (total, summary) => total + summary.counts.openPullRequests,
      0,
    ),
    openIssues: loadedSummaries.reduce((total, summary) => total + summary.counts.openIssues, 0),
    topAttentionSignals,
    permissionGaps: loadedSummaries.flatMap((summary) => summary.permissionGaps),
  }
}

export function sortGithubSummariesByAttention(summaries: GithubRepoCommandSummary[]) {
  return summaries
    .slice()
    .sort((left, right) => {
      const severityDelta = severityRank[left.severity] - severityRank[right.severity]

      if (severityDelta !== 0) {
        return severityDelta
      }

      const stateDelta = stateRank[left.state] - stateRank[right.state]

      if (stateDelta !== 0) {
        return stateDelta
      }

      return right.fetchedAt.localeCompare(left.fetchedAt)
    })
}

