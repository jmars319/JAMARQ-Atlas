import {
  getConfiguredRepos,
  resolveConfiguredRepo,
  type GithubAuthResolution,
} from '../githubAuth'
import {
  DEFAULT_PER_PAGE,
  MAX_PER_PAGE,
  MAX_PAGINATED_GITHUB_PAGES,
  githubRequest,
  parsePageInfo,
  withPagination,
  type GithubApiError,
  type GithubRequestResult,
} from './core'
import { asRecord, normalizeGithubResource, readNumber } from './compact'

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

export async function handleRepos(searchParams: URLSearchParams, auth: GithubAuthResolution) {
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
