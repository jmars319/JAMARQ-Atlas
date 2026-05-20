import { useEffect, useMemo, useState } from 'react'
import type {
  GithubApiResponse,
  GithubFetchCacheMetadata,
  GithubIssueCommandDetail,
  GithubPullRequestCommandDetail,
} from '../services/githubIntegration'
import { fetchGithubJsonWithMetadata } from '../services/githubIntegration'

export type GithubCommandDetailKind = 'issues' | 'pulls'

type GithubCommandDetailData = {
  issues: GithubIssueCommandDetail
  pulls: GithubPullRequestCommandDetail
}

interface GithubCommandDetailState<K extends GithubCommandDetailKind> {
  data: GithubCommandDetailData[K] | null
  loading: boolean
  error: GithubApiResponse<GithubCommandDetailData[K]>['error']
  permission: GithubApiResponse<GithubCommandDetailData[K]>['permission']
  cacheMetadata: GithubFetchCacheMetadata | null
}

function commandDetailPath({
  owner,
  repo,
  kind,
  number,
}: {
  owner: string
  repo: string
  kind: GithubCommandDetailKind
  number: number
}) {
  return `/api/github/repos/${owner}/${repo}/${kind}/${number}/command-detail`
}

export function useGithubCommandDetail<K extends GithubCommandDetailKind>({
  owner,
  repo,
  kind,
  number,
}: {
  owner: string
  repo: string
  kind: K
  number: number | null
}) {
  const disabled = !owner || !repo || !number
  const [state, setState] = useState<GithubCommandDetailState<K>>({
    data: null,
    loading: false,
    error: null,
    permission: 'unknown',
    cacheMetadata: null,
  })
  const requestKey = useMemo(
    () => `${owner}/${repo}/${kind}/${number ?? ''}`,
    [kind, number, owner, repo],
  )

  useEffect(() => {
    if (disabled) {
      return
    }

    const controller = new AbortController()

    void fetchGithubJsonWithMetadata<GithubApiResponse<GithubCommandDetailData[K]>>(
      commandDetailPath({ owner, repo, kind, number }),
      controller.signal,
    )
      .then((result) => {
        setState({
          data: result.value.data,
          loading: false,
          error: result.value.error,
          permission: result.value.permission,
          cacheMetadata: {
            ...result.metadata,
            pageInfo: result.value.pageInfo,
          },
        })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setState((current) => ({
          ...current,
          loading: false,
          error: {
            type: 'github-unavailable',
            status: 503,
            resource: `${kind}-command-detail`,
            message: error instanceof Error ? error.message : 'Unable to load GitHub detail.',
          },
          permission: 'unknown',
          cacheMetadata: current.cacheMetadata,
        }))
      })

    return () => controller.abort()
  }, [disabled, kind, number, owner, repo, requestKey])

  return disabled
    ? {
        data: null,
        loading: false,
        error: null,
        permission: 'unknown' as const,
        cacheMetadata: null,
      }
    : { ...state, loading: state.loading || (!state.data && !state.error) }
}
