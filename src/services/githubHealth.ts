import type {
  GithubApiError,
  GithubCheckRun,
  GithubCommit,
  GithubDeployment,
  GithubIssue,
  GithubPullRequest,
  GithubRelease,
  GithubWorkflowRun,
} from './githubIntegration'

export interface GithubHealthSummaryInput {
  commits: GithubCommit[]
  pulls: GithubPullRequest[]
  issues: GithubIssue[]
  workflowRuns: GithubWorkflowRun[]
  releases: GithubRelease[]
  deployments: GithubDeployment[]
  checks: GithubCheckRun[]
  lastVerified: string
  lastDeployed: string
  errors: Array<GithubApiError | null>
}

export interface GithubHealthSummary {
  latestCommit: GithubCommit | null
  commitsSinceLastVerified: number | null
  commitsSinceLastDeployed: number | null
  openPullRequests: number
  openIssues: number
  latestWorkflowResult: string
  latestRelease: GithubRelease | null
  latestDeployment: GithubDeployment | null
  latestCheckResult: string
  permissionGaps: string[]
}

function parseDate(value: string | null | undefined) {
  if (!value) {
    return null
  }

  const parsed = new Date(value.includes('T') ? value : `${value}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function countSince(commits: GithubCommit[], value: string) {
  const cutoff = parseDate(value)

  if (!cutoff) {
    return null
  }

  return commits.filter((commit) => {
    const date = parseDate(commit.date)
    return date ? date > cutoff : false
  }).length
}

function latestByDate<T>(items: T[], getDate: (item: T) => string | null | undefined) {
  return (
    items
      .slice()
      .sort((left, right) => {
        const leftDate = parseDate(getDate(left))?.getTime() ?? 0
        const rightDate = parseDate(getDate(right))?.getTime() ?? 0
        return rightDate - leftDate
      })[0] ?? null
  )
}

export function deriveGithubHealthSummary({
  commits,
  pulls,
  issues,
  workflowRuns,
  releases,
  deployments,
  checks,
  lastVerified,
  lastDeployed,
  errors,
}: GithubHealthSummaryInput): GithubHealthSummary {
  const latestWorkflow = latestByDate(workflowRuns, (run) => run.updatedAt)
  const latestCheck = latestByDate(checks, (check) => check.completedAt ?? check.startedAt)

  return {
    latestCommit: latestByDate(commits, (commit) => commit.date),
    commitsSinceLastVerified: countSince(commits, lastVerified),
    commitsSinceLastDeployed: countSince(commits, lastDeployed),
    openPullRequests: pulls.filter((pull) => pull.state === 'open').length,
    openIssues: issues.filter((issue) => issue.state === 'open').length,
    latestWorkflowResult: latestWorkflow
      ? latestWorkflow.conclusion ?? latestWorkflow.status
      : 'Unavailable',
    latestRelease: latestByDate(releases, (release) => release.publishedAt ?? release.createdAt),
    latestDeployment: latestByDate(deployments, (deployment) => deployment.updatedAt),
    latestCheckResult: latestCheck ? latestCheck.conclusion ?? latestCheck.status : 'Unavailable',
    permissionGaps: errors
      .filter((error): error is GithubApiError => error !== null)
      .map((error) => `${error.resource}: ${error.type}`),
  }
}
