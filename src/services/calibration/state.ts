import { ATLAS_CALIBRATION_SCHEMA_VERSION, emptyAtlasCalibrationState, type AtlasCalibrationState, type CalibrationAuditEvent, type CalibrationAuditEventType, type CalibrationCategory, type CalibrationCredentialReference, type CalibrationFieldProgress, type CalibrationFieldStatus } from '../../domain/calibration'
import { createCalibrationId, isRecord, readString, readStringArray, safeDate } from './shared'
import { canStoreCalibrationValue, isSecretLikeValue } from './validation'
import { CALIBRATION_AUDIT_LIMIT, type CalibrationIssue } from './types'

function readFieldStatus(value: unknown): CalibrationFieldStatus {
  return value === 'entered' || value === 'verified' || value === 'deferred'
    ? value
    : 'needs-value'
}

function normalizeFieldProgress(value: unknown, now: Date): CalibrationFieldProgress | null {
  if (!isRecord(value)) {
    return null
  }

  const issueId = readString(value.issueId)
  const field = readString(value.field)

  if (!issueId || !field) {
    return null
  }

  const updatedAt = safeDate(value.updatedAt, now)

  return {
    id: readString(value.id) || issueId,
    issueId,
    category: readString(value.category) as CalibrationCategory,
    projectId: readString(value.projectId) || null,
    targetId: readString(value.targetId) || null,
    field,
    status: readFieldStatus(value.status),
    note: readString(value.note),
    operatorLabel: readString(value.operatorLabel),
    createdAt: safeDate(value.createdAt, now),
    updatedAt,
    verifiedAt: readString(value.verifiedAt) ? safeDate(value.verifiedAt, now) : null,
  }
}

function normalizeCredentialReference(
  value: unknown,
  now: Date,
): CalibrationCredentialReference | null {
  if (!isRecord(value)) {
    return null
  }

  const label = readString(value.label).trim()

  if (!label || isSecretLikeValue(label) || isSecretLikeValue(readString(value.notes))) {
    return null
  }

  return {
    id: readString(value.id) || `credential-ref-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    label,
    provider: readString(value.provider),
    purpose: readString(value.purpose),
    projectIds: readStringArray(value.projectIds),
    targetIds: readStringArray(value.targetIds),
    notes: readString(value.notes),
    createdAt: safeDate(value.createdAt, now),
    updatedAt: safeDate(value.updatedAt, now),
  }
}

function readAuditType(value: unknown): CalibrationAuditEventType {
  return value === 'field-edit' ||
    value === 'bulk-edit' ||
    value === 'credential-reference' ||
    value === 'import-apply'
    ? value
    : 'field-progress'
}

function normalizeAuditEvent(value: unknown, now: Date): CalibrationAuditEvent | null {
  if (!isRecord(value)) {
    return null
  }

  const summary = readString(value.summary)

  if (!summary) {
    return null
  }

  return {
    id: readString(value.id) || createCalibrationId('calibration-audit', now),
    type: readAuditType(value.type),
    occurredAt: safeDate(value.occurredAt, now),
    operatorLabel: readString(value.operatorLabel),
    summary,
    issueId: readString(value.issueId) || undefined,
    projectId: readString(value.projectId) || null,
    targetId: readString(value.targetId) || null,
    field: readString(value.field) || undefined,
  }
}

export function emptyCalibrationState(now = new Date()): AtlasCalibrationState {
  return {
    ...emptyAtlasCalibrationState,
    updatedAt: now.toISOString(),
  }
}

export function normalizeCalibrationState(
  value: unknown,
  now = new Date(),
): AtlasCalibrationState {
  const defaults = emptyCalibrationState(now)

  if (!isRecord(value)) {
    return defaults
  }

  return {
    schemaVersion: ATLAS_CALIBRATION_SCHEMA_VERSION,
    fieldProgress: Array.isArray(value.fieldProgress)
      ? value.fieldProgress
          .map((item) => normalizeFieldProgress(item, now))
          .filter((item): item is CalibrationFieldProgress => item !== null)
      : [],
    credentialReferences: Array.isArray(value.credentialReferences)
      ? value.credentialReferences
          .map((item) => normalizeCredentialReference(item, now))
          .filter((item): item is CalibrationCredentialReference => item !== null)
      : [],
    auditEvents: Array.isArray(value.auditEvents)
      ? value.auditEvents
          .map((item) => normalizeAuditEvent(item, now))
          .filter((item): item is CalibrationAuditEvent => item !== null)
          .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
          .slice(0, CALIBRATION_AUDIT_LIMIT)
      : [],
    updatedAt: safeDate(value.updatedAt, now),
  }
}

function createAuditEvent({
  type,
  summary,
  operatorLabel,
  issueId,
  projectId,
  targetId,
  field,
  now = new Date(),
}: {
  type: CalibrationAuditEventType
  summary: string
  operatorLabel?: string
  issueId?: string
  projectId?: string | null
  targetId?: string | null
  field?: string
  now?: Date
}): CalibrationAuditEvent {
  return {
    id: createCalibrationId('calibration-audit', now),
    type,
    occurredAt: now.toISOString(),
    operatorLabel: operatorLabel || '',
    summary,
    issueId,
    projectId,
    targetId,
    field,
  }
}

function appendAudit(
  state: AtlasCalibrationState,
  event: CalibrationAuditEvent,
): CalibrationAuditEvent[] {
  return [event, ...state.auditEvents].slice(0, CALIBRATION_AUDIT_LIMIT)
}

export function updateCalibrationFieldProgress(
  state: AtlasCalibrationState,
  issue: CalibrationIssue,
  status: CalibrationFieldStatus,
  note = '',
  operatorLabel = '',
  now = new Date(),
): AtlasCalibrationState {
  const existing = state.fieldProgress.find((item) => item.issueId === issue.id)
  const updatedAt = now.toISOString()
  const nextRecord: CalibrationFieldProgress = {
    id: existing?.id || issue.id,
    issueId: issue.id,
    category: issue.category,
    projectId: issue.projectId,
    targetId: issue.targetId,
    field: issue.field,
    status,
    note,
    operatorLabel,
    createdAt: existing?.createdAt || updatedAt,
    updatedAt,
    verifiedAt: status === 'verified' ? updatedAt : existing?.verifiedAt ?? null,
  }

  return {
    ...state,
    schemaVersion: ATLAS_CALIBRATION_SCHEMA_VERSION,
    fieldProgress: [
      nextRecord,
      ...state.fieldProgress.filter((item) => item.issueId !== issue.id),
    ],
    auditEvents: appendAudit(
      state,
      createAuditEvent({
        type: 'field-progress',
        summary: `${issue.label} marked ${status}.`,
        operatorLabel,
        issueId: issue.id,
        projectId: issue.projectId,
        targetId: issue.targetId,
        field: issue.field,
        now,
      }),
    ),
    updatedAt,
  }
}

export function recordCalibrationAuditEvent(
  state: AtlasCalibrationState,
  input: {
    type: CalibrationAuditEventType
    summary: string
    operatorLabel?: string
    issueId?: string
    projectId?: string | null
    targetId?: string | null
    field?: string
    now?: Date
  },
): AtlasCalibrationState {
  const now = input.now ?? new Date()

  return {
    ...state,
    auditEvents: appendAudit(state, createAuditEvent({ ...input, now })),
    updatedAt: now.toISOString(),
  }
}

export function upsertCredentialReference(
  state: AtlasCalibrationState,
  input: {
    label: string
    provider?: string
    purpose?: string
    projectIds?: string[]
    targetIds?: string[]
    notes?: string
    operatorLabel?: string
    now?: Date
  },
): { ok: true; state: AtlasCalibrationState } | { ok: false; message: string } {
  const label = input.label.trim()
  const notes = input.notes?.trim() ?? ''
  const provider = input.provider?.trim() ?? ''
  const purpose = input.purpose?.trim() ?? ''

  for (const value of [label, notes, provider, purpose]) {
    const check = canStoreCalibrationValue(value)
    if (!check.ok) {
      return { ok: false, message: check.message }
    }
  }

  if (!label) {
    return { ok: false, message: 'Credential reference label is required.' }
  }

  const now = input.now ?? new Date()
  const existing = state.credentialReferences.find(
    (reference) => reference.label.toLowerCase() === label.toLowerCase(),
  )
  const reference: CalibrationCredentialReference = {
    id:
      existing?.id ||
      `credential-ref-${label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')}`,
    label,
    provider,
    purpose,
    projectIds: input.projectIds ?? existing?.projectIds ?? [],
    targetIds: input.targetIds ?? existing?.targetIds ?? [],
    notes,
    createdAt: existing?.createdAt || now.toISOString(),
    updatedAt: now.toISOString(),
  }

  const nextState: AtlasCalibrationState = {
    ...state,
    credentialReferences: [
      reference,
      ...state.credentialReferences.filter((candidate) => candidate.id !== reference.id),
    ],
    auditEvents: appendAudit(
      state,
      createAuditEvent({
        type: 'credential-reference',
        summary: `Credential reference ${label} saved without secret values.`,
        operatorLabel: input.operatorLabel,
        now,
      }),
    ),
    updatedAt: now.toISOString(),
  }

  return { ok: true, state: nextState }
}

export function deleteCredentialReference(
  state: AtlasCalibrationState,
  referenceId: string,
  operatorLabel = '',
  now = new Date(),
): AtlasCalibrationState {
  const existing = state.credentialReferences.find((reference) => reference.id === referenceId)

  return {
    ...state,
    credentialReferences: state.credentialReferences.filter(
      (reference) => reference.id !== referenceId,
    ),
    auditEvents: existing
      ? appendAudit(
          state,
          createAuditEvent({
            type: 'credential-reference',
            summary: `Credential reference ${existing.label} removed.`,
            operatorLabel,
            now,
          }),
        )
      : state.auditEvents,
    updatedAt: now.toISOString(),
  }
}
