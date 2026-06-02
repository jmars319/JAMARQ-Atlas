import type { ProjectRecord } from '../../domain/atlas'
import type { AtlasCalibrationState } from '../../domain/calibration'
import type { DeploymentArtifactRole, DeploymentRunbook, DeploymentVerificationCheck, DispatchRecoveryPlan, DispatchState } from '../../domain/dispatch'
import { parseRepositoryFullName } from '../repoBinding'
import { isRecord, readString, splitListValue } from './shared'
import { validateCalibrationDataQuality } from './validation'
import type { CalibrationEditableTargetField, CalibrationImportAcceptedRow, CalibrationImportChange, CalibrationImportKindSummary, CalibrationImportRejectedRow, CalibrationImportRowKind } from './types'

export function normalizeImportKind(value: string): CalibrationImportRowKind | null {
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

export function parseCsvTable(text: string) {
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

export function parseCsvRows(text: string): Record<string, string>[] {
  const table = parseCsvTable(text)

  if (table.length < 2) {
    return []
  }

  const headers = table[0]

  return table.slice(1).map((values) => {
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']))
  })
}

export function normalizeImportRows(text: string): Record<string, string>[] {
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

export const DISPATCH_IMPORT_FIELDS: CalibrationEditableTargetField[] = [
  'remoteHost',
  'remoteUser',
  'remoteFrontendPath',
  'remoteBackendPath',
  'publicUrl',
  'healthCheckUrls',
  'databaseName',
  'credentialRef',
]

export const PROJECT_MANUAL_IMPORT_FIELDS = [
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

export const RECOVERY_PLAN_IMPORT_FIELDS = [
  'backupCadence',
  'backupLocationRef',
  'rollbackReference',
  'rollbackSteps',
  'maintenanceWindow',
  'escalationContactRef',
  'lastReviewedAt',
  'notes',
] as const

export const RUNBOOK_ARTIFACT_IMPORT_FIELDS = [
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

export const RUNBOOK_PRESERVE_PATH_IMPORT_FIELDS = [
  'path',
  'reason',
  'required',
  'temporary',
  'notes',
] as const

export const RUNBOOK_VERIFICATION_CHECK_IMPORT_FIELDS = [
  'label',
  'method',
  'urlPath',
  'expectedStatuses',
  'protectedResource',
  'notes',
] as const

export function collectRowWarnings(row: Record<string, string>) {
  return Object.entries(row)
    .filter(([field]) => field !== 'kind')
    .flatMap(([field, value]) => validateCalibrationDataQuality(field, value))
}

export function rowValue(row: Record<string, string>, ...fields: string[]) {
  for (const field of fields) {
    const value = row[field]?.trim()

    if (value) {
      return value
    }
  }

  return ''
}

export function hasImportValue(row: Record<string, string>, field: string) {
  return Boolean(row[field]?.trim())
}

export function readBooleanImport(value: string, fallback: boolean) {
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

export function parseExpectedStatuses(value: string) {
  return splitListValue(value)
    .flatMap((item) => item.split(';'))
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isInteger(item) && item >= 100 && item <= 599)
}

export function findImportRunbook(dispatch: DispatchState, row: Record<string, string>) {
  const runbookId = rowValue(row, 'runbookId')
  const targetId = rowValue(row, 'targetId')

  return dispatch.runbooks.find(
    (runbook) => (runbookId && runbook.id === runbookId) || (targetId && runbook.targetId === targetId),
  )
}

export function runbookEntityId(prefix: string, runbook: DeploymentRunbook, value: string) {
  return `${runbook.targetId}-${prefix}-${value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`
}

export function getArtifactRole(value: string, fallback: DeploymentArtifactRole): DeploymentArtifactRole {
  return value === 'frontend' || value === 'backend' || value === 'placeholder' ? value : fallback
}

export function getVerificationMethod(value: string, fallback: DeploymentVerificationCheck['method']) {
  const upper = value.trim().toUpperCase()

  return upper === 'GET' || upper === 'HEAD' ? upper : fallback
}

export function valueFromRecoveryPlan(plan: DispatchRecoveryPlan | undefined, field: string) {
  if (!plan) {
    return ''
  }

  const value = plan[field as keyof DispatchRecoveryPlan]
  return Array.isArray(value) ? value.join('|') : String(value ?? '')
}

export function createKindSummaries(
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

export function duplicateImportWarnings(
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

export function createImportChange(field: string, before: string, after: string): CalibrationImportChange {
  return {
    field,
    before,
    after,
    summary: `${field}: ${before || '(empty)'} -> ${after || '(empty)'}`,
  }
}
