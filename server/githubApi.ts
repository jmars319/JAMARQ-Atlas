import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  deriveGithubRepoCommandSummary,
  githubRunIsStale,
  type GithubFailureExplanation,
  type GithubRepoCommandSummary,
} from '../src/services/githubCommand'
import type {
  GithubBranch,
  GithubCheckRun,
  GithubCommandDetailGap,
  GithubCommit,
  GithubDeployment,
  GithubIssue,
  GithubIssueCommandDetail,
  GithubPullRequest,
  GithubPullRequestCommandDetail,
  GithubRelease,
  GithubRepositorySummary,
  GithubTag,
  GithubWorkflowRun,
} from '../src/services/githubIntegration'
import {
  createGithubAuthStatus,
  getConfiguredRepos,
  resolveConfiguredRepo,
  resolveGithubAuthForRequest,
  type GithubAuthResolution,
} from './githubAuth'
import { getLocalGitRepositoryStatus } from './localGitApi'

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
const MAX_PAGINATED_GITHUB_PAGES = 50

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

async function githubRequest(
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
    headSha: readString(record.head_sha),
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

function compactStringList(value: unknown, key = 'login') {
  return Array.isArray(value)
    ? value.map((item) => readString(asRecord(item)[key]) ?? '').filter(Boolean)
    : []
}

function compactLabelList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => readString(asRecord(item).name) ?? '').filter(Boolean)
    : []
}

function excerpt(value: unknown, limit = 600) {
  const text = readString(value) ?? ''
  const normalized = text.replace(/\s+/g, ' ').trim()

  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized
}

function permissionGapFromError(error: GithubApiError): GithubCommandDetailGap {
  return {
    resource: error.resource,
    type: error.type,
    message: error.message,
    status: error.status,
    permission:
      error.type === 'missing-token'
        ? 'missing-token'
        : error.type === 'insufficient-permission'
          ? 'insufficient'
          : 'unknown',
  }
}

function checkConclusionCounts(checkRuns: GithubCheckRun[]) {
  return checkRuns.reduce<Record<string, number>>((counts, check) => {
    const key = check.conclusion ?? check.status

    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

function compactCommentPreview(comment: unknown) {
  const record = asRecord(comment)

  return {
    id: readNumber(record.id) ?? 0,
    user: readString(readRecord(comment, 'user').login),
    bodyExcerpt: excerpt(record.body, 280),
    createdAt: readString(record.created_at) ?? '',
    updatedAt: readString(record.updated_at) ?? '',
    htmlUrl: readString(record.html_url) ?? '',
  }
}

function compactPullRequestCommandDetail({
  pullRequest,
  reviews,
  files,
  checkRuns,
  permissionGaps,
}: {
  pullRequest: unknown
  reviews: unknown[]
  files: unknown[]
  checkRuns: GithubCheckRun[]
  permissionGaps: GithubCommandDetailGap[]
}): GithubPullRequestCommandDetail {
  const record = asRecord(pullRequest)
  const compact = record.id ? compactPullRequest(pullRequest) : null
  const reviewStates = reviews
    .map((review) => readString(asRecord(review).state) ?? '')
    .filter(Boolean)
  const latestReview = reviews
    .slice()
    .sort((left, right) =>
      String(asRecord(right).submitted_at ?? '').localeCompare(String(asRecord(left).submitted_at ?? '')),
    )[0]
  const head = readRecord(pullRequest, 'head')
  const base = readRecord(pullRequest, 'base')

  return {
    pullRequest: compact,
    bodyExcerpt: excerpt(record.body),
    labels: compactLabelList(record.labels),
    assignees: compactStringList(record.assignees),
    requestedReviewers: compactStringList(record.requested_reviewers),
    milestone: readString(readRecord(pullRequest, 'milestone').title),
    comments: readNumber(record.comments) ?? 0,
    reviewComments: readNumber(record.review_comments) ?? 0,
    changedFiles: readNumber(record.changed_files) ?? files.length,
    additions: readNumber(record.additions) ?? 0,
    deletions: readNumber(record.deletions) ?? 0,
    mergeable: readBoolean(record.mergeable),
    headRef: readString(head.ref),
    headSha: readString(head.sha),
    baseRef: readString(base.ref),
    baseSha: readString(base.sha),
    latestReviewState: latestReview ? readString(asRecord(latestReview).state) : null,
    reviewStates,
    checkRuns,
    checkConclusionCounts: checkConclusionCounts(checkRuns),
    htmlUrl: readString(record.html_url) ?? compact?.htmlUrl ?? '',
    updatedAt: readString(record.updated_at),
    fetchedAt: new Date().toISOString(),
    permissionGaps,
    writeControlsEnabled: false,
  }
}

function compactIssueCommandDetail({
  issue,
  comments,
  permissionGaps,
}: {
  issue: unknown
  comments: unknown[]
  permissionGaps: GithubCommandDetailGap[]
}): GithubIssueCommandDetail {
  const record = asRecord(issue)
  const compact = record.id ? compactIssue(issue) : null
  const commentPreviews = comments.map(compactCommentPreview)
  const latestCommentAt =
    commentPreviews
      .slice()
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]?.updatedAt ?? null

  return {
    issue: compact,
    bodyExcerpt: excerpt(record.body),
    labels: compactLabelList(record.labels),
    assignees: compactStringList(record.assignees),
    milestone: readString(readRecord(issue, 'milestone').title),
    locked: readBoolean(record.locked) ?? false,
    comments: readNumber(record.comments) ?? commentPreviews.length,
    latestCommentAt,
    commentPreviews,
    htmlUrl: readString(record.html_url) ?? compact?.htmlUrl ?? '',
    updatedAt: readString(record.updated_at),
    fetchedAt: new Date().toISOString(),
    permissionGaps,
    writeControlsEnabled: false,
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

async function handleConfiguredRepos(searchParams: URLSearchParams, auth: GithubAuthResolution) {
  const repos = getConfiguredRepos()

  if (repos.length === 0) {
    return {
      data: [],
      pageInfo: parsePageInfo(searchParams, null),
      error: null,
      permission: auth.token ? 'available' : 'missing-token',
    } satisfies GithubRequestResult
  }

  const results = await Promise.all(
    repos.map((repo) => {
      const fullName = resolveConfiguredRepo(repo)
      return githubRequest(`/repos/${fullName}`, 'repo', searchParams, auth)
    }),
  )
  const firstError = summarizeConfiguredRepoFailures(results, repos.length)

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

export function summarizeConfiguredRepoFailures(
  results: GithubRequestResult[],
  configuredRepoCount: number,
): GithubApiError | null {
  const errors = results
    .map((result) => result.error)
    .filter((error): error is GithubApiError => error !== null)

  if (errors.length === 0) {
    return null
  }

  const firstError = errors[0]
  const readableCount =
    configuredRepoCount - errors.length > 0 ? `${configuredRepoCount - errors.length} readable` : 'none readable'

  return {
    ...firstError,
    resource: 'configured-repos',
    message:
      errors.length === configuredRepoCount
        ? `No configured GitHub repositories could be read. First issue: ${firstError.message}`
        : `${errors.length} of ${configuredRepoCount} configured GitHub repositories could not be read; ${readableCount}. First issue: ${firstError.message}`,
  }
}

function paginateItems(items: unknown[], searchParams: URLSearchParams): GithubRequestResult {
  const requestedPage = Number(searchParams.get('page') || '1')
  const requestedPerPage = Number(searchParams.get('per_page') || DEFAULT_PER_PAGE)
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const perPage =
    Number.isFinite(requestedPerPage) && requestedPerPage > 0
      ? Math.min(requestedPerPage, MAX_PER_PAGE)
      : DEFAULT_PER_PAGE
  const start = (currentPage - 1) * perPage
  const pageItems = items.slice(start, start + perPage)
  const hasNextPage = start + perPage < items.length

  return {
    data: pageItems,
    pageInfo: {
      currentPage,
      hasNextPage,
      nextPage: hasNextPage ? currentPage + 1 : null,
      perPage,
    },
    error: null,
    permission: 'available',
  }
}

async function collectPaginatedGithubItems(
  path: string,
  resource: string,
  auth: GithubAuthResolution,
  readItems: (data: unknown) => unknown,
) {
  const items: unknown[] = []
  const results: GithubRequestResult[] = []
  let page = 1

  for (let index = 0; index < MAX_PAGINATED_GITHUB_PAGES; index += 1) {
    const params = new URLSearchParams({ page: String(page), per_page: String(MAX_PER_PAGE) })
    const result = await githubRequest(withPagination(path, params), resource, params, auth)
    results.push(result)

    if (result.error) {
      break
    }

    const resultItems = readItems(result.data)

    if (Array.isArray(resultItems)) {
      items.push(...resultItems)
    }

    if (!result.pageInfo.hasNextPage || result.pageInfo.nextPage === null) {
      break
    }

    page = result.pageInfo.nextPage
  }

  return { items, results }
}

export async function handleInstalledRepos(
  searchParams: URLSearchParams,
  auth: GithubAuthResolution,
) {
  const installationPages = await collectPaginatedGithubItems(
    '/user/installations',
    'installations',
    auth,
    (data) => asRecord(data).installations,
  )
  const firstInstallationError = installationPages.results.find((result) => result.error)

  if (firstInstallationError) {
    return firstInstallationError
  }

  const installationIds = installationPages.items
    .map((installation) => readNumber(asRecord(installation).id))
    .filter((id): id is number => id !== null)

  const repoPages = await Promise.all(
    installationIds.map((installationId) => {
      return collectPaginatedGithubItems(
        `/user/installations/${installationId}/repositories`,
        'installation-repositories',
        auth,
        (data) => asRecord(data).repositories,
      )
    }),
  )
  const repos = repoPages.flatMap((page) => page.items)
  const repoResults = repoPages.flatMap((page) => page.results)
  const normalizedRepos = normalizeGithubResource('repos', repos) as Array<{ pushedAt: string | null }>
  const sortedRepos = [...normalizedRepos].sort((left, right) =>
    String(right.pushedAt ?? '').localeCompare(String(left.pushedAt ?? '')),
  )
  const firstError = repoResults.find((result) => result.error)?.error ?? null
  const paginated = paginateItems(sortedRepos, searchParams)

  return {
    ...paginated,
    error: firstError,
    permission:
      firstError?.type === 'insufficient-permission'
        ? 'insufficient'
        : firstError
          ? 'unknown'
          : 'available',
  } satisfies GithubRequestResult
}

async function handleViewerRepos(searchParams: URLSearchParams, auth: GithubAuthResolution) {
  if (auth.mode === 'github-app-user') {
    return handleInstalledRepos(searchParams, auth)
  }

  const path = withPagination(
    '/user/repos',
    searchParams,
    new URLSearchParams({
      affiliation: 'owner,collaborator,organization_member',
      sort: 'pushed',
      direction: 'desc',
    }),
  )
  const result = await githubRequest(path, 'repos', searchParams, auth)

  return {
    ...result,
    data: result.error ? null : normalizeGithubResource('repos', result.data),
  } satisfies GithubRequestResult
}

async function handleRepos(searchParams: URLSearchParams, auth: GithubAuthResolution) {
  const source = searchParams.get('source') || 'configured'

  if (source === 'configured') {
    return handleConfiguredRepos(searchParams, auth)
  }

  if (source === 'viewer') {
    return handleViewerRepos(searchParams, auth)
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

function commandSummaryPageInfo(searchParams: URLSearchParams) {
  return parsePageInfo(searchParams, null)
}

function pageParams(perPage: number, extras: Record<string, string> = {}) {
  return new URLSearchParams({
    page: '1',
    per_page: String(perPage),
    ...extras,
  })
}

function firstItem<T>(result: GithubRequestResult, resource: string) {
  if (result.error) {
    return null
  }

  const normalized = normalizeGithubResource(resource, result.data)

  return Array.isArray(normalized) ? ((normalized[0] ?? null) as T | null) : (normalized as T)
}

function arrayItems<T>(result: GithubRequestResult, resource: string) {
  if (result.error) {
    return []
  }

  const normalized = normalizeGithubResource(resource, result.data)

  return Array.isArray(normalized) ? (normalized as T[]) : []
}

function commandSummaryPermission(summary: GithubRepoCommandSummary): GithubRequestResult['permission'] {
  if (summary.permissionGaps.some((gap) => gap.type === 'missing-token')) {
    return 'missing-token'
  }

  if (summary.permissionGaps.some((gap) => gap.type === 'insufficient-permission')) {
    return 'insufficient'
  }

  if (!summary.repository && summary.permissionGaps.length > 0) {
    return 'unknown'
  }

  return 'available'
}

function parseCommandSummaryRepos(value: string | null) {
  if (!value) {
    return []
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^([^/]+)\/([^/]+)$/)

      if (!match) {
        return null
      }

      return {
        owner: match[1],
        repo: match[2],
      }
    })
    .filter((item): item is { owner: string; repo: string } => item !== null)
    .filter(
      (item, index, items) =>
        items.findIndex(
          (candidate) =>
            candidate.owner.toLowerCase() === item.owner.toLowerCase() &&
            candidate.repo.toLowerCase() === item.repo.toLowerCase(),
        ) === index,
    )
    .slice(0, 25)
}

function isWorkflowFailureConclusion(value: string | null) {
  return ['action_required', 'cancelled', 'failure', 'startup_failure', 'timed_out'].includes(
    value ?? '',
  )
}

interface WorkflowJobStepRecord {
  name: string | null
  status: string | null
  conclusion: string | null
  completedAt: string | null
}

interface WorkflowJobRecord {
  id: number | null
  name: string | null
  status: string | null
  conclusion: string | null
  completedAt: string | null
  htmlUrl: string
  steps: WorkflowJobStepRecord[]
}

function compactWorkflowJobs(data: unknown): WorkflowJobRecord[] {
  const jobs = asRecord(data).jobs

  if (!Array.isArray(jobs)) {
    return []
  }

  return jobs.map((job) => {
    const jobRecord = asRecord(job)
    const steps = Array.isArray(jobRecord.steps)
      ? jobRecord.steps.map((step): WorkflowJobStepRecord => {
          const stepRecord = asRecord(step)

          return {
            name: readString(stepRecord.name),
            status: readString(stepRecord.status),
            conclusion: readString(stepRecord.conclusion),
            completedAt: readString(stepRecord.completed_at),
          }
        })
      : []

    return {
      id: readNumber(jobRecord.id),
      name: readString(jobRecord.name),
      status: readString(jobRecord.status),
      conclusion: readString(jobRecord.conclusion),
      completedAt: readString(jobRecord.completed_at),
      htmlUrl: readString(jobRecord.html_url) ?? '',
      steps,
    }
  })
}

function fallbackFailureExplanation({
  run,
  latestCommit,
}: {
  run: GithubWorkflowRun
  latestCommit: GithubCommit | null
}): GithubFailureExplanation {
  const stale = githubRunIsStale(latestCommit, run)

  return {
    type: 'workflow-run',
    workflowRunId: run.id,
    workflowName: run.name,
    jobName: null,
    stepName: null,
    conclusion: run.conclusion ?? run.status,
    completedAt: run.updatedAt,
    htmlUrl: run.htmlUrl,
    commitSha: run.headSha,
    stale,
    staleReason: stale
      ? `Latest commit ${latestCommit?.shortSha ?? 'unknown'} differs from run head ${run.headSha?.slice(0, 7) ?? 'unknown'}.`
      : null,
  }
}

function buildFailureExplanation({
  run,
  latestCommit,
  jobs,
}: {
  run: GithubWorkflowRun
  latestCommit: GithubCommit | null
  jobs: WorkflowJobRecord[]
}): GithubFailureExplanation {
  const failedJob =
    jobs.find((job) => isWorkflowFailureConclusion(job.conclusion)) ??
    jobs.find((job) => isWorkflowFailureConclusion(job.status)) ??
    null
  const failedStep =
    failedJob?.steps.find((step) => isWorkflowFailureConclusion(step.conclusion)) ??
    failedJob?.steps.find((step) => isWorkflowFailureConclusion(step.status)) ??
    null
  const stale = githubRunIsStale(latestCommit, run)

  return {
    type: 'workflow-run',
    workflowRunId: run.id,
    workflowName: run.name,
    jobName: failedJob?.name ?? null,
    stepName: failedStep?.name ?? null,
    conclusion: failedStep?.conclusion ?? failedJob?.conclusion ?? run.conclusion ?? run.status,
    completedAt: failedStep?.completedAt ?? failedJob?.completedAt ?? run.updatedAt,
    htmlUrl: failedJob?.htmlUrl || run.htmlUrl,
    commitSha: run.headSha,
    stale,
    staleReason: stale
      ? `Latest commit ${latestCommit?.shortSha ?? 'unknown'} differs from run head ${run.headSha?.slice(0, 7) ?? 'unknown'}.`
      : null,
  }
}

async function getWorkflowFailureExplanation({
  owner,
  repo,
  latestCommit,
  latestWorkflowRun,
  auth,
}: {
  owner: string
  repo: string
  latestCommit: GithubCommit | null
  latestWorkflowRun: GithubWorkflowRun | null
  auth: GithubAuthResolution
}) {
  if (!latestWorkflowRun || !isWorkflowFailureConclusion(latestWorkflowRun.conclusion)) {
    return null
  }

  const params = pageParams(MAX_PER_PAGE, { filter: 'latest' })
  const jobsResult = await githubRequest(
    withPagination(
      `/repos/${owner}/${repo}/actions/runs/${latestWorkflowRun.id}/jobs`,
      params,
    ),
    'workflow-jobs',
    params,
    auth,
  )

  if (jobsResult.error) {
    return fallbackFailureExplanation({ run: latestWorkflowRun, latestCommit })
  }

  return buildFailureExplanation({
    run: latestWorkflowRun,
    latestCommit,
    jobs: compactWorkflowJobs(jobsResult.data),
  })
}

export async function buildGithubRepoCommandSummary({
  owner,
  repo,
  auth,
  env = process.env,
}: {
  owner: string
  repo: string
  auth: GithubAuthResolution
  env?: Record<string, string | undefined>
}) {
  const repoPath = `/repos/${owner}/${repo}`
  const [
    repositoryResult,
    commitsResult,
    pullsResult,
    issuesResult,
    workflowRunsResult,
    releasesResult,
    deploymentsResult,
    branchesResult,
    tagsResult,
    localGit,
  ] = await Promise.all([
    githubRequest(repoPath, 'repo', new URLSearchParams(), auth),
    githubRequest(
      withPagination(`${repoPath}/commits`, pageParams(1)),
      'commits',
      pageParams(1),
      auth,
    ),
    githubRequest(
      withPagination(`${repoPath}/pulls`, pageParams(MAX_PER_PAGE, { state: 'open' })),
      'pulls',
      pageParams(MAX_PER_PAGE, { state: 'open' }),
      auth,
    ),
    githubRequest(
      withPagination(`${repoPath}/issues`, pageParams(MAX_PER_PAGE, { state: 'open' })),
      'issues',
      pageParams(MAX_PER_PAGE, { state: 'open' }),
      auth,
    ),
    githubRequest(
      withPagination(`${repoPath}/actions/runs`, pageParams(1)),
      'workflow-runs',
      pageParams(1),
      auth,
    ),
    githubRequest(
      withPagination(`${repoPath}/releases`, pageParams(1)),
      'releases',
      pageParams(1),
      auth,
    ),
    githubRequest(
      withPagination(`${repoPath}/deployments`, pageParams(1)),
      'deployments',
      pageParams(1),
      auth,
    ),
    githubRequest(
      withPagination(`${repoPath}/branches`, pageParams(MAX_PER_PAGE)),
      'branches',
      pageParams(MAX_PER_PAGE),
      auth,
    ),
    githubRequest(
      withPagination(`${repoPath}/tags`, pageParams(MAX_PER_PAGE)),
      'tags',
      pageParams(MAX_PER_PAGE),
      auth,
    ),
    getLocalGitRepositoryStatus(owner, repo, env),
  ])
  const repository = firstItem<GithubRepositorySummary>(repositoryResult, 'repo')
  const latestCommit = firstItem<GithubCommit>(commitsResult, 'commits')
  const latestWorkflowRun = firstItem<GithubWorkflowRun>(workflowRunsResult, 'workflow-runs')
  const checksRef = latestCommit?.sha ?? repository?.defaultBranch ?? 'HEAD'
  const checksParams = pageParams(MAX_PER_PAGE, { ref: checksRef })
  const checksResult = await githubRequest(
    withPagination(`${repoPath}/commits/${encodeURIComponent(checksRef)}/check-runs`, checksParams),
    'checks',
    checksParams,
    auth,
  )
  const checkRuns = arrayItems<GithubCheckRun>(checksResult, 'checks')
  const latestCheckRun = checkRuns
    .slice()
    .sort((left, right) =>
      String(right.completedAt ?? right.startedAt ?? '').localeCompare(
        String(left.completedAt ?? left.startedAt ?? ''),
      ),
    )[0] ?? null
  const failureExplanation = await getWorkflowFailureExplanation({
    owner,
    repo,
    latestCommit,
    latestWorkflowRun,
    auth,
  })
  const githubErrors = [
    repositoryResult,
    commitsResult,
    pullsResult,
    issuesResult,
    workflowRunsResult,
    releasesResult,
    deploymentsResult,
    branchesResult,
    tagsResult,
    checksResult,
  ]
    .map((result) => result.error)
    .filter((error): error is GithubApiError => error !== null)

  return deriveGithubRepoCommandSummary({
    owner,
    repo,
    repository,
    latestCommit,
    openPullRequests: arrayItems<GithubPullRequest>(pullsResult, 'pulls'),
    openIssues: arrayItems<GithubIssue>(issuesResult, 'issues'),
    latestWorkflowRun,
    latestCheckRun,
    checkRuns,
    latestRelease: firstItem<GithubRelease>(releasesResult, 'releases'),
    latestDeployment: firstItem<GithubDeployment>(deploymentsResult, 'deployments'),
    branches: arrayItems<GithubBranch>(branchesResult, 'branches'),
    tags: arrayItems<GithubTag>(tagsResult, 'tags'),
    localGit,
    githubErrors,
    failureExplanation,
    fetchedAt: new Date().toISOString(),
  })
}

async function handleCommandSummaries(searchParams: URLSearchParams, auth: GithubAuthResolution) {
  const repos = parseCommandSummaryRepos(searchParams.get('repos'))

  if (repos.length === 0) {
    return {
      data: [],
      pageInfo: commandSummaryPageInfo(searchParams),
      error: null,
      permission: auth.token ? 'available' : 'missing-token',
    } satisfies GithubRequestResult
  }

  const summaries = await Promise.all(
    repos.map((candidate) =>
      buildGithubRepoCommandSummary({
        owner: candidate.owner,
        repo: candidate.repo,
        auth,
      }),
    ),
  )

  return {
    data: summaries,
    pageInfo: commandSummaryPageInfo(searchParams),
    error: null,
    permission: summaries.reduce<GithubRequestResult['permission']>(
      (current, summary) =>
        current === 'available' ? commandSummaryPermission(summary) : current,
      'available',
    ),
  } satisfies GithubRequestResult
}

async function handleCommandSummary({
  owner,
  repo,
  searchParams,
  auth,
}: {
  owner: string
  repo: string
  searchParams: URLSearchParams
  auth: GithubAuthResolution
}) {
  const summary = await buildGithubRepoCommandSummary({ owner, repo, auth })
  const firstError =
    summary.repository === null
      ? summary.permissionGaps.find((gap) => gap.status !== null)
      : null

  return {
    data: summary,
    pageInfo: commandSummaryPageInfo(searchParams),
    error: firstError
      ? {
          type: firstError.type as GithubApiError['type'],
          status: firstError.status ?? 500,
          resource: firstError.resource,
          message: firstError.message,
        }
      : null,
    permission: commandSummaryPermission(summary),
  } satisfies GithubRequestResult
}

function detailPermission(results: GithubRequestResult[]): GithubRequestResult['permission'] {
  if (results.some((result) => result.permission === 'missing-token')) {
    return 'missing-token'
  }

  if (results.some((result) => result.permission === 'insufficient')) {
    return 'insufficient'
  }

  if (results.some((result) => result.error)) {
    return 'unknown'
  }

  return 'available'
}

async function handlePullRequestCommandDetail({
  owner,
  repo,
  number,
  searchParams,
  auth,
}: {
  owner: string
  repo: string
  number: number
  searchParams: URLSearchParams
  auth: GithubAuthResolution
}) {
  const repoPath = `/repos/${owner}/${repo}`
  const pullResult = await githubRequest(`${repoPath}/pulls/${number}`, 'pull-request-detail', searchParams, auth)
  const pullRecord = asRecord(pullResult.data)
  const headSha = readString(readRecord(pullRecord, 'head').sha)
  const detailParams = pageParams(MAX_PER_PAGE)
  const [reviewsResult, filesResult, checksResult] = pullResult.error
    ? [
        {
          data: [],
          pageInfo: parsePageInfo(detailParams, null),
          error: null,
          permission: 'available',
        } satisfies GithubRequestResult,
        {
          data: [],
          pageInfo: parsePageInfo(detailParams, null),
          error: null,
          permission: 'available',
        } satisfies GithubRequestResult,
        {
          data: { check_runs: [] },
          pageInfo: parsePageInfo(detailParams, null),
          error: null,
          permission: 'available',
        } satisfies GithubRequestResult,
      ]
    : await Promise.all([
        githubRequest(
          withPagination(`${repoPath}/pulls/${number}/reviews`, detailParams),
          'pull-request-reviews',
          detailParams,
          auth,
        ),
        githubRequest(
          withPagination(`${repoPath}/pulls/${number}/files`, detailParams),
          'pull-request-files',
          detailParams,
          auth,
        ),
        headSha
          ? githubRequest(
              withPagination(`${repoPath}/commits/${encodeURIComponent(headSha)}/check-runs`, detailParams),
              'checks',
              detailParams,
              auth,
            )
          : Promise.resolve({
              data: { check_runs: [] },
              pageInfo: parsePageInfo(detailParams, null),
              error: null,
              permission: 'available',
            } satisfies GithubRequestResult),
      ])
  const results = [pullResult, reviewsResult, filesResult, checksResult]
  const permissionGaps = results
    .map((result) => result.error)
    .filter((error): error is GithubApiError => error !== null)
    .map(permissionGapFromError)

  return {
    data: compactPullRequestCommandDetail({
      pullRequest: pullResult.data,
      reviews: Array.isArray(reviewsResult.data) ? reviewsResult.data : [],
      files: Array.isArray(filesResult.data) ? filesResult.data : [],
      checkRuns: arrayItems<GithubCheckRun>(checksResult, 'checks'),
      permissionGaps,
    }),
    pageInfo: commandSummaryPageInfo(searchParams),
    error: pullResult.error,
    permission: detailPermission(results),
  } satisfies GithubRequestResult
}

async function handleIssueCommandDetail({
  owner,
  repo,
  number,
  searchParams,
  auth,
}: {
  owner: string
  repo: string
  number: number
  searchParams: URLSearchParams
  auth: GithubAuthResolution
}) {
  const repoPath = `/repos/${owner}/${repo}`
  const issueResult = await githubRequest(`${repoPath}/issues/${number}`, 'issue-detail', searchParams, auth)
  const detailParams = pageParams(5)
  const commentsResult = issueResult.error
    ? ({
        data: [],
        pageInfo: parsePageInfo(detailParams, null),
        error: null,
        permission: 'available',
      } satisfies GithubRequestResult)
    : await githubRequest(
        withPagination(`${repoPath}/issues/${number}/comments`, detailParams),
        'issue-comments',
        detailParams,
        auth,
      )
  const results = [issueResult, commentsResult]
  const permissionGaps = results
    .map((result) => result.error)
    .filter((error): error is GithubApiError => error !== null)
    .map(permissionGapFromError)

  return {
    data: compactIssueCommandDetail({
      issue: issueResult.data,
      comments: Array.isArray(commentsResult.data) ? commentsResult.data : [],
      permissionGaps,
    }),
    pageInfo: commandSummaryPageInfo(searchParams),
    error: issueResult.error,
    permission: detailPermission(results),
  } satisfies GithubRequestResult
}

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
