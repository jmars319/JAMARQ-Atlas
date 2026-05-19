import { requestJson } from './requestClient'

export type LocalGitRepositoryStatusKind =
  | 'available'
  | 'not-configured'
  | 'not-found'
  | 'invalid-request'
  | 'error'

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

export function localGitStatusPath(owner: string, repo: string) {
  const params = new URLSearchParams({ owner, repo })

  return `/api/git/repositories/status?${params.toString()}`
}

export async function fetchLocalGitStatus(owner: string, repo: string, signal?: AbortSignal) {
  return requestJson<LocalGitRepositoryStatusResponse>(
    localGitStatusPath(owner, repo),
    {},
    { signal, retries: 1, retrySafe: true, timeoutMs: 12_000 },
  )
}
