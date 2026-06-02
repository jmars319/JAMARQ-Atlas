import type {
  GithubCheckRun,
  GithubCommandDetailGap,
  GithubIssueCommandDetail,
  GithubPullRequestCommandDetail,
} from '../../src/services/githubIntegration'
import type { GithubApiError } from './core'

type JsonRecord = Record<string, unknown>

export function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null ? (value as JsonRecord) : {}
}

export function readRecord(value: unknown, key: string): JsonRecord {
  return asRecord(asRecord(value)[key])
}

export function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

export function readNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

export function readBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

export function compactRepo(repo: unknown) {
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

export function compactCommit(commit: unknown) {
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

export function compactPullRequest(pullRequest: unknown) {
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

export function compactIssue(issue: unknown) {
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

export function compactRelease(release: unknown) {
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

export function compactWorkflow(workflow: unknown) {
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

export function compactWorkflowRun(run: unknown) {
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

export function compactDeployment(deployment: unknown) {
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

export function compactCheckRun(checkRun: unknown) {
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

export function compactBranch(branch: unknown) {
  const record = asRecord(branch)
  const commit = readRecord(branch, 'commit')

  return {
    name: readString(record.name) ?? '',
    protected: readBoolean(record.protected) ?? false,
    commitSha: readString(commit.sha) ?? '',
    commitUrl: readString(commit.url) ?? '',
  }
}

export function compactTag(tag: unknown) {
  const record = asRecord(tag)
  const commit = readRecord(tag, 'commit')

  return {
    name: readString(record.name) ?? '',
    commitSha: readString(commit.sha) ?? '',
    zipballUrl: readString(record.zipball_url) ?? '',
    tarballUrl: readString(record.tarball_url) ?? '',
  }
}

export function compactStringList(value: unknown, key = 'login') {
  return Array.isArray(value)
    ? value.map((item) => readString(asRecord(item)[key]) ?? '').filter(Boolean)
    : []
}

export function compactLabelList(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => readString(asRecord(item).name) ?? '').filter(Boolean)
    : []
}

export function excerpt(value: unknown, limit = 600) {
  const text = readString(value) ?? ''
  const normalized = text.replace(/\s+/g, ' ').trim()

  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized
}

export function permissionGapFromError(error: GithubApiError): GithubCommandDetailGap {
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

export function checkConclusionCounts(checkRuns: GithubCheckRun[]) {
  return checkRuns.reduce<Record<string, number>>((counts, check) => {
    const key = check.conclusion ?? check.status

    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {})
}

export function compactCommentPreview(comment: unknown) {
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

export function compactPullRequestCommandDetail({
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

export function compactIssueCommandDetail({
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
