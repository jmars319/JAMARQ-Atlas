import {
  deriveGithubRepoCommandSummary,
  githubRunIsStale,
  type GithubFailureExplanation,
  type GithubRepoCommandSummary,
} from '../../src/services/githubCommand'
import type {
  GithubBranch,
  GithubCheckRun,
  GithubCommit,
  GithubDeployment,
  GithubIssue,
  GithubPullRequest,
  GithubRelease,
  GithubRepositorySummary,
  GithubTag,
  GithubWorkflowRun,
} from '../../src/services/githubIntegration'
import type { GithubAuthResolution } from '../githubAuth'
import { getLocalGitRepositoryStatus } from '../localGitApi'
import {
  MAX_PER_PAGE,
  githubRequest,
  parsePageInfo,
  withPagination,
  type GithubApiError,
  type GithubRequestResult,
} from './core'
import {
  asRecord,
  compactIssueCommandDetail,
  compactPullRequestCommandDetail,
  normalizeGithubResource,
  permissionGapFromError,
  readNumber,
  readRecord,
  readString,
} from './compact'

export function commandSummaryPageInfo(searchParams: URLSearchParams) {
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

export async function handleCommandSummaries(searchParams: URLSearchParams, auth: GithubAuthResolution) {
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

export async function handleCommandSummary({
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

export async function handlePullRequestCommandDetail({
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

export async function handleIssueCommandDetail({
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
