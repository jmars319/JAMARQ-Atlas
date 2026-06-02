import type { CalibrationAuditEvent, CalibrationCategory } from '../../domain/calibration'

export type { CalibrationCategory } from '../../domain/calibration'

export type CalibrationSeverity = 'needs-real-value' | 'warning'

export type CalibrationEditableTargetField =
  | 'remoteHost'
  | 'remoteUser'
  | 'remoteFrontendPath'
  | 'remoteBackendPath'
  | 'publicUrl'
  | 'healthCheckUrls'
  | 'databaseName'
  | 'credentialRef'

export interface CalibrationIssue {
  id: string
  category: CalibrationCategory
  severity: CalibrationSeverity
  source: 'workspace' | 'dispatch'
  projectId: string | null
  projectName: string
  targetId: string | null
  targetName: string | null
  field: string
  label: string
  value: string
  message: string
  editable: boolean
}

export const CALIBRATION_CATEGORIES: Array<{
  id: CalibrationCategory | 'all'
  label: string
}> = [
  { id: 'all', label: 'All calibration gaps' },
  { id: 'dispatch-targets', label: 'Dispatch targets' },
  { id: 'github-bindings', label: 'GitHub bindings' },
  { id: 'host-config', label: 'Host config' },
  { id: 'health-urls', label: 'Health URLs' },
  { id: 'backup-rollback', label: 'Backup / rollback' },
  { id: 'verification-gaps', label: 'Verification gaps' },
  { id: 'client-labels', label: 'Client labels' },
]

export const CALIBRATION_BULK_FIELDS: Array<{
  id: CalibrationEditableTargetField
  label: string
}> = [
  { id: 'remoteHost', label: 'Remote host' },
  { id: 'remoteUser', label: 'Remote user / label' },
  { id: 'remoteFrontendPath', label: 'Frontend/root path' },
  { id: 'remoteBackendPath', label: 'Backend/API path' },
  { id: 'publicUrl', label: 'Public URL' },
  { id: 'healthCheckUrls', label: 'Health check URLs' },
  { id: 'databaseName', label: 'Database name' },
  { id: 'credentialRef', label: 'Credential reference label' },
]

export interface CalibrationIssueGroup {
  id: string
  label: string
  detail: string
  category: CalibrationCategory
  categoryLabel: string
  projectId: string | null
  targetId: string | null
  issueCount: number
  needsRealValueCount: number
  warningCount: number
  editableCount: number
  issues: CalibrationIssue[]
}

export const CALIBRATION_AUDIT_LIMIT = 80

export type CalibrationImportRowKind =
  | 'dispatch-target'
  | 'repo-binding'
  | 'credential-reference'
  | 'project-manual'
  | 'recovery-plan'
  | 'runbook-artifact'
  | 'runbook-preserve-path'
  | 'runbook-verification-check'

export interface CalibrationQualityMessage {
  field: string
  level: 'warning' | 'blocked'
  message: string
}

export interface CalibrationImportAcceptedRow {
  index: number
  kind: CalibrationImportRowKind
  identifier: string
  changes: string[]
  changeDetails: CalibrationImportChange[]
  warnings: CalibrationQualityMessage[]
  data: Record<string, string>
}

export interface CalibrationImportRejectedRow {
  index: number
  kind: string
  identifier: string
  errors: string[]
  data: Record<string, string>
}

export interface CalibrationImportChange {
  field: string
  before: string
  after: string
  summary: string
}

export interface CalibrationImportKindSummary {
  kind: CalibrationImportRowKind | 'unknown'
  accepted: number
  rejected: number
  warnings: number
}

export interface CalibrationImportPreview {
  acceptedRows: CalibrationImportAcceptedRow[]
  rejectedRows: CalibrationImportRejectedRow[]
  warnings: string[]
  kindSummaries: CalibrationImportKindSummary[]
}

export interface CalibrationReadinessAffectedItem {
  label: string
  projectId: string | null
  targetId: string | null
  count: number
}

export interface CalibrationReadinessReport {
  unresolved: number
  needsValue: number
  entered: number
  verified: number
  deferred: number
  credentialReferences: number
  unregisteredCredentialRefs: number
  importWarnings: number
  categoryCounts: Array<{ category: CalibrationCategory; count: number }>
  topAffectedItems: CalibrationReadinessAffectedItem[]
  latestAuditEvents: CalibrationAuditEvent[]
}
