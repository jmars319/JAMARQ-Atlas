import { GitBranch, HardDrive, RefreshCw, TriangleAlert } from 'lucide-react'
import { formatDateTimeLabel } from '../domain/atlas'
import { useLocalGitStatus } from '../hooks/useLocalGitStatus'

function aheadBehindLabel(ahead: number | null, behind: number | null) {
  if (ahead === null && behind === null) {
    return 'No upstream'
  }

  const parts = [
    ahead && ahead > 0 ? `${ahead} ahead` : '',
    behind && behind > 0 ? `${behind} behind` : '',
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' / ') : 'Synced with upstream'
}

export function LocalGitStatusInline({
  owner,
  repo,
  compact = false,
}: {
  owner: string
  repo: string
  compact?: boolean
}) {
  const { response, loading, error } = useLocalGitStatus(owner, repo)
  const status = response?.data

  if (loading && !response) {
    return (
      <div className="github-binding-state local-git-status">
        <RefreshCw size={15} />
        <span>Checking local clone</span>
      </div>
    )
  }

  if (!status) {
    return (
      <div className="github-binding-state local-git-status is-unbound">
        <TriangleAlert size={15} />
        <span>{error || 'No local clone status available'}</span>
      </div>
    )
  }

  const cleanliness = status.dirty ? `${status.changedFiles} changed` : 'clean'

  return (
    <div className="github-binding-state local-git-status">
      <HardDrive size={15} />
      <span>
        Local {status.branch} / {cleanliness} /{' '}
        {aheadBehindLabel(status.ahead, status.behind)}
      </span>
      {!compact && status.latestCommit ? (
        <span className="local-git-detail">
          {status.latestCommit.shortSha} {formatDateTimeLabel(status.latestCommit.date)}
        </span>
      ) : null}
      {!compact ? (
        <span className="local-git-detail">
          <GitBranch size={13} />
          {status.path}
        </span>
      ) : null}
    </div>
  )
}
