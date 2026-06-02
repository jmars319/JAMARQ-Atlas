import { AlertTriangle, GitBranch, RefreshCcw } from 'lucide-react'
import type { useGithubRepositories } from '../../hooks/useGithubRepositories'
import { GitHubCacheMeta } from '../GitHubCacheMeta'

interface SourceNoticeProps {
  label: string
  loading: boolean
  error: ReturnType<typeof useGithubRepositories>['error']
  count: number
  cacheMetadata: ReturnType<typeof useGithubRepositories>['cacheMetadata']
  page: number
  hasNextPage: boolean
  onReload: () => void
}

export function SourceNotice({
  label,
  loading,
  error,
  count,
  cacheMetadata,
  page,
  hasNextPage,
  onReload,
}: SourceNoticeProps) {
  if (loading) {
    return (
      <div className="github-source-state">
        <RefreshCcw size={15} />
        <span>{label} loading...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="github-error">
        <AlertTriangle size={16} />
        <div>
          <strong>{label} unavailable</strong>
          <span>{error.message}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="github-source-state">
      <GitBranch size={15} />
      <span>
        {label}: {count} repos
      </span>
      <GitHubCacheMeta
        metadata={cacheMetadata}
        page={page}
        hasNextPage={hasNextPage}
        onReload={onReload}
        loading={loading}
      />
    </div>
  )
}


