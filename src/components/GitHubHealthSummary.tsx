import { AlertTriangle, GitCommitHorizontal, GitPullRequest, ShieldCheck } from 'lucide-react'
import { formatDateTimeLabel } from '../domain/atlas'
import { useGithubResource } from '../hooks/useGithubResource'
import { deriveGithubHealthSummary } from '../services/githubHealth'

export interface GitHubHealthRepository {
  owner: string
  name: string
  defaultBranch?: string
}

interface GitHubHealthSummaryProps {
  repository: GitHubHealthRepository
  lastVerified?: string
  lastDeployed?: string
  compact?: boolean
}

function countLabel(value: number | null) {
  return value === null ? 'Unknown' : String(value)
}

export function GitHubHealthSummary({
  repository,
  lastVerified = '',
  lastDeployed = '',
  compact = false,
}: GitHubHealthSummaryProps) {
  const base = {
    owner: repository.owner,
    repo: repository.name,
    ref: repository.defaultBranch,
  }
  const commits = useGithubResource({ ...base, resource: 'commits' })
  const pulls = useGithubResource({ ...base, resource: 'pulls' })
  const issues = useGithubResource({ ...base, resource: 'issues' })
  const workflowRuns = useGithubResource({ ...base, resource: 'workflow-runs' })
  const releases = useGithubResource({ ...base, resource: 'releases' })
  const deployments = useGithubResource({ ...base, resource: 'deployments' })
  const checks = useGithubResource({ ...base, resource: 'checks' })
  const summary = deriveGithubHealthSummary({
    commits: commits.data ?? [],
    pulls: pulls.data ?? [],
    issues: issues.data ?? [],
    workflowRuns: workflowRuns.data ?? [],
    releases: releases.data ?? [],
    deployments: deployments.data ?? [],
    checks: checks.data ?? [],
    lastVerified,
    lastDeployed,
    errors: [
      commits.error,
      pulls.error,
      issues.error,
      workflowRuns.error,
      releases.error,
      deployments.error,
      checks.error,
    ],
  })
  const loading =
    commits.loading ||
    pulls.loading ||
    issues.loading ||
    workflowRuns.loading ||
    releases.loading ||
    deployments.loading ||
    checks.loading

  return (
    <section className="github-health-summary" aria-label="GitHub health summary">
      <div className="resource-panel-header">
        <div>
          <strong>{repository.owner}/{repository.name}</strong>
          <span>Read-only health summary from latest loaded GitHub pages</span>
        </div>
        {loading ? <span className="resource-pill state-warning">Loading</span> : null}
      </div>

      <div className={compact ? 'github-health-grid is-compact' : 'github-health-grid'}>
        <div>
          <GitCommitHorizontal size={16} />
          <strong>{summary.latestCommit?.shortSha ?? 'Unknown'}</strong>
          <span>{summary.latestCommit?.message.split('\n')[0] ?? 'Latest commit'}</span>
        </div>
        <div>
          <GitCommitHorizontal size={16} />
          <strong>{countLabel(summary.commitsSinceLastVerified)}</strong>
          <span>Commits since verified</span>
        </div>
        <div>
          <GitCommitHorizontal size={16} />
          <strong>{countLabel(summary.commitsSinceLastDeployed)}</strong>
          <span>Commits since deployed</span>
        </div>
        <div>
          <GitPullRequest size={16} />
          <strong>{summary.openPullRequests}</strong>
          <span>Open PRs</span>
        </div>
        <div>
          <AlertTriangle size={16} />
          <strong>{summary.openIssues}</strong>
          <span>Open issues</span>
        </div>
        <div>
          <ShieldCheck size={16} />
          <strong>{summary.latestWorkflowResult}</strong>
          <span>Latest workflow</span>
        </div>
        <div>
          <ShieldCheck size={16} />
          <strong>{summary.latestCheckResult}</strong>
          <span>Latest check</span>
        </div>
        <div>
          <GitCommitHorizontal size={16} />
          <strong>
            {summary.latestRelease?.tagName ??
              summary.latestDeployment?.shortSha ??
              'Unavailable'}
          </strong>
          <span>
            {summary.latestRelease
              ? `Release ${formatDateTimeLabel(summary.latestRelease.publishedAt)}`
              : summary.latestDeployment
                ? `Deployment ${formatDateTimeLabel(summary.latestDeployment.updatedAt)}`
                : 'Release/deploy'}
          </span>
        </div>
      </div>

      {summary.permissionGaps.length > 0 ? (
        <div className="github-health-warning">
          <AlertTriangle size={16} />
          <div>
            <strong>Permission gaps</strong>
            <span>{summary.permissionGaps.join(', ')}</span>
          </div>
        </div>
      ) : null}

      <p className="empty-state">
        This summary is advisory. It does not change Atlas status, Dispatch readiness,
        verification, Planning, Writing, or Reports.
      </p>
    </section>
  )
}
