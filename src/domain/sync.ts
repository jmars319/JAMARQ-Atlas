import type { Workspace } from './atlas'
import type { DispatchState } from './dispatch'
import type { WritingWorkbenchState } from './writing'

export const ATLAS_SYNC_SCHEMA_VERSION = 1

export type AtlasSyncSchemaVersion = typeof ATLAS_SYNC_SCHEMA_VERSION
export type AtlasSyncProviderStatus = 'local-only' | 'not-configured'
export type AtlasSyncProviderOperation = 'push' | 'pull'

export interface AtlasSyncCoreStores {
  workspace: Workspace
  dispatch: DispatchState
  writing: WritingWorkbenchState
}

export interface AtlasSyncStoreSummary {
  workspace: {
    sections: number
    groups: number
    projects: number
    repositoryBindings: number
    activityEvents: number
  }
  dispatch: {
    targets: number
    records: number
    readinessEntries: number
    preflightRuns: number
  }
  writing: {
    drafts: number
    reviewEvents: number
    approvedDrafts: number
    exportedDrafts: number
    archivedDrafts: number
  }
}

export interface AtlasSyncSnapshot {
  id: string
  label: string
  note: string
  createdAt: string
  deviceId: string
  deviceLabel: string
  fingerprint: string
  summary: AtlasSyncStoreSummary
  stores: AtlasSyncCoreStores
}

export interface AtlasSyncProviderState {
  id: 'local'
  status: AtlasSyncProviderStatus
  message: string
  updatedAt: string
}

export interface AtlasSyncState {
  schemaVersion: AtlasSyncSchemaVersion
  deviceId: string
  deviceLabel: string
  provider: AtlasSyncProviderState
  snapshots: AtlasSyncSnapshot[]
  updatedAt: string
}

export interface AtlasSyncRestorePreview {
  snapshotId: string
  currentSummary: AtlasSyncStoreSummary
  incomingSummary: AtlasSyncStoreSummary
  warnings: string[]
  normalizedStores: AtlasSyncCoreStores
}

export interface AtlasSyncProviderResult {
  operation: AtlasSyncProviderOperation
  status: 'not-configured'
  message: string
  occurredAt: string
}
