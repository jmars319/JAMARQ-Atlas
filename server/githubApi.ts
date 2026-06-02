import type { IncomingMessage, ServerResponse } from 'node:http'
import { createGithubAuthStatus, resolveGithubAuthForRequest } from './githubAuth'
import { handleRepos } from './github/repos'
import {
  handleCommandSummaries,
  handleCommandSummary,
  handleIssueCommandDetail,
  handlePullRequestCommandDetail,
} from './github/command'
import { githubRequest, json, parsePageInfo, withPagination, type GithubRequestResult } from './github/core'
import { normalizeGithubResource } from './github/compact'

export { normalizeGithubResource } from './github/compact'
export { summarizeConfiguredRepoFailures, handleInstalledRepos } from './github/repos'
export { buildGithubRepoCommandSummary } from './github/command'

async function routeGithubRequest(request: IncomingMessage, url: URL) {
  const searchParams = url.searchParams
  const auth = await resolveGithubAuthForRequest(request)

  if (url.pathname === '/api/github/status') {
    return createGithubAuthStatus(request)
  }

  if (url.pathname === '/api/github/repos') {
    return handleRepos(searchParams, auth)
  }

  if (url.pathname === '/api/github/command-summaries') {
    return handleCommandSummaries(searchParams, auth)
  }

  const detailMatch = url.pathname.match(
    /^\/api\/github\/repos\/([^/]+)\/([^/]+)\/(pulls|issues)\/(\d+)\/command-detail$/,
  )

  if (detailMatch) {
    const [, owner, repo, resource, numberValue] = detailMatch
    const number = Number(numberValue)

    return resource === 'pulls'
      ? handlePullRequestCommandDetail({ owner, repo, number, searchParams, auth })
      : handleIssueCommandDetail({ owner, repo, number, searchParams, auth })
  }

  const repoMatch = url.pathname.match(/^\/api\/github\/repos\/([^/]+)\/([^/]+)(?:\/([^/]+))?$/)

  if (!repoMatch) {
    return {
      data: null,
      pageInfo: parsePageInfo(searchParams, null),
      error: {
        type: 'unknown',
        status: 404,
        resource: 'unknown',
        message: 'Unknown GitHub API route.',
      },
      permission: 'unknown',
    } satisfies GithubRequestResult
  }

  const [, owner, repo, resource = 'repo'] = repoMatch
  const repoPath = `/repos/${owner}/${repo}`

  if (resource === 'command-summary') {
    return handleCommandSummary({ owner, repo, searchParams, auth })
  }

  const paths: Record<string, string> = {
    repo: repoPath,
    commits: withPagination(`${repoPath}/commits`, searchParams),
    pulls: withPagination(`${repoPath}/pulls`, searchParams, new URLSearchParams({ state: 'all' })),
    issues: withPagination(`${repoPath}/issues`, searchParams, new URLSearchParams({ state: 'all' })),
    releases: withPagination(`${repoPath}/releases`, searchParams),
    workflows: withPagination(`${repoPath}/actions/workflows`, searchParams),
    'workflow-runs': withPagination(`${repoPath}/actions/runs`, searchParams),
    deployments: withPagination(`${repoPath}/deployments`, searchParams),
    checks: withPagination(
      `${repoPath}/commits/${encodeURIComponent(searchParams.get('ref') || 'HEAD')}/check-runs`,
      searchParams,
    ),
    branches: withPagination(`${repoPath}/branches`, searchParams),
    tags: withPagination(`${repoPath}/tags`, searchParams),
  }
  const githubPath = paths[resource]

  if (!githubPath) {
    return {
      data: null,
      pageInfo: parsePageInfo(searchParams, null),
      error: {
        type: 'unknown',
        status: 404,
        resource,
        message: `Unsupported GitHub resource: ${resource}.`,
      },
      permission: 'unknown',
    } satisfies GithubRequestResult
  }

  const result = await githubRequest(githubPath, resource, searchParams, auth)

  return {
    ...result,
    data: result.error ? null : normalizeGithubResource(resource, result.data),
  } satisfies GithubRequestResult
}

export async function githubApiMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next?: () => void,
) {
  if (!request.url?.startsWith('/api/github') || request.url.startsWith('/api/github/auth')) {
    next?.()
    return
  }

  if (request.method !== 'GET') {
    json(response, 405, {
      data: null,
      pageInfo: parsePageInfo(new URLSearchParams(), null),
      error: {
        type: 'unknown',
        status: 405,
        resource: 'github',
        message: 'Atlas GitHub API exposes read-only GET routes only.',
      },
      permission: 'unknown',
    })
    return
  }

  try {
    const url = new URL(request.url, 'http://localhost')
    const body = await routeGithubRequest(request, url)
    json(response, 200, body)
  } catch (error) {
    json(response, 500, {
      data: null,
      error: {
        type: 'unknown',
        status: 500,
        resource: 'server',
        message: error instanceof Error ? error.message : 'Atlas local API failed.',
      },
      permission: 'unknown',
    })
  }
}
