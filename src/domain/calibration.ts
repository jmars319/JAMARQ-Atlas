export const ATLAS_CALIBRATION_SCHEMA_VERSION = 1

export type AtlasCalibrationSchemaVersion = typeof ATLAS_CALIBRATION_SCHEMA_VERSION

export type CalibrationCategory =
  | 'dispatch-targets'
  | 'github-bindings'
  | 'host-config'
  | 'health-urls'
  | 'backup-rollback'
  | 'verification-gaps'
  | 'client-labels'

export type CalibrationFieldStatus = 'needs-value' | 'entered' | 'verified' | 'deferred'

export type CalibrationAuditEventType =
  | 'field-progress'
  | 'field-edit'
  | 'bulk-edit'
  | 'credential-reference'
  | 'import-apply'

export interface CalibrationFieldProgress {
  id: string
  issueId: string
  category: CalibrationCategory
  projectId: string | null
  targetId: string | null
  field: string
  status: CalibrationFieldStatus
  note: string
  operatorLabel: string
  createdAt: string
  updatedAt: string
  verifiedAt: string | null
}

export interface CalibrationAuditEvent {
  id: string
  type: CalibrationAuditEventType
  occurredAt: string
  operatorLabel: string
  summary: string
  issueId?: string
  projectId?: string | null
  targetId?: string | null
  field?: string
}

export interface CalibrationCredentialReference {
  id: string
  label: string
  provider: string
  purpose: string
  projectIds: string[]
  targetIds: string[]
  notes: string
  createdAt: string
  updatedAt: string
}

export interface AtlasCalibrationState {
  schemaVersion: AtlasCalibrationSchemaVersion
  fieldProgress: CalibrationFieldProgress[]
  credentialReferences: CalibrationCredentialReference[]
  auditEvents: CalibrationAuditEvent[]
  updatedAt: string
}

export const emptyAtlasCalibrationState: AtlasCalibrationState = {
  schemaVersion: ATLAS_CALIBRATION_SCHEMA_VERSION,
  fieldProgress: [],
  credentialReferences: [],
  auditEvents: [],
  updatedAt: '',
}
