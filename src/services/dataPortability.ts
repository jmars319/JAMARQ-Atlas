import {
  ATLAS_BACKUP_KIND,
  ATLAS_BACKUP_SCHEMA_VERSION,
  type AtlasBackupEnvelope,
  type AtlasBackupStoreSummary,
  type AtlasBackupStores,
  type AtlasBackupValidationResult,
  type AtlasRestorePreview,
  type AtlasRestoreWarning,
} from '../domain/dataPortability'
import type { Workspace } from '../domain/atlas'
import type { DispatchState } from '../domain/dispatch'
import type { WritingWorkbenchState } from '../domain/writing'
import { normalizeWorkspaceVerificationCadence } from './verification'
import { normalizeDispatchState } from './dispatchStorage'
import { normalizeWritingState } from './aiWritingAssistant'

export const RESTORE_CONFIRMATION_PHRASE = 'RESTORE ATLAS'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function collectWorkspaceSummary(workspace: Workspace) {
  const groups = workspace.sections.flatMap((section) => section.groups)
  const projects = groups.flatMap((group) => group.projects)

  return {
    sections: workspace.sections.length,
    groups: groups.length,
    projects: projects.length,
    repositoryBindings: projects.reduce(
      (total, project) => total + project.repositories.length,
      0,
    ),
    activityEvents: projects.reduce((total, project) => total + project.activity.length, 0),
  }
}

function collectDispatchSummary(dispatch: DispatchState) {
  return {
    targets: dispatch.targets.length,
    records: dispatch.records.length,
    readinessEntries: dispatch.readiness.length,
    preflightRuns: dispatch.preflightRuns.length,
  }
}

function collectWritingSummary(writing: WritingWorkbenchState) {
  return {
    drafts: writing.drafts.length,
    reviewEvents: writing.drafts.reduce((total, draft) => total + draft.reviewEvents.length, 0),
    approvedDrafts: writing.drafts.filter((draft) => draft.status === 'approved').length,
    exportedDrafts: writing.drafts.filter((draft) => draft.status === 'exported').length,
    archivedDrafts: writing.drafts.filter((draft) => draft.status === 'archived').length,
  }
}

export function summarizeAtlasStores(stores: AtlasBackupStores): AtlasBackupStoreSummary {
  return {
    workspace: collectWorkspaceSummary(stores.workspace),
    dispatch: collectDispatchSummary(stores.dispatch),
    writing: collectWritingSummary(stores.writing),
  }
}

export function normalizeBackupStores(value: unknown): {
  stores: AtlasBackupStores | null
  warnings: AtlasRestoreWarning[]
  errors: string[]
} {
  const errors: string[] = []
  const warnings: AtlasRestoreWarning[] = []

  if (!isRecord(value)) {
    return {
      stores: null,
      warnings,
      errors: ['Backup stores must be an object.'],
    }
  }

  if (!value.workspace) {
    errors.push('Backup is missing the workspace store.')
  }

  if (!value.dispatch) {
    warnings.push({
      type: 'missing-dispatch',
      message: 'Backup is missing Dispatch state; an empty Dispatch store will be restored.',
    })
  }

  if (!value.writing) {
    warnings.push({
      type: 'missing-writing',
      message: 'Backup is missing Writing state; an empty Writing store will be restored.',
    })
  }

  if (errors.length > 0) {
    return { stores: null, warnings, errors }
  }

  let workspace: Workspace
  let dispatch: DispatchState
  let writing: WritingWorkbenchState

  try {
    workspace = normalizeWorkspaceVerificationCadence(value.workspace as Workspace)
    dispatch = normalizeDispatchState(value.dispatch ?? {})
    writing = normalizeWritingState(value.writing ?? {})
  } catch {
    return {
      stores: null,
      warnings,
      errors: ['Backup stores could not be normalized into Atlas data.'],
    }
  }

  if (!isRecord(value.dispatch) || !Array.isArray(value.dispatch.preflightRuns)) {
    warnings.push({
      type: 'legacy-normalized',
      message: 'Dispatch state was normalized for the current backup schema.',
    })
  }

  if (!isRecord(value.writing) || !Array.isArray(value.writing.drafts)) {
    warnings.push({
      type: 'legacy-normalized',
      message: 'Writing state was normalized for the current backup schema.',
    })
  }

  const stores = { workspace, dispatch, writing }
  const summary = summarizeAtlasStores(stores)

  if (summary.workspace.projects === 0) {
    warnings.push({
      type: 'empty-store',
      message: 'Incoming workspace contains no projects.',
    })
  }

  return { stores, warnings, errors }
}

export function createAtlasBackupEnvelope(
  stores: AtlasBackupStores,
  now = new Date(),
): AtlasBackupEnvelope {
  return {
    kind: ATLAS_BACKUP_KIND,
    schemaVersion: ATLAS_BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    appName: 'JAMARQ Atlas',
    stores,
    summary: summarizeAtlasStores(stores),
  }
}

export function parseAtlasBackupJson(text: string): AtlasBackupValidationResult {
  try {
    return validateAtlasBackupEnvelope(JSON.parse(text))
  } catch {
    return {
      ok: false,
      errors: ['Backup file is not valid JSON.'],
      warnings: [],
      envelope: null,
    }
  }
}

export function validateAtlasBackupEnvelope(value: unknown): AtlasBackupValidationResult {
  const errors: string[] = []
  const warnings: AtlasRestoreWarning[] = []

  if (!isRecord(value)) {
    return {
      ok: false,
      errors: ['Backup envelope must be an object.'],
      warnings,
      envelope: null,
    }
  }

  if (value.kind !== ATLAS_BACKUP_KIND) {
    errors.push('Backup kind is not jamarq-atlas-backup.')
  }

  if (value.schemaVersion !== ATLAS_BACKUP_SCHEMA_VERSION) {
    errors.push(`Unsupported backup schema version: ${String(value.schemaVersion)}.`)
  }

  if (!isRecord(value.stores)) {
    errors.push('Backup is missing stores.')
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings, envelope: null }
  }

  const normalized = normalizeBackupStores(value.stores)
  warnings.push(...normalized.warnings)
  errors.push(...normalized.errors)

  if (!normalized.stores) {
    return { ok: false, errors, warnings, envelope: null }
  }

  const exportedAt =
    typeof value.exportedAt === 'string' && !Number.isNaN(Date.parse(value.exportedAt))
      ? new Date(value.exportedAt)
      : new Date()
  const envelope = createAtlasBackupEnvelope(normalized.stores, exportedAt)

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    envelope,
  }
}

export function createRestorePreview(
  currentStores: AtlasBackupStores,
  incomingEnvelope: AtlasBackupEnvelope,
): AtlasRestorePreview {
  const normalized = normalizeBackupStores(incomingEnvelope.stores)

  if (!normalized.stores) {
    throw new Error(normalized.errors.join(' '))
  }

  return {
    currentSummary: summarizeAtlasStores(currentStores),
    incomingSummary: summarizeAtlasStores(normalized.stores),
    warnings: normalized.warnings,
    normalizedStores: normalized.stores,
  }
}

export function createAtlasBackupMarkdownReport(envelope: AtlasBackupEnvelope) {
  const { workspace, dispatch, writing } = envelope.summary

  return `# JAMARQ Atlas Backup Report

Generated: ${envelope.exportedAt}
Schema: ${envelope.schemaVersion}

## Included Stores

- Workspace: ${workspace.sections} sections, ${workspace.groups} groups, ${workspace.projects} projects
- Repository bindings: ${workspace.repositoryBindings}
- Activity events: ${workspace.activityEvents}
- Dispatch: ${dispatch.targets} targets, ${dispatch.records} records, ${dispatch.readinessEntries} readiness entries, ${dispatch.preflightRuns} preflight runs
- Writing: ${writing.drafts} drafts, ${writing.reviewEvents} review events, ${writing.approvedDrafts} approved, ${writing.exportedDrafts} exported, ${writing.archivedDrafts} archived

## Restore Rules

- Restore is previewed before it replaces local Atlas data.
- Restore replaces Workspace, Dispatch, and Writing stores together.
- Restore does not merge records.
- Restore requires typed human confirmation.
- Reset seed remains separate from restore.

## Excluded Data

- GitHub tokens and environment variables
- Browser secrets and unknown localStorage keys
- Build output and dependency caches
- Live GitHub history beyond saved repository bindings and captured Writing context

## Guardrails

- Backups do not change Atlas status by themselves.
- GitHub, Dispatch, Verification, and Writing remain advisory after restore.
- This report is not proof that anything was sent, shipped, deployed, verified, or published.
`
}

export function createBackupSummaryText(envelope: AtlasBackupEnvelope) {
  const { workspace, dispatch, writing } = envelope.summary

  return `JAMARQ Atlas backup ${envelope.exportedAt}: ${workspace.projects} projects, ${dispatch.targets} dispatch targets, ${dispatch.preflightRuns} preflight runs, ${writing.drafts} writing drafts.`
}

export function canApplyAtlasRestore(confirmation: string) {
  return confirmation === RESTORE_CONFIRMATION_PHRASE
}
