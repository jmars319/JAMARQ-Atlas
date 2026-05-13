import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  GithubApiResponse,
  GithubRepositorySource,
  GithubRepositorySummary,
} from '../services/githubIntegration'
import { fetchGithubJson } from '../services/githubIntegration'

interface RepositoryState {
  data: GithubRepositorySummary[]
  page: number
  hasNextPage: boolean
  loading: boolean
  error: GithubApiResponse<GithubRepositorySummary[]>['error']
  permission: GithubApiResponse<GithubRepositorySummary[]>['permission']
}

function repositoriesPath(source: GithubRepositorySource, page: number) {
  const params = new URLSearchParams({
    source,
    page: String(page),
    per_page: '20',
  })

  return `/api/github/repos?${params.toString()}`
}

export function useGithubRepositories(source: GithubRepositorySource) {
  const [state, setState] = useState<RepositoryState>({
    data: [],
    page: 1,
    hasNextPage: false,
    loading: false,
    error: null,
    permission: 'unknown',
  })
  const requestKey = useMemo(() => `repositories/${source}`, [source])

  const loadPage = useCallback(
    async (
      page: number,
      mode: 'replace' | 'append',
      signal?: AbortSignal,
      cache: 'default' | 'reload' = 'default',
    ) => {
      setState((current) => ({ ...current, loading: true }))

      try {
        const response = await fetchGithubJson<GithubApiResponse<GithubRepositorySummary[]>>(
          repositoriesPath(source, page),
          signal,
          { cache },
        )

        setState((current) => ({
          data:
            mode === 'append' && response.data
              ? [...current.data, ...response.data]
              : response.data ?? [],
          page,
          hasNextPage: response.pageInfo.hasNextPage,
          loading: false,
          error: response.error,
          permission: response.permission,
        }))
      } catch (error) {
        if (signal?.aborted) {
          return
        }

        setState((current) => ({
          ...current,
          loading: false,
          error: {
            type: 'github-unavailable',
            status: 503,
            resource: 'repos',
            message: error instanceof Error ? error.message : 'Unable to reach Atlas GitHub API.',
          },
          permission: 'unknown',
        }))
      }
    },
    [source],
  )

  useEffect(() => {
    const controller = new AbortController()
    setState({
      data: [],
      page: 1,
      hasNextPage: false,
      loading: true,
      error: null,
      permission: 'unknown',
    })
    void loadPage(1, 'replace', controller.signal)

    return () => controller.abort()
  }, [loadPage, requestKey])

  const loadMore = useCallback(() => {
    if (!state.loading && state.hasNextPage) {
      void loadPage(state.page + 1, 'append')
    }
  }, [loadPage, state.hasNextPage, state.loading, state.page])

  return {
    ...state,
    reload: () => loadPage(1, 'replace', undefined, 'reload'),
    loadMore,
  }
}
