import type { ProjectRecord, Workspace } from '../domain/atlas'
import type {
  DeploymentArtifact,
  DeploymentArtifactRole,
  DeploymentPreservePath,
  DeploymentRunbook,
  DeploymentTarget,
  DeploymentVerificationCheck,
  DispatchRecoveryPlan,
  DispatchState,
} from '../domain/dispatch'
import {
  VERIFICATION_CADENCES,
  WORK_STATUSES,
  flattenProjects,
  updateProject,
  type VerificationCadence,
  type WorkStatus,
} from '../domain/atlas'
import {
  ATLAS_CALIBRATION_SCHEMA_VERSION,
  emptyAtlasCalibrationState,
  type AtlasCalibrationState,
  type CalibrationAuditEvent,
  type CalibrationAuditEventType,
  type CalibrationCategory,
  type CalibrationCredentialReference,
  type CalibrationFieldProgress,
  type CalibrationFieldStatus,
} from '../domain/calibration'
import { bindRepositoryToProject, parseRepositoryFullName } from './repoBinding'
import { upsertRecoveryPlan } from './dispatchRecovery'

export type { CalibrationCategory } from '../domain/calibration'

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

const PLACEHOLDER_PATTERN = /\b(placeholder|example|needs real|tbd|todo|unknown|not set)\b/i
const SECRET_SHAPED_PATTERN =
  /(password|passphrase|secret|token|api[_ -]?key|apikey|private[_ -]?key|credential|env[_ -]?var)/i

const CALIBRATION_AUDIT_LIMIT = 80

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string')
}

function safeDate(value: unknown, fallback: Date) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value
  }

  return fallback.toISOString()
}

function createCalibrationId(prefix: string, now = new Date()) {
  return `${prefix}-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function projectName(records: ProjectRecord[], projectId: string) {
  return records.find((record) => record.project.id === projectId)?.project.name ?? projectId
}

function isMissing(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) {
    return value.length === 0 || value.every((item) => item.trim() === '')
  }

  return !value || value.trim() === ''
}

export function isPlaceholderValue(value: string | string[] | null | undefined): boolean {
  if (isMissing(value)) {
    return true
  }

  if (Array.isArray(value)) {
    return value.some((item) => isPlaceholderValue(item))
  }

  return PLACEHOLDER_PATTERN.test(value ?? '')
}

export function isSecretLikeValue(value: string) {
  return SECRET_SHAPED_PATTERN.test(value)
}

function valueLabel(value: string | string[]) {
  return Array.isArray(value) ? value.join('\n') : value
}

function dispatchIssue({
  records,
  target,
  category = 'dispatch-targets',
  field,
  label,
  value,
  message,
  editable = true,
}: {
  records: ProjectRecord[]
  target: DeploymentTarget
  category?: CalibrationCategory
  field: string
  label: string
  value: string | string[]
  message: string
  editable?: boolean
}): CalibrationIssue {
  return {
    id: `dispatch-${target.id}-${field}`,
    category,
    severity: 'needs-real-value',
    source: 'dispatch',
    projectId: target.projectId,
    projectName: projectName(records, target.projectId),
    targetId: target.id,
    targetName: target.name,
    field,
    label,
    value: valueLabel(value),
    message,
    editable,
  }
}

export function calibrationValueToTargetUpdate(
  field: CalibrationEditableTargetField,
  value: string,
): Partial<DeploymentTarget> {
  if (field === 'healthCheckUrls') {
    return {
      healthCheckUrls: splitListValue(value),
    }
  }

  return { [field]: value } as Partial<DeploymentTarget>
}

function workspaceIssue({
  record,
  category,
  field,
  label,
  value,
  message,
}: {
  record: ProjectRecord
  category: CalibrationCategory
  field: string
  label: string
  value: string
  message: string
}): CalibrationIssue {
  return {
    id: `workspace-${record.project.id}-${field}`,
    category,
    severity: 'needs-real-value',
    source: 'workspace',
    projectId: record.project.id,
    projectName: record.project.name,
    targetId: null,
    targetName: null,
    field,
    label,
    value,
    message,
    editable: false,
  }
}

function scanTarget(
  records: ProjectRecord[],
  dispatch: DispatchState,
  target: DeploymentTarget,
  configuredHostTargetIds?: Set<string>,
  credentialReferenceLabels?: Set<string>,
) {
  const issues: CalibrationIssue[] = []
  const latestRecord = dispatch.records
    .filter((record) => record.targetId === target.id)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0]
  const automation = dispatch.automationReadiness.find(
    (readiness) => readiness.projectId === target.projectId && readiness.targetId === target.id,
  )

  const editableFields: Array<{
    field: keyof Pick<
      DeploymentTarget,
      | 'remoteHost'
      | 'remoteUser'
      | 'remoteFrontendPath'
      | 'remoteBackendPath'
      | 'publicUrl'
      | 'healthCheckUrls'
      | 'databaseName'
      | 'credentialRef'
    >
    category: CalibrationCategory
    label: string
    value: string | string[]
    message: string
  }> = [
    {
      field: 'remoteHost',
      category: 'host-config',
      label: 'Remote host',
      value: target.remoteHost,
      message: 'Confirm the production host without storing passwords or tokens.',
    },
    {
      field: 'remoteUser',
      category: 'host-config',
      label: 'Remote user',
      value: target.remoteUser,
      message: 'Use a non-secret username or credential reference only.',
    },
    {
      field: 'remoteFrontendPath',
      category: 'host-config',
      label: 'Frontend path',
      value: target.remoteFrontendPath,
      message: 'Replace placeholder frontend/root paths with the actual cPanel path.',
    },
    {
      field: 'remoteBackendPath',
      category: 'host-config',
      label: 'Backend path',
      value: target.remoteBackendPath,
      message: 'Replace placeholder backend/API paths with the actual cPanel path.',
    },
    {
      field: 'publicUrl',
      category: 'dispatch-targets',
      label: 'Public URL',
      value: target.publicUrl,
      message: 'Use the real production URL so health checks and reports are meaningful.',
    },
    {
      field: 'healthCheckUrls',
      category: 'health-urls',
      label: 'Health check URLs',
      value: target.healthCheckUrls,
      message: 'Add real read-only URLs for homepage/API health checks.',
    },
    {
      field: 'databaseName',
      category: 'dispatch-targets',
      label: 'Database name',
      value: target.databaseName,
      message: 'Use the non-secret database name when a database exists.',
    },
    {
      field: 'credentialRef',
      category: 'host-config',
      label: 'Credential reference label',
      value: target.credentialRef,
      message:
        'Use a non-secret credential reference label such as godaddy-mmh-production; never store the credential value.',
    },
  ]

  for (const item of editableFields) {
    if (item.field === 'databaseName' && !target.hasDatabase) {
      continue
    }

    if (isPlaceholderValue(item.value)) {
      issues.push(dispatchIssue({ records, target, ...item }))
    }
  }

  if (target.backupRequired && target.deploymentNotes.every((note) => !/backup/i.test(note))) {
    issues.push(
      dispatchIssue({
        records,
        target,
        category: 'backup-rollback',
        field: 'backup-notes',
        label: 'Backup notes',
        value: target.deploymentNotes,
        message: 'Backup requirements need explicit non-secret operational notes.',
        editable: false,
      }),
    )
  }

  if (!latestRecord?.rollbackRef || isPlaceholderValue(latestRecord.rollbackRef)) {
    issues.push(
      dispatchIssue({
        records,
        target,
        category: 'backup-rollback',
        field: 'rollback-notes',
        label: 'Rollback reference',
        value: latestRecord?.rollbackRef ?? '',
        message: 'Rollback posture needs a real reference or manual rollback note.',
        editable: false,
      }),
    )
  }

  if (!automation || automation.rollbackRequirements.length === 0) {
    issues.push(
      dispatchIssue({
        records,
        target,
        category: 'backup-rollback',
        field: 'automation-rollback-requirements',
        label: 'Automation rollback requirements',
        value: '',
        message: 'Future automation needs rollback requirements documented before write capability.',
        editable: false,
      }),
    )
  }

  if (
    configuredHostTargetIds &&
    !configuredHostTargetIds.has(target.id) &&
    !isPlaceholderValue(target.remoteHost) &&
    !isPlaceholderValue(target.remoteFrontendPath) &&
    !isPlaceholderValue(target.remoteBackendPath)
  ) {
    issues.push(
      dispatchIssue({
        records,
        target,
        category: 'host-config',
        field: 'host-preflight-config',
        label: 'Host preflight config',
        value: target.credentialRef,
        message:
          'Target has real host/path metadata but no matching server-side host inspector config entry.',
        editable: false,
      }),
    )
  }

  if (
    credentialReferenceLabels &&
    target.credentialRef &&
    !isPlaceholderValue(target.credentialRef) &&
    !credentialReferenceLabels.has(target.credentialRef.toLowerCase())
  ) {
    issues.push(
      dispatchIssue({
        records,
        target,
        category: 'host-config',
        field: 'credentialRef-registry',
        label: 'Credential reference registry',
        value: target.credentialRef,
        message:
          'Dispatch target uses a credential reference label that is not in the local non-secret registry.',
        editable: false,
      }),
    )
  }

  return issues
}

export function scanAtlasCalibration(
  workspace: Workspace,
  dispatch: DispatchState,
  configuredHostTargetIds?: string[],
  credentialReferenceLabels?: string[],
) {
  const records = flattenProjects(workspace)
  const issues: CalibrationIssue[] = []
  const configuredHostTargets = configuredHostTargetIds
    ? new Set(configuredHostTargetIds)
    : undefined
  const credentialLabels = credentialReferenceLabels
    ? new Set(credentialReferenceLabels.map((label) => label.toLowerCase()))
    : undefined

  for (const target of dispatch.targets) {
    issues.push(...scanTarget(records, dispatch, target, configuredHostTargets, credentialLabels))
  }

  for (const record of records) {
    if (record.section.id === 'client-systems') {
      if (isPlaceholderValue(record.project.summary)) {
        issues.push(
          workspaceIssue({
            record,
            category: 'client-labels',
            field: 'summary',
            label: 'Client/project label',
            value: record.project.summary,
            message: 'Client Systems project summary still reads like placeholder context.',
          }),
        )
      }

      const projectTargets = dispatch.targets.filter(
        (target) => target.projectId === record.project.id,
      )
      if (projectTargets.length === 0) {
        issues.push(
          workspaceIssue({
            record,
            category: 'dispatch-targets',
            field: 'deployment-target',
            label: 'Deployment target',
            value: '',
            message: 'Client Systems project has no Dispatch target configured.',
          }),
        )
      }
    }

    if (record.project.repositories.length === 0) {
      issues.push(
        workspaceIssue({
          record,
          category: 'github-bindings',
          field: 'repositories',
          label: 'Repository binding',
          value: '',
          message: 'No GitHub repository is bound. Bind one manually when the source repo is known.',
        }),
      )
    }

    if (!record.project.manual.lastVerified) {
      issues.push(
        workspaceIssue({
          record,
          category: 'verification-gaps',
          field: 'lastVerified',
          label: 'Last verified',
          value: '',
          message: 'Last verified is missing. Verification Center can stamp this manually.',
        }),
      )
    }
  }

  return issues
}

export function canStoreCalibrationValue(value: string) {
  if (isSecretLikeValue(value)) {
    return {
      ok: false,
      message:
        'This looks credential-shaped. Store only non-secret host/path values or a credential reference label.',
    }
  }

  return {
    ok: true,
    message: '',
  }
}

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

export function summarizeCalibrationState(state: AtlasCalibrationState) {
  const fieldProgress = Array.isArray(state?.fieldProgress) ? state.fieldProgress : []
  const credentialReferences = Array.isArray(state?.credentialReferences)
    ? state.credentialReferences
    : []
  const auditEvents = Array.isArray(state?.auditEvents) ? state.auditEvents : []

  return {
    progressRecords: fieldProgress.length,
    needsValue: fieldProgress.filter((item) => item.status === 'needs-value').length,
    entered: fieldProgress.filter((item) => item.status === 'entered').length,
    verified: fieldProgress.filter((item) => item.status === 'verified').length,
    deferred: fieldProgress.filter((item) => item.status === 'deferred').length,
    credentialReferences: credentialReferences.length,
    auditEvents: auditEvents.length,
  }
}

export function createCalibrationReadinessReport({
  issues,
  calibration,
  importPreview = null,
}: {
  issues: CalibrationIssue[]
  calibration: AtlasCalibrationState
  importPreview?: CalibrationImportPreview | null
}): CalibrationReadinessReport {
  const summary = summarizeCalibrationState(calibration)
  const affected = new Map<string, CalibrationReadinessAffectedItem>()

  for (const issue of issues) {
    const key = issue.targetId ?? issue.projectId ?? issue.id
    const label = issue.targetName
      ? `${issue.projectName} / ${issue.targetName}`
      : issue.projectName
    const current = affected.get(key) ?? {
      label,
      projectId: issue.projectId,
      targetId: issue.targetId,
      count: 0,
    }

    current.count += 1
    affected.set(key, current)
  }

  return {
    unresolved: issues.length,
    needsValue: summary.needsValue,
    entered: summary.entered,
    verified: summary.verified,
    deferred: summary.deferred,
    credentialReferences: summary.credentialReferences,
    unregisteredCredentialRefs: issues.filter((issue) => issue.field === 'credentialRef-registry')
      .length,
    importWarnings:
      (importPreview?.warnings.length ?? 0) +
      (importPreview?.acceptedRows.reduce((total, row) => total + row.warnings.length, 0) ?? 0),
    categoryCounts: CALIBRATION_CATEGORIES.filter(
      (category): category is { id: CalibrationCategory; label: string } => category.id !== 'all',
    ).map((category) => ({
        category: category.id,
        count: issues.filter((issue) => issue.category === category.id).length,
      })),
    topAffectedItems: Array.from(affected.values())
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 5),
    latestAuditEvents: calibration.auditEvents.slice(0, 5),
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

export function validateCalibrationDataQuality(
  field: string,
  value: string,
): CalibrationQualityMessage[] {
  const trimmed = value.trim()
  const messages: CalibrationQualityMessage[] = []

  if (!trimmed) {
    return messages
  }

  if (isSecretLikeValue(trimmed)) {
    messages.push({
      field,
      level: 'blocked',
      message: 'Secret-shaped values cannot be stored in Atlas calibration data.',
    })
  }

  if (isPlaceholderValue(trimmed)) {
    messages.push({
      field,
      level: 'warning',
      message: 'Value still looks like placeholder data.',
    })
  }

  if (field === 'publicUrl' || field === 'healthCheckUrls') {
    const values = field === 'healthCheckUrls' ? splitListValue(trimmed) : [trimmed]

    for (const url of values) {
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          messages.push({
            field,
            level: 'warning',
            message: 'URL should use http or https.',
          })
        }
      } catch {
        messages.push({
          field,
          level: 'warning',
          message: 'URL is not parseable. Include http:// or https://.',
        })
      }
    }
  }

  if (
    field === 'remoteFrontendPath' ||
    field === 'remoteBackendPath' ||
    field === 'healthCheckUrls'
  ) {
    if (/(^|\/)\.\.(\/|$)/.test(trimmed)) {
      messages.push({
        field,
        level: 'warning',
        message: 'Path contains parent traversal markers.',
      })
    }
  }

  if (field === 'remoteBackendPath' && !/\/api(\/|$)/.test(trimmed)) {
    messages.push({
      field,
      level: 'warning',
      message: 'cPanel backend path usually contains /api.',
    })
  }

  if (field === 'databaseName' && /(password|token|secret|key)=/i.test(trimmed)) {
    messages.push({
      field,
      level: 'blocked',
      message: 'Database name looks like a credential assignment.',
    })
  }

  if (field === 'repository') {
    const parsed = parseRepositoryFullName(trimmed)
    if (
      !parsed ||
      !/^[A-Za-z0-9_.-]+$/.test(parsed.owner) ||
      !/^[A-Za-z0-9_.-]+$/.test(parsed.name)
    ) {
      messages.push({
        field,
        level: 'warning',
        message: 'Repository should be owner/repo or a GitHub repository URL.',
      })
    }
  }

  return messages
}

function splitListValue(value: string) {
  return value
    .split(/\n|\|/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function normalizeImportKind(value: string): CalibrationImportRowKind | null {
  if (
    value === 'dispatch-target' ||
    value === 'repo-binding' ||
    value === 'credential-reference' ||
    value === 'project-manual' ||
    value === 'recovery-plan' ||
    value === 'runbook-artifact' ||
    value === 'runbook-preserve-path' ||
    value === 'runbook-verification-check'
  ) {
    return value
  }

  return null
}

function parseCsvTable(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let current = ''
  let inQuotes = false

  function pushCell() {
    row.push(current.trim())
    current = ''
  }

  function pushRow() {
    pushCell()
    if (row.some((cell) => cell.trim())) {
      rows.push(row)
    }
    row = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    const nextChar = text[index + 1]

    if (char === '"' && inQuotes && nextChar === '"') {
      current += '"'
      index += 1
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      pushCell()
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        index += 1
      }
      pushRow()
      continue
    }

    current += char
  }

  if (current || row.length > 0) {
    pushRow()
  }

  return rows
}

function parseCsvRows(text: string): Record<string, string>[] {
  const table = parseCsvTable(text)

  if (table.length < 2) {
    return []
  }

  const headers = table[0]

  return table.slice(1).map((values) => {
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
}

function normalizeImportRows(text: string): Record<string, string>[] {
  const trimmed = text.trim()

  if (!trimmed) {
    return []
  }

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown
    const rows = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.rows)
        ? parsed.rows
        : []

    return rows.filter(isRecord).map((row) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, String(value ?? '')])),
    )
  }

  return parseCsvRows(trimmed)
}

const DISPATCH_IMPORT_FIELDS: CalibrationEditableTargetField[] = [
  'remoteHost',
  'remoteUser',
  'remoteFrontendPath',
  'remoteBackendPath',
  'publicUrl',
  'healthCheckUrls',
  'databaseName',
  'credentialRef',
]

const PROJECT_MANUAL_IMPORT_FIELDS = [
  'summary',
  'status',
  'verificationCadence',
  'nextAction',
  'lastMeaningfulChange',
  'lastVerified',
  'currentRisk',
  'blockers',
  'deferredItems',
  'notDoingItems',
  'notes',
  'decisions',
] as const

const RECOVERY_PLAN_IMPORT_FIELDS = [
  'backupCadence',
  'backupLocationRef',
  'rollbackReference',
  'rollbackSteps',
  'maintenanceWindow',
  'escalationContactRef',
  'lastReviewedAt',
  'notes',
] as const

const RUNBOOK_ARTIFACT_IMPORT_FIELDS = [
  'filename',
  'role',
  'sourceRepo',
  'targetPath',
  'required',
  'onlyWhenFullAppReady',
  'checksum',
  'inspectedAt',
  'warnings',
  'notes',
] as const

const RUNBOOK_PRESERVE_PATH_IMPORT_FIELDS = [
  'path',
  'reason',
  'required',
  'temporary',
  'notes',
] as const

const RUNBOOK_VERIFICATION_CHECK_IMPORT_FIELDS = [
  'label',
  'method',
  'urlPath',
  'expectedStatuses',
  'protectedResource',
  'notes',
] as const

function collectRowWarnings(row: Record<string, string>) {
  return Object.entries(row)
    .filter(([field]) => field !== 'kind')
    .flatMap(([field, value]) => validateCalibrationDataQuality(field, value))
}

function rowValue(row: Record<string, string>, ...fields: string[]) {
  for (const field of fields) {
    const value = row[field]?.trim()

    if (value) {
      return value
    }
  }

  return ''
}

function hasImportValue(row: Record<string, string>, field: string) {
  return Boolean(row[field]?.trim())
}

function readBooleanImport(value: string, fallback: boolean) {
  const normalized = value.trim().toLowerCase()

  if (!normalized) {
    return fallback
  }

  if (['true', 'yes', '1', 'required'].includes(normalized)) {
    return true
  }

  if (['false', 'no', '0', 'optional'].includes(normalized)) {
    return false
  }

  return fallback
}

function parseExpectedStatuses(value: string) {
  return splitListValue(value)
    .flatMap((item) => item.split(';'))
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item >= 100 && item <= 599)
}

function findImportRunbook(dispatch: DispatchState, row: Record<string, string>) {
  const runbookId = rowValue(row, 'runbookId')
  const targetId = rowValue(row, 'targetId')

  return dispatch.runbooks.find(
    (runbook) => (runbookId && runbook.id === runbookId) || (targetId && runbook.targetId === targetId),
  )
}

function runbookEntityId(prefix: string, runbook: DeploymentRunbook, value: string) {
  return `${runbook.targetId}-${prefix}-${value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`
}

function getArtifactRole(value: string, fallback: DeploymentArtifactRole): DeploymentArtifactRole {
  return value === 'frontend' || value === 'backend' || value === 'placeholder' ? value : fallback
}

function getVerificationMethod(value: string, fallback: DeploymentVerificationCheck['method']) {
  const upper = value.trim().toUpperCase()

  return upper === 'GET' || upper === 'HEAD' ? upper : fallback
}

function valueFromRecoveryPlan(plan: DispatchRecoveryPlan | undefined, field: string) {
  if (!plan) {
    return ''
  }

  const value = plan[field as keyof DispatchRecoveryPlan]
  return Array.isArray(value) ? value.join('|') : String(value ?? '')
}

function createKindSummaries(
  acceptedRows: CalibrationImportAcceptedRow[],
  rejectedRows: CalibrationImportRejectedRow[],
): CalibrationImportKindSummary[] {
  const summaries = new Map<CalibrationImportKindSummary['kind'], CalibrationImportKindSummary>()

  function ensure(kind: CalibrationImportKindSummary['kind']) {
    const existing = summaries.get(kind)

    if (existing) {
      return existing
    }

    const summary = { kind, accepted: 0, rejected: 0, warnings: 0 }
    summaries.set(kind, summary)
    return summary
  }

  for (const row of acceptedRows) {
    const summary = ensure(row.kind)
    summary.accepted += 1
    summary.warnings += row.warnings.length
  }

  for (const row of rejectedRows) {
    const kind = normalizeImportKind(row.kind) ?? 'unknown'
    const summary = ensure(kind)
    summary.rejected += 1
  }

  return Array.from(summaries.values()).sort((left, right) =>
    left.kind.localeCompare(right.kind),
  )
}

function duplicateImportWarnings(
  rows: Record<string, string>[],
  records: ProjectRecord[],
  calibration?: AtlasCalibrationState,
) {
  const warnings: string[] = []
  const credentialRows = new Map<string, number[]>()
  const targetRows = new Map<string, number[]>()
  const repoRows = new Map<string, number[]>()
  const recoveryRows = new Map<string, number[]>()
  const artifactRows = new Map<string, number[]>()
  const preserveRows = new Map<string, number[]>()
  const verificationRows = new Map<string, number[]>()
  const existingCredentialLabels = new Set(
    calibration?.credentialReferences.map((reference) => reference.label.toLowerCase()) ?? [],
  )

  rows.forEach((row, rowIndex) => {
    const index = rowIndex + 1
    const kind = normalizeImportKind(readString(row.kind).trim())

    if (kind === 'credential-reference') {
      const label = row.label?.trim().toLowerCase()
      if (label) {
        credentialRows.set(label, [...(credentialRows.get(label) ?? []), index])
        if (existingCredentialLabels.has(label)) {
          warnings.push(`Credential reference "${row.label}" already exists and will be updated.`)
        }
      }
    }

    if (kind === 'dispatch-target' && row.targetId?.trim()) {
      targetRows.set(row.targetId, [...(targetRows.get(row.targetId) ?? []), index])
    }

    if (kind === 'repo-binding') {
      const repository = parseRepositoryFullName(row.repository || row.repo || row.fullName || '')
      if (row.projectId?.trim() && repository) {
        const key = `${row.projectId.toLowerCase()}::${repository.owner.toLowerCase()}/${repository.name.toLowerCase()}`
        repoRows.set(key, [...(repoRows.get(key) ?? []), index])
        const record = records.find((candidate) => candidate.project.id === row.projectId)
        if (
          record?.project.repositories.some(
            (repo) =>
              repo.owner.toLowerCase() === repository.owner.toLowerCase() &&
              repo.name.toLowerCase() === repository.name.toLowerCase(),
          )
        ) {
          warnings.push(
            `Repository ${repository.owner}/${repository.name} is already bound to ${record.project.name}.`,
          )
        }
      }
    }

    if (kind === 'recovery-plan' && row.targetId?.trim()) {
      recoveryRows.set(row.targetId, [...(recoveryRows.get(row.targetId) ?? []), index])
    }

    if (kind === 'runbook-artifact') {
      const key = row.artifactId || `${row.runbookId || row.targetId}:${row.filename || row.role}`
      if (key.trim()) {
        artifactRows.set(key, [...(artifactRows.get(key) ?? []), index])
      }
    }

    if (kind === 'runbook-preserve-path') {
      const key = row.preservePathId || `${row.runbookId || row.targetId}:${row.path}`
      if (key.trim()) {
        preserveRows.set(key, [...(preserveRows.get(key) ?? []), index])
      }
    }

    if (kind === 'runbook-verification-check') {
      const key = row.verificationCheckId || `${row.runbookId || row.targetId}:${row.urlPath || row.label}`
      if (key.trim()) {
        verificationRows.set(key, [...(verificationRows.get(key) ?? []), index])
      }
    }
  })

  for (const [label, indexes] of credentialRows) {
    if (indexes.length > 1) {
      warnings.push(
        `Duplicate credential reference label "${label}" appears in rows ${indexes.join(', ')}.`,
      )
    }
  }

  for (const [targetId, indexes] of targetRows) {
    if (indexes.length > 1) {
      warnings.push(`Duplicate dispatch target row "${targetId}" appears in rows ${indexes.join(', ')}.`)
    }
  }

  for (const [key, indexes] of repoRows) {
    if (indexes.length > 1) {
      const [, repository] = key.split('::')
      warnings.push(`Duplicate repo binding "${repository}" appears in rows ${indexes.join(', ')}.`)
    }
  }

  for (const [targetId, indexes] of recoveryRows) {
    if (indexes.length > 1) {
      warnings.push(`Duplicate recovery plan row "${targetId}" appears in rows ${indexes.join(', ')}.`)
    }
  }

  for (const [key, indexes] of artifactRows) {
    if (indexes.length > 1) {
      warnings.push(`Duplicate runbook artifact row "${key}" appears in rows ${indexes.join(', ')}.`)
    }
  }

  for (const [key, indexes] of preserveRows) {
    if (indexes.length > 1) {
      warnings.push(`Duplicate runbook preserve-path row "${key}" appears in rows ${indexes.join(', ')}.`)
    }
  }

  for (const [key, indexes] of verificationRows) {
    if (indexes.length > 1) {
      warnings.push(
        `Duplicate runbook verification-check row "${key}" appears in rows ${indexes.join(', ')}.`,
      )
    }
  }

  return warnings
}

function createImportChange(field: string, before: string, after: string): CalibrationImportChange {
  return {
    field,
    before,
    after,
    summary: `${field}: ${before || '(empty)'} -> ${after || '(empty)'}`,
  }
}

export function parseCalibrationImportPreview(
  text: string,
  workspace: Workspace,
  dispatch: DispatchState,
  calibration?: AtlasCalibrationState,
): CalibrationImportPreview {
  let rows: Record<string, string>[]

  try {
    rows = normalizeImportRows(text)
  } catch {
    return {
      acceptedRows: [],
      rejectedRows: [
        {
          index: 1,
          kind: 'unknown',
          identifier: 'import',
          errors: ['Import file could not be parsed as JSON or CSV.'],
          data: {},
        },
      ],
      warnings: [],
      kindSummaries: [{ kind: 'unknown', accepted: 0, rejected: 1, warnings: 0 }],
    }
  }

  const records = flattenProjects(workspace)
  const acceptedRows: CalibrationImportAcceptedRow[] = []
  const rejectedRows: CalibrationImportRejectedRow[] = []
  const importWarnings = duplicateImportWarnings(rows, records, calibration)

  rows.forEach((row, rowIndex) => {
    const index = rowIndex + 1
    const kind = normalizeImportKind(readString(row.kind).trim())
    const identifier =
      readString(row.targetId) ||
      readString(row.runbookId) ||
      readString(row.artifactId) ||
      readString(row.preservePathId) ||
      readString(row.verificationCheckId) ||
      readString(row.projectId) ||
      readString(row.label) ||
      `row-${index}`
    const errors: string[] = []
    const warnings = collectRowWarnings(row)
    const blocked = warnings.filter((warning) => warning.level === 'blocked')

    if (!kind) {
      errors.push(
        'Row kind must be dispatch-target, repo-binding, credential-reference, project-manual, recovery-plan, runbook-artifact, runbook-preserve-path, or runbook-verification-check.',
      )
    }

    if (blocked.length > 0) {
      errors.push(...blocked.map((warning) => warning.message))
    }

    const changes: string[] = []
    const changeDetails: CalibrationImportChange[] = []

    if (kind === 'dispatch-target') {
      const target = dispatch.targets.find((candidate) => candidate.id === row.targetId)
      if (!target) {
        errors.push('Dispatch target ID was not found.')
      } else {
        for (const field of DISPATCH_IMPORT_FIELDS) {
          if (row[field]?.trim()) {
            const before = valueLabel(target[field] as string | string[])
            const change = createImportChange(field, before, row[field])

            changeDetails.push(change)
            changes.push(change.summary)
          }
        }
      }
    }

    if (kind === 'repo-binding') {
      const project = records.find((record) => record.project.id === row.projectId)
      const repository = parseRepositoryFullName(row.repository || row.repo || row.fullName || '')
      if (!project) {
        errors.push('Project ID was not found.')
      }
      if (!repository) {
        errors.push('Repository must be owner/repo or a GitHub repository URL.')
      } else {
        const change = createImportChange(
          'repository',
          project?.project.repositories.map((repo) => `${repo.owner}/${repo.name}`).join(', ') ?? '',
          `${repository.owner}/${repository.name}`,
        )

        changeDetails.push(change)
        changes.push(`Bind ${repository.owner}/${repository.name} to ${row.projectId}.`)
      }
    }

    if (kind === 'credential-reference') {
      if (!row.label?.trim()) {
        errors.push('Credential reference label is required.')
      } else {
        const existingReference = calibration?.credentialReferences.find(
          (reference) => reference.label.toLowerCase() === row.label.toLowerCase(),
        )
        const change = createImportChange(
          'credential-reference',
          existingReference ? 'existing reference' : '',
          row.label,
        )

        changeDetails.push(change)
        changes.push(`Save credential reference ${row.label}.`)
      }
    }

    if (kind === 'project-manual') {
      const project = records.find((record) => record.project.id === row.projectId)
      if (!project) {
        errors.push('Project ID was not found.')
      } else {
        if (hasImportValue(row, 'status')) {
          const status = row.status as WorkStatus
          if (!WORK_STATUSES.some((definition) => definition.id === status)) {
            errors.push('Project status is not a known Atlas work status.')
          }
        }
        if (hasImportValue(row, 'verificationCadence')) {
          const cadence = row.verificationCadence as VerificationCadence
          if (!VERIFICATION_CADENCES.some((definition) => definition.id === cadence)) {
            errors.push('Verification cadence is not a known Atlas cadence.')
          }
        }

        for (const field of PROJECT_MANUAL_IMPORT_FIELDS) {
          if (hasImportValue(row, field)) {
            const before =
              field === 'summary'
                ? project.project.summary
                : valueLabel(project.project.manual[field] as string | string[])
            const change = createImportChange(field, before, row[field])

            changeDetails.push(change)
            changes.push(change.summary)
          }
        }
      }
    }

    if (kind === 'recovery-plan') {
      const target = dispatch.targets.find((candidate) => candidate.id === row.targetId)
      const existing = dispatch.recoveryPlans.find((plan) => plan.targetId === row.targetId)

      if (!target) {
        errors.push('Dispatch target ID was not found.')
      } else {
        for (const field of RECOVERY_PLAN_IMPORT_FIELDS) {
          if (hasImportValue(row, field)) {
            const change = createImportChange(field, valueFromRecoveryPlan(existing, field), row[field])

            changeDetails.push(change)
            changes.push(change.summary)
          }
        }
      }
    }

    if (kind === 'runbook-artifact') {
      const runbook = findImportRunbook(dispatch, row)
      if (!runbook) {
        errors.push('Runbook was not found for runbookId or targetId.')
      } else {
        const artifactId = rowValue(row, 'artifactId')
        const existing = runbook.artifacts.find((artifact) => artifact.id === artifactId)
        if (!existing && !rowValue(row, 'filename')) {
          errors.push('New runbook artifact rows require filename or an existing artifactId.')
        }

        for (const field of RUNBOOK_ARTIFACT_IMPORT_FIELDS) {
          if (hasImportValue(row, field)) {
            const before = existing
              ? valueLabel(existing[field] as string | string[])
              : ''
            const change = createImportChange(field, before, row[field])

            changeDetails.push(change)
            changes.push(change.summary)
          }
        }
      }
    }

    if (kind === 'runbook-preserve-path') {
      const runbook = findImportRunbook(dispatch, row)
      if (!runbook) {
        errors.push('Runbook was not found for runbookId or targetId.')
      } else {
        const preservePathId = rowValue(row, 'preservePathId')
        const existing =
          runbook.preservePaths.find((preservePath) => preservePath.id === preservePathId) ??
          runbook.preservePaths.find((preservePath) => preservePath.path === rowValue(row, 'path'))
        if (!existing && !rowValue(row, 'path')) {
          errors.push('New runbook preserve path rows require path or an existing preservePathId.')
        }

        for (const field of RUNBOOK_PRESERVE_PATH_IMPORT_FIELDS) {
          if (hasImportValue(row, field)) {
            const before = existing
              ? valueLabel(existing[field] as string | string[])
              : ''
            const change = createImportChange(field, before, row[field])

            changeDetails.push(change)
            changes.push(change.summary)
          }
        }
      }
    }

    if (kind === 'runbook-verification-check') {
      const runbook = findImportRunbook(dispatch, row)
      if (!runbook) {
        errors.push('Runbook was not found for runbookId or targetId.')
      } else {
        const checkId = rowValue(row, 'verificationCheckId')
        const existing =
          runbook.verificationChecks.find((check) => check.id === checkId) ??
          runbook.verificationChecks.find((check) => check.urlPath === rowValue(row, 'urlPath'))
        if (!existing && (!rowValue(row, 'label') || !rowValue(row, 'urlPath'))) {
          errors.push('New runbook verification check rows require label and urlPath.')
        }
        if (hasImportValue(row, 'method') && !['GET', 'HEAD'].includes(row.method.toUpperCase())) {
          errors.push('Verification check method must be HEAD or GET.')
        }
        if (hasImportValue(row, 'expectedStatuses') && parseExpectedStatuses(row.expectedStatuses).length === 0) {
          errors.push('Expected statuses must include at least one HTTP status code.')
        }

        for (const field of RUNBOOK_VERIFICATION_CHECK_IMPORT_FIELDS) {
          if (hasImportValue(row, field)) {
            const before = existing
              ? valueLabel(existing[field] as string | string[])
              : ''
            const change = createImportChange(field, before, row[field])

            changeDetails.push(change)
            changes.push(change.summary)
          }
        }
      }
    }

    if (errors.length > 0 || !kind) {
      rejectedRows.push({
        index,
        kind: row.kind || 'unknown',
        identifier,
        errors,
        data: row,
      })
      return
    }

    acceptedRows.push({
      index,
      kind,
      identifier,
      changes,
      changeDetails,
      warnings: warnings.filter((warning) => warning.level === 'warning'),
      data: row,
    })
  })

  const warnings = [
    ...(rows.length === 0 ? ['Import file did not contain any rows.'] : []),
    ...importWarnings,
  ]

  return {
    acceptedRows,
    rejectedRows,
    warnings,
    kindSummaries: createKindSummaries(acceptedRows, rejectedRows),
  }
}

function applyProjectManualImport(workspace: Workspace, row: Record<string, string>) {
  return updateProject(workspace, row.projectId, (project) => ({
    ...project,
    ...(hasImportValue(row, 'summary') ? { summary: row.summary } : {}),
    manual: {
      ...project.manual,
      ...(hasImportValue(row, 'status') ? { status: row.status as WorkStatus } : {}),
      ...(hasImportValue(row, 'verificationCadence')
        ? { verificationCadence: row.verificationCadence as VerificationCadence }
        : {}),
      ...(hasImportValue(row, 'nextAction') ? { nextAction: row.nextAction } : {}),
      ...(hasImportValue(row, 'lastMeaningfulChange')
        ? { lastMeaningfulChange: row.lastMeaningfulChange }
        : {}),
      ...(hasImportValue(row, 'lastVerified') ? { lastVerified: row.lastVerified } : {}),
      ...(hasImportValue(row, 'currentRisk') ? { currentRisk: row.currentRisk } : {}),
      ...(hasImportValue(row, 'blockers') ? { blockers: splitListValue(row.blockers) } : {}),
      ...(hasImportValue(row, 'deferredItems')
        ? { deferredItems: splitListValue(row.deferredItems) }
        : {}),
      ...(hasImportValue(row, 'notDoingItems')
        ? { notDoingItems: splitListValue(row.notDoingItems) }
        : {}),
      ...(hasImportValue(row, 'notes') ? { notes: splitListValue(row.notes) } : {}),
      ...(hasImportValue(row, 'decisions') ? { decisions: splitListValue(row.decisions) } : {}),
    },
  }))
}

function applyRecoveryPlanImport(
  state: DispatchState,
  row: Record<string, string>,
  now: Date,
) {
  const target = state.targets.find((candidate) => candidate.id === row.targetId)

  if (!target) {
    return state
  }

  const existing = state.recoveryPlans.find((plan) => plan.targetId === target.id)
  const result = upsertRecoveryPlan(
    state,
    {
      id: existing?.id,
      projectId: row.projectId || target.projectId,
      targetId: target.id,
      ...(hasImportValue(row, 'backupCadence') ? { backupCadence: row.backupCadence } : {}),
      ...(hasImportValue(row, 'backupLocationRef')
        ? { backupLocationRef: row.backupLocationRef }
        : {}),
      ...(hasImportValue(row, 'rollbackReference')
        ? { rollbackReference: row.rollbackReference }
        : {}),
      ...(hasImportValue(row, 'rollbackSteps')
        ? { rollbackSteps: splitListValue(row.rollbackSteps) }
        : {}),
      ...(hasImportValue(row, 'maintenanceWindow')
        ? { maintenanceWindow: row.maintenanceWindow }
        : {}),
      ...(hasImportValue(row, 'escalationContactRef')
        ? { escalationContactRef: row.escalationContactRef }
        : {}),
      ...(hasImportValue(row, 'lastReviewedAt') ? { lastReviewedAt: row.lastReviewedAt } : {}),
      ...(hasImportValue(row, 'notes') ? { notes: splitListValue(row.notes) } : {}),
    },
    now,
  )

  return result.ok ? result.state : state
}

function applyArtifactImport(runbook: DeploymentRunbook, row: Record<string, string>) {
  const artifactId =
    rowValue(row, 'artifactId') || runbookEntityId('artifact', runbook, rowValue(row, 'filename'))
  const existing = runbook.artifacts.find((artifact) => artifact.id === artifactId)
  const fallback: DeploymentArtifact = {
    id: artifactId,
    projectId: runbook.projectId,
    targetId: runbook.targetId,
    filename: rowValue(row, 'filename'),
    role: getArtifactRole(rowValue(row, 'role'), 'frontend'),
    sourceRepo: '',
    targetPath: '',
    required: true,
    onlyWhenFullAppReady: false,
    checksum: '',
    inspectedAt: '',
    warnings: [],
    notes: [],
  }
  const artifact: DeploymentArtifact = {
    ...(existing ?? fallback),
    ...(hasImportValue(row, 'filename') ? { filename: row.filename } : {}),
    ...(hasImportValue(row, 'role')
      ? { role: getArtifactRole(row.role, existing?.role ?? fallback.role) }
      : {}),
    ...(hasImportValue(row, 'sourceRepo') ? { sourceRepo: row.sourceRepo } : {}),
    ...(hasImportValue(row, 'targetPath') ? { targetPath: row.targetPath } : {}),
    ...(hasImportValue(row, 'required')
      ? { required: readBooleanImport(row.required, existing?.required ?? true) }
      : {}),
    ...(hasImportValue(row, 'onlyWhenFullAppReady')
      ? {
          onlyWhenFullAppReady: readBooleanImport(
            row.onlyWhenFullAppReady,
            existing?.onlyWhenFullAppReady ?? false,
          ),
        }
      : {}),
    ...(hasImportValue(row, 'checksum') ? { checksum: row.checksum } : {}),
    ...(hasImportValue(row, 'inspectedAt') ? { inspectedAt: row.inspectedAt } : {}),
    ...(hasImportValue(row, 'warnings') ? { warnings: splitListValue(row.warnings) } : {}),
    ...(hasImportValue(row, 'notes') ? { notes: splitListValue(row.notes) } : {}),
  }

  return {
    ...runbook,
    artifacts: existing
      ? runbook.artifacts.map((candidate) => (candidate.id === artifact.id ? artifact : candidate))
      : [...runbook.artifacts, artifact],
  }
}

function applyPreservePathImport(runbook: DeploymentRunbook, row: Record<string, string>) {
  const preservePathId =
    rowValue(row, 'preservePathId') || runbookEntityId('preserve', runbook, rowValue(row, 'path'))
  const existing =
    runbook.preservePaths.find((preservePath) => preservePath.id === preservePathId) ??
    runbook.preservePaths.find((preservePath) => preservePath.path === rowValue(row, 'path'))
  const fallback: DeploymentPreservePath = {
    id: preservePathId,
    projectId: runbook.projectId,
    targetId: runbook.targetId,
    path: rowValue(row, 'path'),
    reason: '',
    required: true,
    temporary: false,
    notes: [],
  }
  const preservePath: DeploymentPreservePath = {
    ...(existing ?? fallback),
    ...(hasImportValue(row, 'path') ? { path: row.path } : {}),
    ...(hasImportValue(row, 'reason') ? { reason: row.reason } : {}),
    ...(hasImportValue(row, 'required')
      ? { required: readBooleanImport(row.required, existing?.required ?? true) }
      : {}),
    ...(hasImportValue(row, 'temporary')
      ? { temporary: readBooleanImport(row.temporary, existing?.temporary ?? false) }
      : {}),
    ...(hasImportValue(row, 'notes') ? { notes: splitListValue(row.notes) } : {}),
  }

  return {
    ...runbook,
    preservePaths: existing
      ? runbook.preservePaths.map((candidate) =>
          candidate.id === existing.id ? preservePath : candidate,
        )
      : [...runbook.preservePaths, preservePath],
  }
}

function applyVerificationCheckImport(runbook: DeploymentRunbook, row: Record<string, string>) {
  const checkId =
    rowValue(row, 'verificationCheckId') ||
    runbookEntityId('verify', runbook, rowValue(row, 'urlPath') || rowValue(row, 'label'))
  const existing =
    runbook.verificationChecks.find((check) => check.id === checkId) ??
    runbook.verificationChecks.find((check) => check.urlPath === rowValue(row, 'urlPath'))
  const fallback: DeploymentVerificationCheck = {
    id: checkId,
    projectId: runbook.projectId,
    targetId: runbook.targetId,
    label: rowValue(row, 'label'),
    method: getVerificationMethod(rowValue(row, 'method'), 'HEAD'),
    urlPath: rowValue(row, 'urlPath'),
    expectedStatuses: parseExpectedStatuses(rowValue(row, 'expectedStatuses')),
    protectedResource: false,
    notes: [],
  }
  const check: DeploymentVerificationCheck = {
    ...(existing ?? fallback),
    ...(hasImportValue(row, 'label') ? { label: row.label } : {}),
    ...(hasImportValue(row, 'method')
      ? { method: getVerificationMethod(row.method, existing?.method ?? fallback.method) }
      : {}),
    ...(hasImportValue(row, 'urlPath') ? { urlPath: row.urlPath } : {}),
    ...(hasImportValue(row, 'expectedStatuses')
      ? { expectedStatuses: parseExpectedStatuses(row.expectedStatuses) }
      : {}),
    ...(hasImportValue(row, 'protectedResource')
      ? {
          protectedResource: readBooleanImport(
            row.protectedResource,
            existing?.protectedResource ?? false,
          ),
        }
      : {}),
    ...(hasImportValue(row, 'notes') ? { notes: splitListValue(row.notes) } : {}),
  }

  return {
    ...runbook,
    verificationChecks: existing
      ? runbook.verificationChecks.map((candidate) =>
          candidate.id === existing.id ? check : candidate,
        )
      : [...runbook.verificationChecks, check],
  }
}

function updateImportRunbook(
  state: DispatchState,
  row: Record<string, string>,
  update: (runbook: DeploymentRunbook) => DeploymentRunbook,
) {
  const runbook = findImportRunbook(state, row)

  if (!runbook) {
    return state
  }

  return {
    ...state,
    runbooks: state.runbooks.map((candidate) =>
      candidate.id === runbook.id ? update(candidate) : candidate,
    ),
  }
}

export function applyCalibrationImportPreview({
  workspace,
  dispatch,
  calibration,
  preview,
  operatorLabel = '',
  now = new Date(),
}: {
  workspace: Workspace
  dispatch: DispatchState
  calibration: AtlasCalibrationState
  preview: CalibrationImportPreview
  operatorLabel?: string
  now?: Date
}) {
  let nextWorkspace = workspace
  let nextDispatch = dispatch
  let nextCalibration = calibration

  for (const row of preview.acceptedRows) {
    if (row.kind === 'dispatch-target') {
      const update = DISPATCH_IMPORT_FIELDS.reduce<Partial<DeploymentTarget>>((current, field) => {
        const value = row.data[field]
        if (!value?.trim()) {
          return current
        }

        return {
          ...current,
          ...calibrationValueToTargetUpdate(field, value),
        }
      }, {})

      nextDispatch = {
        ...nextDispatch,
        targets: nextDispatch.targets.map((target) =>
          target.id === row.data.targetId ? { ...target, ...update } : target,
        ),
      }
    }

    if (row.kind === 'repo-binding') {
      const repository = parseRepositoryFullName(
        row.data.repository || row.data.repo || row.data.fullName || '',
      )

      if (repository && row.data.projectId) {
        nextWorkspace = bindRepositoryToProject(nextWorkspace, row.data.projectId, repository)
      }
    }

    if (row.kind === 'credential-reference') {
      const result = upsertCredentialReference(nextCalibration, {
        label: row.data.label,
        provider: row.data.provider,
        purpose: row.data.purpose,
        notes: row.data.notes,
        targetIds: splitListValue(row.data.targetIds || ''),
        projectIds: splitListValue(row.data.projectIds || ''),
        operatorLabel,
        now,
      })

      if (result.ok) {
        nextCalibration = result.state
      }
    }

    if (row.kind === 'project-manual') {
      nextWorkspace = applyProjectManualImport(nextWorkspace, row.data)
    }

    if (row.kind === 'recovery-plan') {
      nextDispatch = applyRecoveryPlanImport(nextDispatch, row.data, now)
    }

    if (row.kind === 'runbook-artifact') {
      nextDispatch = updateImportRunbook(nextDispatch, row.data, (runbook) =>
        applyArtifactImport(runbook, row.data),
      )
    }

    if (row.kind === 'runbook-preserve-path') {
      nextDispatch = updateImportRunbook(nextDispatch, row.data, (runbook) =>
        applyPreservePathImport(runbook, row.data),
      )
    }

    if (row.kind === 'runbook-verification-check') {
      nextDispatch = updateImportRunbook(nextDispatch, row.data, (runbook) =>
        applyVerificationCheckImport(runbook, row.data),
      )
    }

    nextCalibration = recordCalibrationAuditEvent(nextCalibration, {
      type: 'import-apply',
      summary: `Applied calibration import row ${row.index}: ${row.changes.join('; ')}`,
      operatorLabel,
      now,
    })
  }

  return {
    workspace: nextWorkspace,
    dispatch: nextDispatch,
    calibration: nextCalibration,
  }
}

const TEMPLATE_HEADERS = [
  'kind',
  'targetId',
  'projectId',
  'runbookId',
  'artifactId',
  'preservePathId',
  'verificationCheckId',
  'remoteHost',
  'remoteUser',
  'remoteFrontendPath',
  'remoteBackendPath',
  'publicUrl',
  'healthCheckUrls',
  'databaseName',
  'credentialRef',
  'repository',
  'label',
  'provider',
  'purpose',
  'notes',
  'targetIds',
  'projectIds',
  'summary',
  'status',
  'verificationCadence',
  'nextAction',
  'lastMeaningfulChange',
  'lastVerified',
  'currentRisk',
  'blockers',
  'deferredItems',
  'notDoingItems',
  'decisions',
  'backupCadence',
  'backupLocationRef',
  'rollbackReference',
  'rollbackSteps',
  'maintenanceWindow',
  'escalationContactRef',
  'lastReviewedAt',
  'filename',
  'role',
  'sourceRepo',
  'targetPath',
  'required',
  'onlyWhenFullAppReady',
  'checksum',
  'inspectedAt',
  'warnings',
  'path',
  'reason',
  'temporary',
  'method',
  'urlPath',
  'expectedStatuses',
  'protectedResource',
]

function csvEscape(value: string) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

function templateRow(values: Record<string, string>) {
  return TEMPLATE_HEADERS.map((header) => values[header] ?? '')
}

export function createCalibrationCsvTemplate(dispatch: DispatchState) {
  const rows = [
    ...dispatch.targets.map((target) =>
      templateRow({
        kind: 'dispatch-target',
        targetId: target.id,
        projectId: target.projectId,
        remoteHost: target.remoteHost,
        remoteUser: target.remoteUser,
        remoteFrontendPath: target.remoteFrontendPath,
        remoteBackendPath: target.remoteBackendPath,
        publicUrl: target.publicUrl,
        healthCheckUrls: target.healthCheckUrls.join('|'),
        databaseName: target.databaseName,
        credentialRef: target.credentialRef,
      }),
    ),
    ...dispatch.recoveryPlans.map((plan) =>
      templateRow({
        kind: 'recovery-plan',
        targetId: plan.targetId,
        projectId: plan.projectId,
        backupCadence: plan.backupCadence,
        backupLocationRef: plan.backupLocationRef,
        rollbackReference: plan.rollbackReference,
        rollbackSteps: plan.rollbackSteps.join('|'),
        maintenanceWindow: plan.maintenanceWindow,
        escalationContactRef: plan.escalationContactRef,
        lastReviewedAt: plan.lastReviewedAt,
        notes: plan.notes.join('|'),
      }),
    ),
    ...dispatch.runbooks.flatMap((runbook) => [
      ...runbook.artifacts.map((artifact) =>
        templateRow({
          kind: 'runbook-artifact',
          targetId: runbook.targetId,
          projectId: runbook.projectId,
          runbookId: runbook.id,
          artifactId: artifact.id,
          filename: artifact.filename,
          role: artifact.role,
          sourceRepo: artifact.sourceRepo,
          targetPath: artifact.targetPath,
          required: String(artifact.required),
          onlyWhenFullAppReady: String(artifact.onlyWhenFullAppReady),
          checksum: artifact.checksum,
          inspectedAt: artifact.inspectedAt,
          warnings: artifact.warnings.join('|'),
          notes: artifact.notes.join('|'),
        }),
      ),
      ...runbook.preservePaths.map((preservePath) =>
        templateRow({
          kind: 'runbook-preserve-path',
          targetId: runbook.targetId,
          projectId: runbook.projectId,
          runbookId: runbook.id,
          preservePathId: preservePath.id,
          path: preservePath.path,
          reason: preservePath.reason,
          required: String(preservePath.required),
          temporary: String(preservePath.temporary),
          notes: preservePath.notes.join('|'),
        }),
      ),
      ...runbook.verificationChecks.map((check) =>
        templateRow({
          kind: 'runbook-verification-check',
          targetId: runbook.targetId,
          projectId: runbook.projectId,
          runbookId: runbook.id,
          verificationCheckId: check.id,
          label: check.label,
          method: check.method,
          urlPath: check.urlPath,
          expectedStatuses: check.expectedStatuses.join('|'),
          protectedResource: String(check.protectedResource),
          notes: check.notes.join('|'),
        }),
      ),
    ]),
  ]

  return [TEMPLATE_HEADERS, ...rows].map((row) => row.map(csvEscape).join(',')).join('\n')
}

export function createCalibrationJsonTemplate(
  workspace: Workspace,
  dispatch: DispatchState,
  calibration: AtlasCalibrationState,
) {
  return JSON.stringify(
    {
      rows: [
        ...dispatch.targets.map((target) => ({
          kind: 'dispatch-target',
          targetId: target.id,
          projectId: target.projectId,
          remoteHost: target.remoteHost,
          remoteUser: target.remoteUser,
          remoteFrontendPath: target.remoteFrontendPath,
          remoteBackendPath: target.remoteBackendPath,
          publicUrl: target.publicUrl,
          healthCheckUrls: target.healthCheckUrls.join('|'),
          databaseName: target.databaseName,
          credentialRef: target.credentialRef,
        })),
        ...flattenProjects(workspace).map((record) => ({
          kind: 'project-manual',
          projectId: record.project.id,
          summary: record.project.summary,
          status: record.project.manual.status,
          verificationCadence: record.project.manual.verificationCadence,
          nextAction: record.project.manual.nextAction,
          lastMeaningfulChange: record.project.manual.lastMeaningfulChange,
          lastVerified: record.project.manual.lastVerified,
          currentRisk: record.project.manual.currentRisk,
          blockers: record.project.manual.blockers.join('|'),
          deferredItems: record.project.manual.deferredItems.join('|'),
          notDoingItems: record.project.manual.notDoingItems.join('|'),
          notes: record.project.manual.notes.join('|'),
          decisions: record.project.manual.decisions.join('|'),
        })),
        ...flattenProjects(workspace).map((record) => ({
          kind: 'repo-binding',
          projectId: record.project.id,
          repository: record.project.repositories[0]
            ? `${record.project.repositories[0].owner}/${record.project.repositories[0].name}`
            : '',
        })),
        ...calibration.credentialReferences.map((reference) => ({
          kind: 'credential-reference',
          label: reference.label,
          provider: reference.provider,
          purpose: reference.purpose,
          notes: reference.notes,
          targetIds: reference.targetIds.join('|'),
          projectIds: reference.projectIds.join('|'),
        })),
        ...dispatch.recoveryPlans.map((plan) => ({
          kind: 'recovery-plan',
          targetId: plan.targetId,
          projectId: plan.projectId,
          backupCadence: plan.backupCadence,
          backupLocationRef: plan.backupLocationRef,
          rollbackReference: plan.rollbackReference,
          rollbackSteps: plan.rollbackSteps.join('|'),
          maintenanceWindow: plan.maintenanceWindow,
          escalationContactRef: plan.escalationContactRef,
          lastReviewedAt: plan.lastReviewedAt,
          notes: plan.notes.join('|'),
        })),
        ...dispatch.runbooks.flatMap((runbook) => [
          ...runbook.artifacts.map((artifact) => ({
            kind: 'runbook-artifact',
            targetId: runbook.targetId,
            projectId: runbook.projectId,
            runbookId: runbook.id,
            artifactId: artifact.id,
            filename: artifact.filename,
            role: artifact.role,
            sourceRepo: artifact.sourceRepo,
            targetPath: artifact.targetPath,
            required: String(artifact.required),
            onlyWhenFullAppReady: String(artifact.onlyWhenFullAppReady),
            checksum: artifact.checksum,
            inspectedAt: artifact.inspectedAt,
            warnings: artifact.warnings.join('|'),
            notes: artifact.notes.join('|'),
          })),
          ...runbook.preservePaths.map((preservePath) => ({
            kind: 'runbook-preserve-path',
            targetId: runbook.targetId,
            projectId: runbook.projectId,
            runbookId: runbook.id,
            preservePathId: preservePath.id,
            path: preservePath.path,
            reason: preservePath.reason,
            required: String(preservePath.required),
            temporary: String(preservePath.temporary),
            notes: preservePath.notes.join('|'),
          })),
          ...runbook.verificationChecks.map((check) => ({
            kind: 'runbook-verification-check',
            targetId: runbook.targetId,
            projectId: runbook.projectId,
            runbookId: runbook.id,
            verificationCheckId: check.id,
            label: check.label,
            method: check.method,
            urlPath: check.urlPath,
            expectedStatuses: check.expectedStatuses.join('|'),
            protectedResource: String(check.protectedResource),
            notes: check.notes.join('|'),
          })),
        ]),
      ],
    },
    null,
    2,
  )
}
