import type { Workspace } from './atlas'
import type { DispatchState } from './dispatch'
import type { AtlasSettingsState } from './settings'
import type { AtlasSyncState } from './sync'
import type { WritingWorkbenchState } from './writing'

export const ATLAS_BACKUP_KIND = 'jamarq-atlas-backup'
export const ATLAS_BACKUP_SCHEMA_VERSION = 2

export type AtlasBackupSchemaVersion = 1 | typeof ATLAS_BACKUP_SCHEMA_VERSION

export interface AtlasBackupStores {
  workspace: Workspace
  dispatch: DispatchState
  writing: WritingWorkbenchState
  settings: AtlasSettingsState
  sync: AtlasSyncState
}

export interface AtlasBackupStoreSummary {
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
  settings: {
    configured: number
    hasOperatorLabel: number
  }
  sync: {
    snapshots: number
    providerConfigured: number
  }
}

export interface AtlasBackupEnvelope {
  kind: typeof ATLAS_BACKUP_KIND
  schemaVersion: AtlasBackupSchemaVersion
  exportedAt: string
  appName: 'JAMARQ Atlas'
  stores: AtlasBackupStores
  summary: AtlasBackupStoreSummary
}

export type AtlasRestoreWarningType =
  | 'empty-store'
  | 'missing-writing'
  | 'missing-dispatch'
  | 'missing-settings'
  | 'missing-sync'
  | 'legacy-normalized'

export interface AtlasRestoreWarning {
  type: AtlasRestoreWarningType
  message: string
}

export interface AtlasBackupValidationResult {
  ok: boolean
  errors: string[]
  warnings: AtlasRestoreWarning[]
  envelope: AtlasBackupEnvelope | null
}

export interface AtlasRestorePreview {
  currentSummary: AtlasBackupStoreSummary
  incomingSummary: AtlasBackupStoreSummary
  warnings: AtlasRestoreWarning[]
  normalizedStores: AtlasBackupStores
}
