import type { Workspace } from './atlas'
import type { AtlasCalibrationState } from './calibration'
import type { DispatchState } from './dispatch'
import type { AtlasPlanningState } from './planning'
import type { ReportsState } from './reports'
import type { ReviewState } from './review'
import type { AtlasSettingsState } from './settings'
import type { AtlasSyncState } from './sync'
import type { WritingWorkbenchState } from './writing'

export const ATLAS_BACKUP_KIND = 'jamarq-atlas-backup'
export const ATLAS_BACKUP_SCHEMA_VERSION = 5

export type AtlasBackupSchemaVersion = 1 | 2 | 3 | 4 | typeof ATLAS_BACKUP_SCHEMA_VERSION

export interface AtlasBackupStores {
  workspace: Workspace
  dispatch: DispatchState
  writing: WritingWorkbenchState
  planning: AtlasPlanningState
  reports: ReportsState
  review: ReviewState
  calibration: AtlasCalibrationState
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
    hostEvidenceRuns: number
    verificationEvidenceRuns: number
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
  calibration: {
    progressRecords: number
    needsValue: number
    entered: number
    verified: number
    deferred: number
    credentialReferences: number
    auditEvents: number
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

export type AtlasStoreDiagnosticStatus = 'ok' | 'warning' | 'danger'

export interface AtlasStoreDiagnostic {
  id: string
  label: string
  schemaVersion: string
  localStorageKey: string
  backupIncluded: boolean
  syncSnapshotIncluded: boolean
  restoreBehavior: string
  secretPolicy: string
  status: AtlasStoreDiagnosticStatus
  countSummary: string
  messages: string[]
  repairHint: string
}

export interface AtlasBackupDiffItem {
  id: string
  label: string
  current: number
  incoming: number
  delta: number
  status: AtlasStoreDiagnosticStatus
}

export type AtlasRestoreWarningType =
  | 'empty-store'
  | 'missing-writing'
  | 'missing-dispatch'
  | 'missing-planning'
  | 'missing-reports'
  | 'missing-review'
  | 'missing-calibration'
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
  diffs: AtlasBackupDiffItem[]
  warnings: AtlasRestoreWarning[]
  normalizedStores: AtlasBackupStores
}
