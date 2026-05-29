export const ATLAS_REPO_WORKFLOW_RUNS_SCHEMA_VERSION = 1

export type AtlasRepoWorkflowRunsSchemaVersion =
  typeof ATLAS_REPO_WORKFLOW_RUNS_SCHEMA_VERSION

export type RepoWorkflowCommandKind =
  | 'git-fetch-prune'
  | 'git-pull-ff-only'
  | 'verify-command'

export type RepoWorkflowRunStatus = 'completed' | 'failed' | 'blocked'

export interface RepoWorkflowCommand {
  kind: RepoWorkflowCommandKind
  command?: string
}

export interface RepoWorkflowRun {
  id: string
  repositoryId: string
  owner: string
  repo: string
  command: RepoWorkflowCommand
  commandLabel: string
  status: RepoWorkflowRunStatus
  startedAt: string
  endedAt: string
  exitCode: number | null
  outputExcerpt: string
  planningItemId: string
  diagnostic: string
}

export interface RepoWorkflowRunsState {
  schemaVersion: AtlasRepoWorkflowRunsSchemaVersion
  runs: RepoWorkflowRun[]
  updatedAt: string
}

export const emptyRepoWorkflowRunsState: RepoWorkflowRunsState = {
  schemaVersion: ATLAS_REPO_WORKFLOW_RUNS_SCHEMA_VERSION,
  runs: [],
  updatedAt: '',
}
