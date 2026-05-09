import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  GithubApiResponse,
  GithubCommit,
  GithubDeployment,
  GithubIssue,
  GithubPullRequest,
  GithubRelease,
  GithubRepositorySummary,
  GithubResourceName,
  GithubWorkflow,
  GithubWorkflowRun,
  GithubCheckRun,
} from '../services/githubIntegration'
import { fetchGithubJson } from '../services/githubIntegration'

type GithubResourceData = {
  overview: GithubRepositorySummary
  commits: GithubCommit[]
  pulls: GithubPullRequest[]
  issues: GithubIssue[]
  workflows: GithubWorkflow[]
  'workflow-runs': GithubWorkflowRun[]
  releases: GithubRelease[]
  deployments: GithubDeployment[]
  checks: GithubCheckRun[]
}

interface UseGithubResourceOptions {
  owner: string
  repo: string
  resource: GithubResourceName
  ref?: string
}

interface ResourceState<T> {
  data: T | null
  page: number
  hasNextPage: boolean
  loading: boolean
  error: GithubApiResponse<T>['error']
  permission: GithubApiResponse<T>['permission']
}

function resourcePath({
  owner,
  repo,
  resource,
  ref,
  page,
}: UseGithubResourceOptions & { page: number }) {
  const apiResource = resource === 'overview' ? '' : `/${resource}`
  const params = new URLSearchParams({
    page: String(page),
    per_page: '20',
  })

  if (resource === 'checks' && ref) {
    params.set('ref', ref)
  }

  return `/api/github/repos/${owner}/${repo}${apiResource}?${params.toString()}`
}

function appendData<T>(existing: T | null, next: T | null): T | null {
  if (Array.isArray(existing) && Array.isArray(next)) {
    return [...existing, ...next] as T
  }

  return next
}

export function useGithubResource<K extends GithubResourceName>(
  options: UseGithubResourceOptions & { resource: K },
) {
  const { owner, repo, resource, ref } = options
  const [state, setState] = useState<ResourceState<GithubResourceData[K]>>({
    data: null,
    page: 1,
    hasNextPage: false,
    loading: false,
    error: null,
    permission: 'unknown',
  })

  const requestKey = useMemo(
    () => `${owner}/${repo}/${resource}/${ref ?? ''}`,
    [owner, repo, resource, ref],
  )

  const loadPage = useCallback(
    async (page: number, mode: 'replace' | 'append', signal?: AbortSignal) => {
      setState((current) => ({ ...current, loading: true }))

      try {
        const response = await fetchGithubJson<GithubApiResponse<GithubResourceData[K]>>(
          resourcePath({ owner, repo, resource, ref, page }),
          signal,
        )

        setState((current) => ({
          data: mode === 'append' ? appendData(current.data, response.data) : response.data,
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
            resource,
            message: error instanceof Error ? error.message : 'Unable to reach Atlas GitHub API.',
          },
          permission: 'unknown',
        }))
      }
    },
    [owner, ref, repo, resource],
  )

  useEffect(() => {
    const controller = new AbortController()
    setState({
      data: null,
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
    reload: () => loadPage(1, 'replace'),
    loadMore,
  }
}
