import type { Workspace } from './atlas'
import type { DispatchState } from './dispatch'
import type { AtlasPlanningState } from './planning'
import type { ReportsState } from './reports'
import type { ReviewState } from './review'
import type { WritingWorkbenchState } from './writing'

export const ATLAS_SYNC_SCHEMA_VERSION = 3

export type AtlasSyncSchemaVersion = typeof ATLAS_SYNC_SCHEMA_VERSION
export type AtlasSyncProviderId = 'local' | 'supabase'
export type AtlasSyncProviderStatus = 'local-only' | 'not-configured' | 'configured' | 'error'
export type AtlasSyncProviderOperation = 'push' | 'pull'

export interface AtlasSyncCoreStores {
  workspace: Workspace
  dispatch: DispatchState
  writing: WritingWorkbenchState
  planning: AtlasPlanningState
  reports: ReportsState
  review: ReviewState
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
  planning: {
    objectives: number
    milestones: number
    workSessions: number
    notes: number
    active: number
    planned: number
    waiting: number
  }
  reports: {
    packets: number
    auditEvents: number
    exportedPackets: number
    archivedPackets: number
  }
  review: {
    sessions: number
    notes: number
    followUps: number
    planned: number
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

export interface AtlasRemoteSyncSnapshot {
  id: string
  label: string
  note: string
  createdAt: string
  deviceId: string
  deviceLabel: string
  fingerprint: string
  summary: AtlasSyncStoreSummary
}

export interface AtlasSyncProviderState {
  id: AtlasSyncProviderId
  status: AtlasSyncProviderStatus
  message: string
  updatedAt: string
  workspaceId?: string
  lastPushAt?: string
  lastPullAt?: string
  remoteSnapshots: AtlasRemoteSyncSnapshot[]
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
  fingerprintMatches: boolean
  warnings: string[]
  normalizedStores: AtlasSyncCoreStores
}

export interface AtlasSyncSnapshotComparison {
  snapshotId: string
  localFingerprint: string
  remoteFingerprint: string
  fingerprintMatches: boolean
  createdAt: string
  deviceLabel: string
  countDrops: string[]
  summaryLines: string[]
}

export interface AtlasSyncRetentionNotice {
  limit: number
  shown: number
  message: string
  warning: string | null
}

export interface AtlasSyncProviderResult {
  operation: AtlasSyncProviderOperation
  status: 'not-configured' | 'configured' | 'error'
  message: string
  occurredAt: string
}

export interface AtlasSyncApiError {
  type: 'not-configured' | 'supabase-error' | 'invalid-request' | 'not-found' | 'unknown'
  message: string
}
