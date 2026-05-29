export const ATLAS_REPO_OPERATIONS_SCHEMA_VERSION = 1

export type AtlasRepoOperationsSchemaVersion = typeof ATLAS_REPO_OPERATIONS_SCHEMA_VERSION

export type RepoOperationsSnapshotKind = 'repo-operations'

export interface RepoOperationsDocLink {
  label: string
  path: string
}

export interface RepoOperationsProjectHint {
  projectId: string
  label: string
}

export interface RepoOperationsRepository {
  id: string
  name: string
  suite: string
  product: string
  lifecycle: string
  deployCategory: string
  localPathHint: string
  githubRemote: string
  githubOwner: string
  githubRepo: string
  packageManagers: string[]
  verificationCommands: string[]
  docs: RepoOperationsDocLink[]
  projectHints: RepoOperationsProjectHint[]
  notes: string
}

export interface RepoOperationsSnapshotSummary {
  repoCount: number
  activeCount: number
  verificationCommandCount: number
  missingVerificationCount: number
}

export interface RepoOperationsSnapshot {
  schemaVersion: AtlasRepoOperationsSchemaVersion
  kind: RepoOperationsSnapshotKind
  id: string
  title: string
  generatedAt: string
  source: string
  summary: RepoOperationsSnapshotSummary
  repositories: RepoOperationsRepository[]
}

export interface RepoOperationsFilters {
  query: string
  suite: string
  lifecycle: string
  gap: string
}

export interface RepoOperationsPlanningLink {
  repositoryId: string
  projectId: string
  planningItemId: string
  kind: 'note' | 'work-session'
  createdAt: string
}

export interface RepoOperationsState {
  schemaVersion: AtlasRepoOperationsSchemaVersion
  snapshots: RepoOperationsSnapshot[]
  selectedSnapshotId: string
  filters: RepoOperationsFilters
  workflowNotes: Record<string, string>
  planningLinks: RepoOperationsPlanningLink[]
  updatedAt: string
}

export const emptyRepoOperationsState: RepoOperationsState = {
  schemaVersion: ATLAS_REPO_OPERATIONS_SCHEMA_VERSION,
  snapshots: [],
  selectedSnapshotId: '',
  filters: {
    query: '',
    suite: 'all',
    lifecycle: 'all',
    gap: 'all',
  },
  workflowNotes: {},
  planningLinks: [],
  updatedAt: '',
}
