import { useCallback, useEffect, useMemo, useState } from 'react'
import type { GithubRepoCommandSummary } from '../services/githubCommand'
import type { GithubApiResponse, GithubFetchCacheMetadata } from '../services/githubIntegration'
import { fetchGithubJsonWithMetadata } from '../services/githubIntegration'

interface CommandSummaryState {
  data: GithubRepoCommandSummary[]
  loading: boolean
  error: GithubApiResponse<GithubRepoCommandSummary[]>['error']
  permission: GithubApiResponse<GithubRepoCommandSummary[]>['permission']
  cacheMetadata: GithubFetchCacheMetadata | null
}

function normalizeRepoKeys(repoKeys: string[]) {
  return repoKeys
    .map((repoKey) => repoKey.trim())
    .filter((repoKey) => /^[^/]+\/[^/]+$/.test(repoKey))
    .filter(
      (repoKey, index, keys) =>
        keys.findIndex((candidate) => candidate.toLowerCase() === repoKey.toLowerCase()) === index,
    )
}

function commandSummariesPath(repoKeys: string[]) {
  const params = new URLSearchParams({ repos: repoKeys.join(',') })

  return `/api/github/command-summaries?${params.toString()}`
}

export function useGithubCommandSummaries(repoKeys: string[]) {
  const normalizedRepoKeys = useMemo(() => normalizeRepoKeys(repoKeys), [repoKeys])
  const requestKey = normalizedRepoKeys.join(',')
  const [state, setState] = useState<CommandSummaryState>({
    data: [],
    loading: false,
    error: null,
    permission: 'unknown',
    cacheMetadata: null,
  })

  const load = useCallback(
    async (signal?: AbortSignal, cache: 'default' | 'reload' = 'default') => {
      if (normalizedRepoKeys.length === 0) {
        setState({
          data: [],
          loading: false,
          error: null,
          permission: 'available',
          cacheMetadata: null,
        })
        return
      }

      setState((current) => ({ ...current, loading: true }))

      try {
        const result = await fetchGithubJsonWithMetadata<
          GithubApiResponse<GithubRepoCommandSummary[]>
        >(commandSummariesPath(normalizedRepoKeys), signal, { cache })
        const response = result.value

        setState({
          data: response.data ?? [],
          loading: false,
          error: response.error,
          permission: response.permission,
          cacheMetadata: {
            ...result.metadata,
            pageInfo: response.pageInfo,
          },
        })
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
            resource: 'command-summaries',
            message: error instanceof Error ? error.message : 'Unable to load command summaries.',
          },
          permission: 'unknown',
          cacheMetadata: current.cacheMetadata,
        }))
      }
    },
    [normalizedRepoKeys],
  )

  useEffect(() => {
    const controller = new AbortController()

    void load(controller.signal)

    return () => controller.abort()
  }, [load, requestKey])

  return {
    ...state,
    repoKeys: normalizedRepoKeys,
    reload: () => load(undefined, 'reload'),
  }
}

