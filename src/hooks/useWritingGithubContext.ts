import { useEffect, useMemo, useState } from 'react'
import type { GithubRepositoryLink } from '../domain/atlas'
import type { WritingContextGithub } from '../domain/writing'
import type {
  GithubApiResponse,
  GithubCommit,
  GithubRepositorySummary,
} from '../services/githubIntegration'
import { fetchGithubJson } from '../services/githubIntegration'

interface WritingGithubContextState {
  context: WritingContextGithub
  loading: boolean
}

function emptyContext(warnings: string[] = ['No repository binding is available for writing context.']) {
  return {
    repository: null,
    overview: null,
    latestCommits: [],
    warnings,
  } satisfies WritingContextGithub
}

function repoPath(repository: GithubRepositoryLink, resource = '') {
  const owner = encodeURIComponent(repository.owner)
  const repo = encodeURIComponent(repository.name)
  const params = new URLSearchParams({
    page: '1',
    per_page: resource === 'commits' ? '5' : '20',
  })

  return `/api/github/repos/${owner}/${repo}${resource ? `/${resource}` : ''}?${params.toString()}`
}

export function useWritingGithubContext(repository: GithubRepositoryLink | undefined) {
  const repositoryKey = useMemo(
    () => (repository ? `${repository.owner}/${repository.name}` : ''),
    [repository],
  )
  const [state, setState] = useState<WritingGithubContextState>({
    context: emptyContext(),
    loading: false,
  })

  useEffect(() => {
    if (!repository) {
      return
    }

    const activeRepository = repository
    const controller = new AbortController()

    async function loadGithubContext() {
      setState({
        context: emptyContext([`Loading GitHub context for ${repositoryKey}.`]),
        loading: true,
      })

      try {
        const [overviewResponse, commitsResponse] = await Promise.all([
          fetchGithubJson<GithubApiResponse<GithubRepositorySummary>>(
            repoPath(activeRepository),
            controller.signal,
          ),
          fetchGithubJson<GithubApiResponse<GithubCommit[]>>(
            repoPath(activeRepository, 'commits'),
            controller.signal,
          ),
        ])

        if (controller.signal.aborted) {
          return
        }

        const warnings = [overviewResponse.error?.message, commitsResponse.error?.message].filter(
          Boolean,
        ) as string[]
        const overview = overviewResponse.data

        setState({
          loading: false,
          context: {
            repository: repositoryKey,
            overview: overview
              ? {
                  visibility: overview.private ? 'private' : overview.visibility,
                  defaultBranch: overview.defaultBranch,
                  language: overview.language,
                  pushedAt: overview.pushedAt,
                  updatedAt: overview.updatedAt,
                }
              : null,
            latestCommits: (commitsResponse.data ?? []).slice(0, 5).map((commit) => ({
              shortSha: commit.shortSha,
              message: commit.message.split('\n')[0] || 'Commit',
              author: commit.author,
              date: commit.date,
            })),
            warnings:
              warnings.length > 0
                ? warnings
                : ['GitHub snippets are advisory and were included for review only.'],
          },
        })
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        setState({
          loading: false,
          context: emptyContext([
            error instanceof Error ? error.message : 'Unable to load GitHub writing context.',
          ]),
        })
      }
    }

    void Promise.resolve().then(loadGithubContext)

    return () => controller.abort()
  }, [repository, repositoryKey])

  return repository ? state : { context: emptyContext(), loading: false }
}
