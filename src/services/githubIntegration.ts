export interface GithubIngestionContract {
  cacheFile: string
  command: string
  environment: string[]
  responsibilities: string[]
}

export type GithubPermissionState =
  | 'available'
  | 'missing-token'
  | 'insufficient'
  | 'unknown'

export type GithubErrorType =
  | 'missing-token'
  | 'unauthorized'
  | 'insufficient-permission'
  | 'not-found-or-private'
  | 'rate-limited'
  | 'github-unavailable'
  | 'unknown'

export interface GithubPageInfo {
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

export interface GithubApiResponse<T> {
  data: T | null
  pageInfo: GithubPageInfo
  error: GithubApiError | null
  permission: GithubPermissionState
}

export interface GithubConnectionState {
  configured: boolean
  configuredRepos: string[]
  authMode: 'server-env'
}

export interface GithubRepositorySummary {
  id: number
  name: string
  fullName: string
  private: boolean
  description: string | null
  htmlUrl: string
  defaultBranch: string
  visibility: string
  language: string | null
  updatedAt: string
  pushedAt: string | null
  openIssuesCount: number
  stargazersCount: number
  forksCount: number
  archived: boolean
  disabled: boolean
}

export interface GithubCommit {
  sha: string
  shortSha: string
  message: string
  author: string | null
  date: string | null
  htmlUrl: string
  verified: boolean | null
  verificationReason: string | null
}

export interface GithubPullRequest {
  id: number
  number: number
  state: string
  title: string
  draft: boolean
  mergedAt: string | null
  user: string | null
  base: string | null
  head: string | null
  createdAt: string
  updatedAt: string
  htmlUrl: string
}

export interface GithubIssue {
  id: number
  number: number
  state: string
  title: string
  user: string | null
  labels: string[]
  comments: number
  createdAt: string
  updatedAt: string
  closedAt: string | null
  htmlUrl: string
}

export interface GithubRelease {
  id: number
  name: string | null
  tagName: string
  draft: boolean
  prerelease: boolean
  immutable: boolean
  author: string | null
  createdAt: string
  publishedAt: string | null
  htmlUrl: string
}

export interface GithubWorkflow {
  id: number
  name: string
  path: string
  state: string
  createdAt: string
  updatedAt: string
  htmlUrl: string
}

export interface GithubWorkflowRun {
  id: number
  name: string | null
  displayTitle: string
  status: string
  conclusion: string | null
  branch: string | null
  event: string
  actor: string | null
  runNumber: number
  runAttempt: number
  createdAt: string
  updatedAt: string
  runStartedAt: string | null
  htmlUrl: string
}

export interface GithubDeployment {
  id: number
  sha: string
  shortSha: string
  ref: string
  task: string
  environment: string
  creator: string | null
  description: string | null
  createdAt: string
  updatedAt: string
  statusesUrl: string
}

export interface GithubCheckRun {
  id: number
  name: string
  status: string
  conclusion: string | null
  startedAt: string | null
  completedAt: string | null
  htmlUrl: string
  app: string | null
  detailsUrl: string | null
}

export type GithubResourceName =
  | 'overview'
  | 'commits'
  | 'pulls'
  | 'issues'
  | 'workflows'
  | 'workflow-runs'
  | 'releases'
  | 'deployments'
  | 'checks'

export interface AutomationSignal {
  id: string
  tone: 'info' | 'warning' | 'danger' | 'muted'
  title: string
  detail: string
  source: 'manual' | 'github'
}

export interface GithubSnapshotRepository {
  id: number
  name: string
  fullName: string
  private: boolean
  htmlUrl: string
  defaultBranch: string
  updatedAt: string
  pushedAt: string | null
  commits: unknown[]
  pullRequests: unknown[]
  issues: unknown[]
  releases: unknown[]
  workflowRuns: unknown[]
}

export interface GithubSnapshot {
  generatedAt: string | null
  source: 'github' | 'none'
  repositories: GithubSnapshotRepository[]
}

export const githubIngestionContract: GithubIngestionContract = {
  cacheFile: 'src/data/github/github-snapshot.json',
  command: 'npm run dev',
  environment: ['GITHUB_TOKEN or GH_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPOS'],
  responsibilities: [
    'Serve read-only GitHub data through the local /api/github boundary.',
    'Keep GitHub tokens in the local server environment, not browser code.',
    'Never overwrite manual status, next action, current risk, blockers, or decisions.',
  ],
}

export async function fetchGithubJson<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, { signal })

  if (!response.ok) {
    throw new Error(`Atlas GitHub API returned ${response.status}`)
  }

  return response.json() as Promise<T>
}
