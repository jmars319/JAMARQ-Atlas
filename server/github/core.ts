import type { ServerResponse } from 'node:http'
import type { GithubAuthResolution } from '../githubAuth'

export type GithubErrorType =
  | 'missing-token'
  | 'unauthorized'
  | 'insufficient-permission'
  | 'not-found-or-private'
  | 'rate-limited'
  | 'github-unavailable'
  | 'unknown'

export interface PageInfo {
  currentPage: number
  hasNextPage: boolean
  nextPage: number | null
  perPage: number
}

export interface GithubApiError {
  type: GithubErrorType
  message: string
  status: number
  resource: string
}

export interface GithubRequestResult {
  data: unknown
  pageInfo: PageInfo
  error: GithubApiError | null
  permission: 'available' | 'missing-token' | 'insufficient' | 'unknown'
}

const API_VERSION = '2022-11-28'
const API_BASE = 'https://api.github.com'
export const DEFAULT_PER_PAGE = 20
export const MAX_PER_PAGE = 100
export const MAX_PAGINATED_GITHUB_PAGES = 50

export function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body, null, 2))
}

export function parsePageInfo(searchParams: URLSearchParams, linkHeader: string | null): PageInfo {
  const currentPage = Number(searchParams.get('page') || '1')
  const requestedPerPage = Number(searchParams.get('per_page') || DEFAULT_PER_PAGE)
  const perPage = Math.min(Math.max(requestedPerPage, 1), MAX_PER_PAGE)
  const nextMatch = linkHeader?.match(/[?&]page=(\d+)[^>]*>; rel="next"/)
  const nextPage = nextMatch ? Number(nextMatch[1]) : null

  return {
    currentPage,
    hasNextPage: nextPage !== null,
    nextPage,
    perPage,
  }
}

function mapGithubError(
  status: number,
  message: string,
  resource: string,
  headers?: Headers,
): GithubApiError {
  if (status === 401) {
    return {
      type: 'unauthorized',
      status,
      resource,
      message: 'GitHub rejected the token. Check GITHUB_TOKEN or GH_TOKEN.',
    }
  }

  if (status === 403 && headers?.get('x-ratelimit-remaining') === '0') {
    const reset = headers.get('x-ratelimit-reset')
    const resetTimestamp = reset ? Number(reset) : 0
    const resetLabel =
      resetTimestamp > 0 ? new Date(resetTimestamp * 1000).toISOString() : 'unknown'

    return {
      type: 'rate-limited',
      status,
      resource,
      message: `GitHub rate limit reached. Reset: ${resetLabel}.`,
    }
  }

  if (status === 403) {
    return {
      type: 'insufficient-permission',
      status,
      resource,
      message: 'The token does not have permission to read this GitHub resource.',
    }
  }

  if (status === 404) {
    return {
      type: 'not-found-or-private',
      status,
      resource,
      message: 'The repository or resource was not found, or it is private for this token.',
    }
  }

  if (status >= 500) {
    return {
      type: 'github-unavailable',
      status,
      resource,
      message: 'GitHub is currently unavailable for this resource.',
    }
  }

  return {
    type: 'unknown',
    status,
    resource,
    message: message || 'GitHub returned an unexpected response.',
  }
}

export function withPagination(path: string, searchParams: URLSearchParams, defaults = new URLSearchParams()) {
  const params = new URLSearchParams(defaults)

  for (const [key, value] of searchParams.entries()) {
    params.set(key, value)
  }

  if (!params.has('page')) {
    params.set('page', '1')
  }

  if (!params.has('per_page')) {
    params.set('per_page', String(DEFAULT_PER_PAGE))
  }

  return `${path}?${params.toString()}`
}

export async function githubRequest(
  path: string,
  resource: string,
  searchParams: URLSearchParams,
  auth: GithubAuthResolution,
) {
  const token = auth.token
  const pageInfo = parsePageInfo(searchParams, null)

  if (!token) {
    return {
      data: null,
      pageInfo,
      error: {
        type: 'missing-token',
        status: 401,
        resource,
        message:
          auth.error ??
          'Sign in with the configured GitHub App, or set GITHUB_TOKEN/GH_TOKEN for legacy local fallback.',
      },
      permission: 'missing-token',
    } satisfies GithubRequestResult
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'jamarq-atlas-local-api',
        'X-GitHub-Api-Version': API_VERSION,
      },
    })
    const responseText = await response.text()
    const parsedBody = responseText ? JSON.parse(responseText) : null
    const responsePageInfo = parsePageInfo(searchParams, response.headers.get('link'))

    if (!response.ok) {
      return {
        data: null,
        pageInfo: responsePageInfo,
        error: mapGithubError(
          response.status,
          parsedBody?.message ?? response.statusText,
          resource,
          response.headers,
        ),
        permission: response.status === 403 ? 'insufficient' : 'unknown',
      } satisfies GithubRequestResult
    }

    return {
      data: parsedBody,
      pageInfo: responsePageInfo,
      error: null,
      permission: 'available',
    } satisfies GithubRequestResult
  } catch (error) {
    return {
      data: null,
      pageInfo,
      error: {
        type: 'github-unavailable',
        status: 503,
        resource,
        message: error instanceof Error ? error.message : 'GitHub request failed.',
      },
      permission: 'unknown',
    } satisfies GithubRequestResult
  }
}
