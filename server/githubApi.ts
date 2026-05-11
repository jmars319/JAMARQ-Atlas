import type { IncomingMessage, ServerResponse } from 'node:http'

type GithubErrorType =
  | 'missing-token'
  | 'unauthorized'
  | 'insufficient-permission'
  | 'not-found-or-private'
  | 'rate-limited'
  | 'github-unavailable'
  | 'unknown'

interface PageInfo {
  currentPage: number
  hasNextPage: boolean
  nextPage: number | null
  perPage: number
}

interface GithubApiError {
  type: GithubErrorType
  message: string
  status: number
  resource: string
}

interface GithubRequestResult {
  data: unknown
  pageInfo: PageInfo
  error: GithubApiError | null
  permission: 'available' | 'missing-token' | 'insufficient' | 'unknown'
}

const API_VERSION = '2022-11-28'
const API_BASE = 'https://api.github.com'
const DEFAULT_PER_PAGE = 20
const MAX_PER_PAGE = 100

function getToken() {
  return process.env.GITHUB_TOKEN || process.env.GH_TOKEN || ''
}

function getConfiguredRepos() {
  return (process.env.GITHUB_REPOS || '')
    .split(',')
    .map((repo) => repo.trim())
    .filter(Boolean)
}

function resolveConfiguredRepo(repo: string) {
  return repo.includes('/') || !process.env.GITHUB_OWNER ? repo : `${process.env.GITHUB_OWNER}/${repo}`
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body, null, 2))
}

function parsePageInfo(searchParams: URLSearchParams, linkHeader: string | null): PageInfo {
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
    return {
      type: 'rate-limited',
      status,
      resource,
      message: `GitHub rate limit reached. Reset: ${headers.get('x-ratelimit-reset') ?? 'unknown'}.`,
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

function withPagination(path: string, searchParams: URLSearchParams, defaults = new URLSearchParams()) {
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

async function githubRequest(path: string, resource: string, searchParams: URLSearchParams) {
  const token = getToken()
  const pageInfo = parsePageInfo(searchParams, null)

  if (!token) {
    return {
      data: null,
      pageInfo,
      error: {
        type: 'missing-token',
        status: 401,
        resource,
        message: 'Set GITHUB_TOKEN or GH_TOKEN and restart the local server.',
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

type JsonRecord = Record<string, unknown>

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null ? (value as JsonRecord) : {}
}

function readRecord(value: unknown, key: string): JsonRecord {
  return asRecord(asRecord(value)[key])
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

function compactRepo(repo: unknown) {
  const record = asRecord(repo)

  return {
    id: readNumber(record.id) ?? 0,
    name: readString(record.name) ?? '',
    fullName: readString(record.full_name) ?? '',
    private: readBoolean(record.private) ?? false,
    description: readString(record.description),
    htmlUrl: readString(record.html_url) ?? '',
    defaultBranch: readString(record.default_branch) ?? 'main',
    visibility: readString(record.visibility) ?? 'unknown',
    language: readString(record.language),
    updatedAt: readString(record.updated_at) ?? '',
    pushedAt: readString(record.pushed_at),
    openIssuesCount: readNumber(record.open_issues_count) ?? 0,
    stargazersCount: readNumber(record.stargazers_count) ?? 0,
    forksCount: readNumber(record.forks_count) ?? 0,
    archived: readBoolean(record.archived) ?? false,
    disabled: readBoolean(record.disabled) ?? false,
  }
}

function compactCommit(commit: unknown) {
  const record = asRecord(commit)
  const commitData = readRecord(commit, 'commit')
  const author = readRecord(commitData, 'author')
  const committer = readRecord(commitData, 'committer')
  const verification = readRecord(commitData, 'verification')

  return {
    sha: readString(record.sha) ?? '',
    shortSha: String(record.sha ?? '').slice(0, 7),
    message: readString(commitData.message) ?? '',
    author: readString(readRecord(commit, 'author').login) ?? readString(author.name),
    date: readString(author.date) ?? readString(committer.date),
    htmlUrl: readString(record.html_url) ?? '',
    verified: readBoolean(verification.verified),
    verificationReason: readString(verification.reason),
  }
}

function compactPullRequest(pullRequest: unknown) {
  const record = asRecord(pullRequest)

  return {
    id: readNumber(record.id) ?? 0,
    number: readNumber(record.number) ?? 0,
    state: readString(record.state) ?? 'unknown',
    title: readString(record.title) ?? '',
    draft: readBoolean(record.draft) ?? false,
    mergedAt: readString(record.merged_at),
    user: readString(readRecord(pullRequest, 'user').login),
    base: readString(readRecord(pullRequest, 'base').ref),
    head: readString(readRecord(pullRequest, 'head').ref),
    createdAt: readString(record.created_at) ?? '',
    updatedAt: readString(record.updated_at) ?? '',
    htmlUrl: readString(record.html_url) ?? '',
  }
}

function compactIssue(issue: unknown) {
  const record = asRecord(issue)
  const labels = Array.isArray(record.labels)
    ? record.labels.map((label) => readString(asRecord(label).name) ?? '').filter(Boolean)
    : []

  return {
    id: readNumber(record.id) ?? 0,
    number: readNumber(record.number) ?? 0,
    state: readString(record.state) ?? 'unknown',
    title: readString(record.title) ?? '',
    user: readString(readRecord(issue, 'user').login),
    labels,
    comments: readNumber(record.comments) ?? 0,
    createdAt: readString(record.created_at) ?? '',
    updatedAt: readString(record.updated_at) ?? '',
    closedAt: readString(record.closed_at),
    htmlUrl: readString(record.html_url) ?? '',
  }
}

function compactRelease(release: unknown) {
  const record = asRecord(release)

  return {
    id: readNumber(record.id) ?? 0,
    name: readString(record.name),
    tagName: readString(record.tag_name) ?? '',
    draft: readBoolean(record.draft) ?? false,
    prerelease: readBoolean(record.prerelease) ?? false,
    immutable: readBoolean(record.immutable) ?? false,
    author: readString(readRecord(release, 'author').login),
    createdAt: readString(record.created_at) ?? '',
    publishedAt: readString(record.published_at),
    htmlUrl: readString(record.html_url) ?? '',
  }
}

function compactWorkflow(workflow: unknown) {
  const record = asRecord(workflow)

  return {
    id: readNumber(record.id) ?? 0,
    name: readString(record.name) ?? '',
    path: readString(record.path) ?? '',
    state: readString(record.state) ?? 'unknown',
    createdAt: readString(record.created_at) ?? '',
    updatedAt: readString(record.updated_at) ?? '',
    htmlUrl: readString(record.html_url) ?? '',
  }
}

function compactWorkflowRun(run: unknown) {
  const record = asRecord(run)

  return {
    id: readNumber(record.id) ?? 0,
    name: readString(record.name),
    displayTitle: readString(record.display_title) ?? '',
    status: readString(record.status) ?? 'unknown',
    conclusion: readString(record.conclusion),
    branch: readString(record.head_branch),
    event: readString(record.event) ?? '',
    actor: readString(readRecord(run, 'actor').login),
    runNumber: readNumber(record.run_number) ?? 0,
    runAttempt: readNumber(record.run_attempt) ?? 0,
    createdAt: readString(record.created_at) ?? '',
    updatedAt: readString(record.updated_at) ?? '',
    runStartedAt: readString(record.run_started_at),
    htmlUrl: readString(record.html_url) ?? '',
  }
}

function compactDeployment(deployment: unknown) {
  const record = asRecord(deployment)

  return {
    id: readNumber(record.id) ?? 0,
    sha: readString(record.sha) ?? '',
    shortSha: String(record.sha ?? '').slice(0, 7),
    ref: readString(record.ref) ?? '',
    task: readString(record.task) ?? '',
    environment: readString(record.environment) ?? '',
    creator: readString(readRecord(deployment, 'creator').login),
    description: readString(record.description),
    createdAt: readString(record.created_at) ?? '',
    updatedAt: readString(record.updated_at) ?? '',
    statusesUrl: readString(record.statuses_url) ?? '',
  }
}

function compactCheckRun(checkRun: unknown) {
  const record = asRecord(checkRun)

  return {
    id: readNumber(record.id) ?? 0,
    name: readString(record.name) ?? '',
    status: readString(record.status) ?? 'unknown',
    conclusion: readString(record.conclusion),
    startedAt: readString(record.started_at),
    completedAt: readString(record.completed_at),
    htmlUrl: readString(record.html_url) ?? '',
    app: readString(readRecord(checkRun, 'app').name),
    detailsUrl: readString(record.details_url),
  }
}

function compactBranch(branch: unknown) {
  const record = asRecord(branch)
  const commit = readRecord(branch, 'commit')

  return {
    name: readString(record.name) ?? '',
    protected: readBoolean(record.protected) ?? false,
    commitSha: readString(commit.sha) ?? '',
    commitUrl: readString(commit.url) ?? '',
  }
}

function compactTag(tag: unknown) {
  const record = asRecord(tag)
  const commit = readRecord(tag, 'commit')

  return {
    name: readString(record.name) ?? '',
    commitSha: readString(commit.sha) ?? '',
    zipballUrl: readString(record.zipball_url) ?? '',
    tarballUrl: readString(record.tarball_url) ?? '',
  }
}

export function normalizeGithubResource(resource: string, data: unknown) {
  if (resource === 'repos') {
    return Array.isArray(data) ? data.map(compactRepo) : []
  }

  if (resource === 'repo') {
    return compactRepo(data)
  }

  if (resource === 'commits') {
    return Array.isArray(data) ? data.map(compactCommit) : []
  }

  if (resource === 'pulls') {
    return Array.isArray(data) ? data.map(compactPullRequest) : []
  }

  if (resource === 'issues') {
    return Array.isArray(data)
      ? data.filter((issue) => !asRecord(issue).pull_request).map(compactIssue)
      : []
  }

  if (resource === 'releases') {
    return Array.isArray(data) ? data.map(compactRelease) : []
  }

  if (resource === 'workflows') {
    const workflows = asRecord(data).workflows
    return Array.isArray(workflows) ? workflows.map(compactWorkflow) : []
  }

  if (resource === 'workflow-runs') {
    const workflowRuns = asRecord(data).workflow_runs
    return Array.isArray(workflowRuns) ? workflowRuns.map(compactWorkflowRun) : []
  }

  if (resource === 'deployments') {
    return Array.isArray(data) ? data.map(compactDeployment) : []
  }

  if (resource === 'checks') {
    const checkRuns = asRecord(data).check_runs
    return Array.isArray(checkRuns) ? checkRuns.map(compactCheckRun) : []
  }

  if (resource === 'branches') {
    return Array.isArray(data) ? data.map(compactBranch) : []
  }

  if (resource === 'tags') {
    return Array.isArray(data) ? data.map(compactTag) : []
  }

  return data
}

async function handleConfiguredRepos(searchParams: URLSearchParams) {
  const repos = getConfiguredRepos()

  if (repos.length === 0) {
    return {
      data: [],
      pageInfo: parsePageInfo(searchParams, null),
      error: null,
      permission: getToken() ? 'available' : 'missing-token',
    } satisfies GithubRequestResult
  }

  const results = await Promise.all(
    repos.map((repo) => {
      const fullName = resolveConfiguredRepo(repo)
      return githubRequest(`/repos/${fullName}`, 'repo', searchParams)
    }),
  )
  const firstError = results.find((result) => result.error)?.error ?? null

  return {
    data: results.flatMap((result) =>
      result.data ? [normalizeGithubResource('repo', result.data)] : [],
    ),
    pageInfo: parsePageInfo(searchParams, null),
    error: firstError,
    permission:
      firstError?.type === 'missing-token'
        ? 'missing-token'
        : firstError?.type === 'insufficient-permission'
          ? 'insufficient'
          : firstError
            ? 'unknown'
            : 'available',
  } satisfies GithubRequestResult
}

async function handleViewerRepos(searchParams: URLSearchParams) {
  const path = withPagination(
    '/user/repos',
    searchParams,
    new URLSearchParams({
      affiliation: 'owner,collaborator,organization_member',
      sort: 'pushed',
      direction: 'desc',
    }),
  )
  const result = await githubRequest(path, 'repos', searchParams)

  return {
    ...result,
    data: result.error ? null : normalizeGithubResource('repos', result.data),
  } satisfies GithubRequestResult
}

async function handleRepos(searchParams: URLSearchParams) {
  const source = searchParams.get('source') || 'configured'

  if (source === 'configured') {
    return handleConfiguredRepos(searchParams)
  }

  if (source === 'viewer') {
    return handleViewerRepos(searchParams)
  }

  return {
    data: null,
    pageInfo: parsePageInfo(searchParams, null),
    error: {
      type: 'unknown',
      status: 400,
      resource: 'repos',
      message: `Unsupported repository source: ${source}.`,
    },
    permission: 'unknown',
  } satisfies GithubRequestResult
}

async function routeGithubRequest(url: URL) {
  const searchParams = url.searchParams

  if (url.pathname === '/api/github/status') {
    return {
      configured: Boolean(getToken()),
      configuredRepos: getConfiguredRepos(),
      authMode: 'server-env',
    }
  }

  if (url.pathname === '/api/github/repos') {
    return handleRepos(searchParams)
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

  const result = await githubRequest(githubPath, resource, searchParams)

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
  if (!request.url?.startsWith('/api/github')) {
    next?.()
    return
  }

  try {
    const url = new URL(request.url, 'http://localhost')
    const body = await routeGithubRequest(url)
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
