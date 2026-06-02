export type EnvRecord = Record<string, string | undefined>

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

export interface LocalGitChangeGroup {
  change: LocalGitChangeKind
  label: string
  count: number
  paths: string[]
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
  changeGroups: LocalGitChangeGroup[]
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

export type LocalGitWorkflowCommandKind =
  | 'git-fetch-prune'
  | 'git-pull-ff-only'
  | 'verify-command'

export type LocalGitWorkflowRunStatus = 'completed' | 'failed' | 'blocked'

export interface LocalGitWorkflowCommand {
  kind: LocalGitWorkflowCommandKind
  command?: string
}

export interface LocalGitWorkflowRun {
  id: string
  repositoryId: string
  owner: string
  repo: string
  command: LocalGitWorkflowCommand
  commandLabel: string
  status: LocalGitWorkflowRunStatus
  startedAt: string
  endedAt: string
  exitCode: number | null
  outputExcerpt: string
  planningItemId: string
  diagnostic: string
}

export interface LocalGitWorkflowRunResponse {
  ok: boolean
  configured: boolean
  status: LocalGitWorkflowRunStatus | LocalGitRepositoryStatusKind
  roots: string[]
  run: LocalGitWorkflowRun | null
  error: {
    type: string
    message: string
  } | null
}

export interface LocalGitWorkflowRunsResponse {
  ok: boolean
  runs: LocalGitWorkflowRun[]
}

export interface GitBranchStatus {
  branch: string
  upstream: string | null
  ahead: number | null
  behind: number | null
}
