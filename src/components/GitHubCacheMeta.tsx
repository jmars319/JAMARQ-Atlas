import { RefreshCw } from 'lucide-react'
import { formatDateTimeLabel } from '../domain/atlas'
import type { GithubFetchCacheMetadata } from '../services/githubIntegration'

export function GitHubCacheMeta({
  metadata,
  page,
  hasNextPage,
  onReload,
  loading = false,
}: {
  metadata: GithubFetchCacheMetadata | null
  page: number
  hasNextPage: boolean
  onReload?: () => void
  loading?: boolean
}) {
  const pageInfo = metadata?.pageInfo
  const pageLabel = pageInfo
    ? `Page ${pageInfo.currentPage}${pageInfo.hasNextPage ? `, next ${pageInfo.nextPage}` : ', final'}`
    : `Page ${page}${hasNextPage ? ', more available' : ', final'}`
  const cacheLabel = metadata
    ? metadata.cacheHit
      ? 'cache hit'
      : metadata.cacheMode === 'reload'
        ? 'reloaded'
        : 'fresh fetch'
    : 'not fetched'

  return (
    <div className="github-cache-meta">
      <span>{cacheLabel}</span>
      <span>{metadata?.fetchedAt ? `Fetched ${formatDateTimeLabel(metadata.fetchedAt)}` : pageLabel}</span>
      <span>{pageLabel}</span>
      {metadata?.expiresAt ? <span>Expires {formatDateTimeLabel(metadata.expiresAt)}</span> : null}
      {onReload ? (
        <button type="button" onClick={onReload} disabled={loading}>
          <RefreshCw size={13} />
          Reload
        </button>
      ) : null}
    </div>
  )
}
