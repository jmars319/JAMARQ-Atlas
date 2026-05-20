import { requestJson } from './requestClient'

export type LocalGitRepositoryStatusKind =
  | 'available'
  | 'not-configured'
  | 'not-found'
  | 'invalid-request'
  | 'error'

export type LocalGitChangeKind =
  | 'added'
  | 'copied'
  | 'deleted'
  | 'modified'
  | 'renamed'
  | 'type-change'
  | 'unmerged'
  | 'unknown'
  | 'untracked'

export interface LocalGitLatestCommit {
  sha: string
  shortSha: string
  subject: string
  author: string
  date: string
}

export interface LocalGitRepositoryStatus {
  owner: string
  repo: string
  path: string
  remoteUrl: string
  branch: string
  upstream: string | null
  dirty: boolean
  changedFiles: number
  ahead: number | null
  behind: number | null
  latestCommit: LocalGitLatestCommit | null
  checkedAt: string
  diagnostic: string
}

export interface LocalGitRepositoryStatusResponse {
  ok: boolean
  configured: boolean
  status: LocalGitRepositoryStatusKind
  roots: string[]
  data: LocalGitRepositoryStatus | null
  error: {
    type: LocalGitRepositoryStatusKind
    message: string
  } | null
}

export interface LocalGitFileChange {
  path: string
  previousPath: string | null
  indexStatus: string
  worktreeStatus: string
  change: LocalGitChangeKind
  staged: boolean
  unstaged: boolean
  untracked: boolean
  additions: number | null
  deletions: number | null
}

export interface LocalGitDryRunCommitPreview {
  available: boolean
  blocked: boolean
  subjectSuggestion: string
  bodyLines: string[]
  commandPreview: string[]
  blockers: string[]
}

export interface LocalGitRepositoryPreview {
  status: LocalGitRepositoryStatus
  stagedCount: number
  unstagedCount: number
  untrackedCount: number
  additions: number | null
  deletions: number | null
  changedFiles: LocalGitFileChange[]
  diffStat: {
    unstaged: string
    staged: string
  }
  dryRunCommit: LocalGitDryRunCommitPreview
}

export interface LocalGitRepositoryPreviewResponse {
  ok: boolean
  configured: boolean
  status: LocalGitRepositoryStatusKind
  roots: string[]
  data: LocalGitRepositoryPreview | null
  error: {
    type: LocalGitRepositoryStatusKind
    message: string
  } | null
}

export function localGitStatusPath(owner: string, repo: string) {
  const params = new URLSearchParams({ owner, repo })

  return `/api/git/repositories/status?${params.toString()}`
}

export function localGitPreviewPath(owner: string, repo: string) {
  const params = new URLSearchParams({ owner, repo })

  return `/api/git/repositories/preview?${params.toString()}`
}

export async function fetchLocalGitStatus(owner: string, repo: string, signal?: AbortSignal) {
  return requestJson<LocalGitRepositoryStatusResponse>(
    localGitStatusPath(owner, repo),
    {},
    { signal, retries: 1, retrySafe: true, timeoutMs: 12_000 },
  )
}

export async function fetchLocalGitPreview(owner: string, repo: string, signal?: AbortSignal) {
  return requestJson<LocalGitRepositoryPreviewResponse>(
    localGitPreviewPath(owner, repo),
    {},
    { signal, retries: 1, retrySafe: true, timeoutMs: 12_000 },
  )
}
