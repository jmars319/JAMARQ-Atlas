import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  handleInstalledRepos,
  normalizeGithubResource,
  summarizeConfiguredRepoFailures,
} from '../server/githubApi'
import {
  clearGithubRequestCache,
  fetchGithubJson,
  fetchGithubJsonWithMetadata,
  getGithubRequestCacheMetadata,
} from '../src/services/githubIntegration'

afterEach(() => {
  clearGithubRequestCache()
  vi.unstubAllGlobals()
})

describe('GitHub API normalization', () => {
  it('normalizes branch and tag resources for repo deep dive', () => {
    const branches = normalizeGithubResource('branches', [
      {
        name: 'main',
        protected: true,
        commit: {
          sha: 'abcdef1234567890',
          url: 'https://api.github.com/repos/jmars319/example/commits/abcdef1',
        },
      },
    ])
    const tags = normalizeGithubResource('tags', [
      {
        name: 'v1.0.0',
        commit: {
          sha: '123456abcdef',
        },
        zipball_url: 'https://github.com/jmars319/example/archive/v1.0.0.zip',
        tarball_url: 'https://github.com/jmars319/example/archive/v1.0.0.tar.gz',
      },
    ])

    expect(branches).toEqual([
      {
        name: 'main',
        protected: true,
        commitSha: 'abcdef1234567890',
        commitUrl: 'https://api.github.com/repos/jmars319/example/commits/abcdef1',
      },
    ])
    expect(tags).toEqual([
      {
        name: 'v1.0.0',
        commitSha: '123456abcdef',
        zipballUrl: 'https://github.com/jmars319/example/archive/v1.0.0.zip',
        tarballUrl: 'https://github.com/jmars319/example/archive/v1.0.0.tar.gz',
      },
    ])
  })

  it('caches short-lived GitHub requests and bypasses cache on explicit reload', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: 'cached' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: 'fresh' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchGithubJson<{ data: string }>('/api/github/repos?source=viewer')).resolves.toEqual(
      { data: 'cached' },
    )
    await expect(fetchGithubJson<{ data: string }>('/api/github/repos?source=viewer')).resolves.toEqual(
      { data: 'cached' },
    )
    await expect(
      fetchGithubJson<{ data: string }>('/api/github/repos?source=viewer', undefined, {
        cache: 'reload',
      }),
    ).resolves.toEqual({ data: 'fresh' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('exposes GitHub cache metadata without persisting repository resources', async () => {
    const response = {
      data: [{ id: 1 }],
      pageInfo: { currentPage: 2, hasNextPage: true, nextPage: 3, perPage: 20 },
      error: null,
      permission: 'available',
    }
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const first = await fetchGithubJsonWithMetadata<typeof response>('/api/github/repos?page=2')
    const second = await fetchGithubJsonWithMetadata<typeof response>('/api/github/repos?page=2')
    const metadata = getGithubRequestCacheMetadata('/api/github/repos?page=2')

    expect(first.metadata.cacheHit).toBe(false)
    expect(second.metadata.cacheHit).toBe(true)
    expect(second.metadata.pageInfo).toEqual(response.pageInfo)
    expect(metadata?.pageInfo?.nextPage).toBe(3)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('uses scoped GitHub API error messages when requests fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: 'GitHub rate limit reached.' } }), {
          status: 429,
        }),
      ),
    )

    await expect(fetchGithubJson('/api/github/repos?source=viewer')).rejects.toThrow(
      'GitHub rate limit reached.',
    )
  })

  it('summarizes partial configured repository failures without hiding readable repos', () => {
    const error = summarizeConfiguredRepoFailures(
      [
        {
          data: { id: 1 },
          pageInfo: { currentPage: 1, hasNextPage: false, nextPage: null, perPage: 20 },
          error: null,
          permission: 'available',
        },
        {
          data: null,
          pageInfo: { currentPage: 1, hasNextPage: false, nextPage: null, perPage: 20 },
          error: {
            type: 'not-found-or-private',
            message: 'The repository or resource was not found.',
            status: 404,
            resource: 'repo',
          },
          permission: 'unknown',
        },
      ],
      2,
    )

    expect(error?.resource).toBe('configured-repos')
    expect(error?.message).toContain('1 of 2 configured GitHub repositories could not be read')
    expect(error?.message).toContain('1 readable')
  })

  it('loads all GitHub App installation repository pages before local pagination', async () => {
    const githubRepo = (name: string, pushedAt: string) => ({
      id: name.length,
      name,
      full_name: `jmars319/${name}`,
      private: false,
      description: `${name} repository.`,
      html_url: `https://github.com/jmars319/${name}`,
      default_branch: 'main',
      visibility: 'public',
      language: 'TypeScript',
      updated_at: pushedAt,
      pushed_at: pushedAt,
      open_issues_count: 0,
      stargazers_count: 0,
      forks_count: 0,
      archived: false,
      disabled: false,
    })
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)
      const searchParams = new URL(url).searchParams

      if (url.includes('/user/installations?')) {
        return new Response(JSON.stringify({ installations: [{ id: 10 }] }), { status: 200 })
      }

      if (
        url.includes('/user/installations/10/repositories?') &&
        searchParams.get('page') === '1'
      ) {
        return new Response(
          JSON.stringify({
            repositories: [githubRepo('Assembly', '2026-05-08T12:00:00Z')],
          }),
          {
            status: 200,
            headers: {
              link: '<https://api.github.com/user/installations/10/repositories?page=2&per_page=100>; rel="next"',
            },
          },
        )
      }

      if (
        url.includes('/user/installations/10/repositories?') &&
        searchParams.get('page') === '2'
      ) {
        return new Response(
          JSON.stringify({
            repositories: [githubRepo('JAMARQ-Atlas', '2026-05-09T12:00:00Z')],
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify({ message: `Unexpected URL ${url}` }), { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await handleInstalledRepos(
      new URLSearchParams({ page: '1', per_page: '100' }),
      {
        mode: 'github-app-user',
        token: 'github-app-token',
        session: null,
        error: null,
      },
    )
    const fullNames = (Array.isArray(result.data) ? result.data : []).map(
      (repository) => (repository as { fullName: string }).fullName,
    )

    expect(fullNames).toEqual(expect.arrayContaining(['jmars319/Assembly', 'jmars319/JAMARQ-Atlas']))
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(
      expect.arrayContaining([expect.stringContaining('page=2')]),
    )
  })
})
