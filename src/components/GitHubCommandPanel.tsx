import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  RefreshCw,
  ShieldAlert,
  SquareArrowOutUpRight,
  Tag,
} from 'lucide-react'
import { formatDateTimeLabel } from '../domain/atlas'
import type { GithubRepoCommandSummary } from '../services/githubCommand'
import type { GithubApiError, GithubFetchCacheMetadata } from '../services/githubIntegration'
import { GitHubCacheMeta } from './GitHubCacheMeta'

interface GitHubCommandPanelProps {
  summary: GithubRepoCommandSummary | null
  loading: boolean
  error: GithubApiError | null
  cacheMetadata: GithubFetchCacheMetadata | null
  onRefresh: () => void
  compact?: boolean
}

function stateClass(value: string) {
  return `state-${value.replace(/\s+/g, '-').toLowerCase()}`
}

function localGitLabel(summary: GithubRepoCommandSummary) {
  if (summary.localGit.status !== 'available' || !summary.localGit.data) {
    return summary.localGit.status
  }

  const { data } = summary.localGit
  const dirty = data.dirty ? `${data.changedFiles} changed` : 'clean'
  const sync =
    data.ahead !== null && data.behind !== null
      ? `${data.ahead} ahead / ${data.behind} behind`
      : 'no upstream count'

  return `${data.branch} / ${dirty} / ${sync}`
}

function resultLabel(summary: GithubRepoCommandSummary) {
  const workflow = summary.latestWorkflowRun
  const check = summary.latestCheckRun

  if (workflow) {
    return workflow.conclusion ?? workflow.status
  }

  if (check) {
    return check.conclusion ?? check.status
  }

  return 'Unavailable'
}

function failureLabel(summary: GithubRepoCommandSummary) {
  const failure = summary.failureExplanation

  if (!failure) {
    return 'No failed workflow explanation loaded.'
  }

  return [failure.workflowName, failure.jobName, failure.stepName, failure.conclusion]
    .filter(Boolean)
    .join(' / ')
}

export function GitHubCommandPanel({
  summary,
  loading,
  error,
  cacheMetadata,
  onRefresh,
  compact = false,
}: GitHubCommandPanelProps) {
  if (!summary) {
    return (
      <section className="github-command-panel" aria-label="GitHub command summary">
        <div className="resource-panel-header">
          <div>
            <strong>GitHub command summary</strong>
            <span>{loading ? 'Loading read-only evidence...' : 'No command summary loaded.'}</span>
          </div>
          <button type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
        {error ? (
          <div className="github-error">
            <AlertTriangle size={16} />
            <div>
              <strong>{error.type}</strong>
              <span>{error.message}</span>
            </div>
          </div>
        ) : (
          <p className="empty-state">Command summary evidence is unavailable.</p>
        )}
      </section>
    )
  }

  const activeSignals = summary.signals.filter((signal) => signal.severity !== 'muted')
  const mutedSignals = summary.signals.filter((signal) => signal.severity === 'muted')

  return (
    <section className="github-command-panel" aria-label="GitHub command summary">
      <div className="resource-panel-header">
        <div>
          <strong>{summary.fullName}</strong>
          <span>Command summary / read-only evidence</span>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading}>
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <GitHubCacheMeta
        metadata={cacheMetadata}
        page={cacheMetadata?.pageInfo?.currentPage ?? 1}
        hasNextPage={false}
      />

      {error ? (
        <div className="github-error">
          <AlertTriangle size={16} />
          <div>
            <strong>{error.type}</strong>
            <span>{error.message}</span>
          </div>
        </div>
      ) : null}

      <div className={compact ? 'github-health-grid is-compact' : 'github-health-grid'}>
        <div>
          <ShieldAlert size={16} />
          <strong className={stateClass(summary.severity)}>{summary.state}</strong>
          <span>{summary.severity}</span>
        </div>
        <div>
          <CheckCircle2 size={16} />
          <strong className={stateClass(resultLabel(summary))}>{resultLabel(summary)}</strong>
          <span>Latest CI/check</span>
        </div>
        <div>
          <GitCommitHorizontal size={16} />
          <strong>{summary.latestCommit?.shortSha ?? 'Unknown'}</strong>
          <span>{summary.latestCommit?.message.split('\n')[0] ?? 'Latest commit'}</span>
        </div>
        <div>
          <GitBranch size={16} />
          <strong>{localGitLabel(summary)}</strong>
          <span>Local Git</span>
        </div>
        <div>
          <GitPullRequest size={16} />
          <strong>{summary.counts.openPullRequests}</strong>
          <span>Open PRs</span>
        </div>
        <div>
          <AlertTriangle size={16} />
          <strong>{summary.counts.openIssues}</strong>
          <span>Open issues</span>
        </div>
        <div>
          <Tag size={16} />
          <strong>{summary.latestRelease?.tagName ?? 'Unavailable'}</strong>
          <span>Latest release</span>
        </div>
        <div>
          <GitBranch size={16} />
          <strong>
            {summary.latestDeployment?.environment ??
              `${summary.counts.branches} branches / ${summary.counts.tags} tags`}
          </strong>
          <span>Deploy / refs</span>
        </div>
      </div>

      {summary.failureExplanation ? (
        <div className="github-command-explanation">
          <ShieldAlert size={16} />
          <div>
            <strong>
              {summary.failureExplanation.stale ? 'Historical failure' : 'Failure explanation'}
            </strong>
            <span>{failureLabel(summary)}</span>
            <small>
              {[
                summary.failureExplanation.commitSha?.slice(0, 7),
                formatDateTimeLabel(summary.failureExplanation.completedAt),
                summary.failureExplanation.staleReason,
              ]
                .filter(Boolean)
                .join(' / ')}
            </small>
            {summary.failureExplanation.htmlUrl ? (
              <a href={summary.failureExplanation.htmlUrl} target="_blank" rel="noreferrer">
                <SquareArrowOutUpRight size={14} />
                GitHub evidence
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="github-command-signal-grid">
        <div>
          <h3>Attention Signals</h3>
          {activeSignals.length > 0 ? (
            <ol className="github-command-signals">
              {activeSignals.slice(0, 5).map((signal) => (
                <li key={signal.id}>
                  <span className={`review-chip review-chip-${signal.severity}`}>
                    {signal.severity}
                  </span>
                  <strong>{signal.title}</strong>
                  <p>{signal.detail}</p>
                  <small>{signal.evidence.slice(0, 3).join(' / ')}</small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">No active attention signals for the loaded evidence.</p>
          )}
        </div>
        <div>
          <h3>Data Gaps</h3>
          {summary.permissionGaps.length > 0 ? (
            <ol className="github-command-signals">
              {summary.permissionGaps.map((gap) => (
                <li key={`${gap.resource}-${gap.type}`}>
                  <span className="review-chip review-chip-medium">{gap.resource}</span>
                  <strong>{gap.type}</strong>
                  <p>{gap.message}</p>
                </li>
              ))}
            </ol>
          ) : mutedSignals.length > 0 ? (
            <ol className="github-command-signals">
              {mutedSignals.slice(0, 4).map((signal) => (
                <li key={signal.id}>
                  <span className="review-chip">{signal.category}</span>
                  <strong>{signal.title}</strong>
                  <p>{signal.detail}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">No permission gaps reported.</p>
          )}
        </div>
      </div>

      <p className="empty-state">
        Advisory only. Atlas does not mutate project status, readiness, verification, dispatch, or
        GitHub state from this summary.
      </p>
    </section>
  )
}

