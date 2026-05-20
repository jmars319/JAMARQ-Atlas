import { AlertTriangle, GitBranch, GitPullRequest, RefreshCw, ShieldAlert } from 'lucide-react'
import type { GithubProjectCommandRollup } from '../services/githubCommand'
import type { GithubApiError, GithubFetchCacheMetadata } from '../services/githubIntegration'
import { GitHubCacheMeta } from './GitHubCacheMeta'

interface GitHubProjectCommandRollupProps {
  rollup: GithubProjectCommandRollup
  loading: boolean
  error: GithubApiError | null
  cacheMetadata: GithubFetchCacheMetadata | null
  onRefresh: () => void
}

export function GitHubProjectCommandRollupPanel({
  rollup,
  loading,
  error,
  cacheMetadata,
  onRefresh,
}: GitHubProjectCommandRollupProps) {
  return (
    <section className="github-project-rollup" aria-label="Project GitHub command rollup">
      <div className="resource-panel-header">
        <div>
          <strong>{rollup.projectName}</strong>
          <span>Project-level GitHub rollup / advisory only</span>
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

      <div className="github-health-grid is-compact">
        <div>
          <GitBranch size={16} />
          <strong>{rollup.boundRepoCount}</strong>
          <span>Connected repos</span>
        </div>
        <div>
          <ShieldAlert size={16} />
          <strong>{rollup.worstState}</strong>
          <span>{rollup.severity}</span>
        </div>
        <div>
          <ShieldAlert size={16} />
          <strong>{rollup.latestCiStatus}</strong>
          <span>Latest CI/check</span>
        </div>
        <div>
          <GitBranch size={16} />
          <strong>{rollup.dirtyLocalRepoCount}</strong>
          <span>Dirty local clones</span>
        </div>
        <div>
          <GitPullRequest size={16} />
          <strong>{rollup.openPullRequests}</strong>
          <span>Open PRs</span>
        </div>
        <div>
          <AlertTriangle size={16} />
          <strong>{rollup.openIssues}</strong>
          <span>Open issues</span>
        </div>
      </div>

      {rollup.topAttentionSignals.length > 0 ? (
        <ol className="github-command-signals">
          {rollup.topAttentionSignals.map((signal) => (
            <li key={`${signal.repositoryKey}-${signal.id}`}>
              <span className={`review-chip review-chip-${signal.severity}`}>
                {signal.severity}
              </span>
              <strong>{signal.title}</strong>
              <p>
                {signal.repositoryKey}: {signal.detail}
              </p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="empty-state">No loaded connected repository needs GitHub attention.</p>
      )}
    </section>
  )
}
