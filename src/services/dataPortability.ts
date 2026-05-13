import {
  ATLAS_BACKUP_KIND,
  ATLAS_BACKUP_SCHEMA_VERSION,
  type AtlasBackupEnvelope,
  type AtlasBackupDiffItem,
  type AtlasBackupStoreSummary,
  type AtlasBackupStores,
  type AtlasBackupValidationResult,
  type AtlasRestorePreview,
  type AtlasRestoreWarning,
  type AtlasStoreDiagnostic,
} from '../domain/dataPortability'
import type { Workspace } from '../domain/atlas'
import type { DispatchState } from '../domain/dispatch'
import {
  ATLAS_PLANNING_SCHEMA_VERSION,
  type AtlasPlanningState,
} from '../domain/planning'
import {
  ATLAS_CALIBRATION_SCHEMA_VERSION,
  type AtlasCalibrationState,
} from '../domain/calibration'
import { ATLAS_REPORTS_SCHEMA_VERSION, type ReportsState } from '../domain/reports'
import { ATLAS_REVIEW_SCHEMA_VERSION, type ReviewState } from '../domain/review'
import { ATLAS_SETTINGS_SCHEMA_VERSION, type AtlasSettingsState } from '../domain/settings'
import { ATLAS_SYNC_SCHEMA_VERSION, type AtlasSyncState } from '../domain/sync'
import type { WritingWorkbenchState } from '../domain/writing'
import { normalizeWorkspaceVerificationCadence } from './verification'
import { normalizeDispatchState } from './dispatchStorage'
import { normalizeWritingState } from './aiWritingAssistant'
import { normalizePlanningState, summarizePlanningState } from './planning'
import { normalizeReportsState } from './reports'
import { normalizeReviewState, summarizeReviewState } from './review'
import { normalizeSettingsState } from './settings'
import { normalizeSyncState } from './syncSnapshots'
import { normalizeCalibrationState, summarizeCalibrationState } from './calibration'

export const RESTORE_CONFIRMATION_PHRASE = 'RESTORE ATLAS'
const BACKUP_NORMALIZATION_FALLBACK_DATE = new Date('1970-01-01T00:00:00.000Z')

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
    hostEvidenceRuns: dispatch.hostEvidenceRuns.length,
    verificationEvidenceRuns: dispatch.verificationEvidenceRuns.length,
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

function collectPlanningSummary(planning: AtlasPlanningState) {
  return summarizePlanningState(planning)
}

function collectReportsSummary(reports: ReportsState) {
  return {
    packets: reports.packets.length,
    auditEvents: reports.packets.reduce(
      (total, packet) => total + packet.auditEvents.length,
      0,
    ),
    exportedPackets: reports.packets.filter((packet) => packet.status === 'exported').length,
    archivedPackets: reports.packets.filter((packet) => packet.status === 'archived').length,
  }
}

function collectReviewSummary(review: ReviewState) {
  return summarizeReviewState(review)
}

function collectCalibrationSummary(calibration: AtlasCalibrationState) {
  return summarizeCalibrationState(calibration)
}

function collectSettingsSummary(settings: AtlasSettingsState) {
  return {
    configured: settings.deviceLabel ? 1 : 0,
    hasOperatorLabel: settings.operatorLabel ? 1 : 0,
  }
}

function collectSyncSummary(sync: AtlasSyncState) {
  return {
    snapshots: sync.snapshots.length,
    providerConfigured: sync.provider.status === 'configured' ? 1 : 0,
  }
}

export function summarizeAtlasStores(stores: AtlasBackupStores): AtlasBackupStoreSummary {
  return {
    workspace: collectWorkspaceSummary(stores.workspace),
    dispatch: collectDispatchSummary(stores.dispatch),
    writing: collectWritingSummary(stores.writing),
    planning: collectPlanningSummary(stores.planning),
    reports: collectReportsSummary(stores.reports),
    review: collectReviewSummary(stores.review),
    calibration: collectCalibrationSummary(stores.calibration),
    settings: collectSettingsSummary(stores.settings),
    sync: collectSyncSummary(stores.sync),
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

  if (!value.planning) {
    warnings.push({
      type: 'missing-planning',
      message: 'Backup is missing Planning state; an empty Planning store will be restored.',
    })
  }

  if (!value.reports) {
    warnings.push({
      type: 'missing-reports',
      message: 'Backup is missing Reports state; an empty Reports store will be restored.',
    })
  }

  if (!value.review) {
    warnings.push({
      type: 'missing-review',
      message: 'Backup is missing Review state; an empty Review store will be restored.',
    })
  }

  if (!value.calibration) {
    warnings.push({
      type: 'missing-calibration',
      message:
        'Backup is missing Calibration state; an empty Calibration Operations store will be restored.',
    })
  }

  if (!value.settings) {
    warnings.push({
      type: 'missing-settings',
      message: 'Backup is missing Settings state; a default local Settings store will be restored.',
    })
  }

  if (!value.sync) {
    warnings.push({
      type: 'missing-sync',
      message: 'Backup is missing Sync state; an empty local Sync store will be restored.',
    })
  }

  if (errors.length > 0) {
    return { stores: null, warnings, errors }
  }

  let workspace: Workspace
  let dispatch: DispatchState
  let writing: WritingWorkbenchState
  let planning: AtlasPlanningState
  let reports: ReportsState
  let review: ReviewState
  let calibration: AtlasCalibrationState
  let settings: AtlasSettingsState
  let sync: AtlasSyncState

  try {
    workspace = normalizeWorkspaceVerificationCadence(value.workspace as Workspace)
    dispatch = normalizeDispatchState(value.dispatch ?? {}, BACKUP_NORMALIZATION_FALLBACK_DATE)
    writing = normalizeWritingState(value.writing ?? {})
    planning = normalizePlanningState(value.planning ?? {})
    reports = normalizeReportsState(value.reports ?? {})
    review = normalizeReviewState(value.review ?? {})
    calibration = normalizeCalibrationState(
      value.calibration ?? {},
      BACKUP_NORMALIZATION_FALLBACK_DATE,
    )
    settings = normalizeSettingsState(value.settings ?? {})
    sync = normalizeSyncState(value.sync ?? {})
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

  if (!isRecord(value.planning)) {
    warnings.push({
      type: 'legacy-normalized',
      message: 'Planning state was normalized for the current backup schema.',
    })
  }

  if (!isRecord(value.reports) || !Array.isArray(value.reports.packets)) {
    warnings.push({
      type: 'legacy-normalized',
      message: 'Reports state was normalized for the current backup schema.',
    })
  }

  if (!isRecord(value.review) || !Array.isArray(value.review.sessions)) {
    warnings.push({
      type: 'legacy-normalized',
      message: 'Review state was normalized for the current backup schema.',
    })
  }

  if (!isRecord(value.calibration) || !Array.isArray(value.calibration.fieldProgress)) {
    warnings.push({
      type: 'legacy-normalized',
      message: 'Calibration state was normalized for the current backup schema.',
    })
  }

  if (!isRecord(value.settings) || typeof value.settings.deviceLabel !== 'string') {
    warnings.push({
      type: 'legacy-normalized',
      message: 'Settings state was normalized for the current backup schema.',
    })
  }

  if (!isRecord(value.sync) || !Array.isArray(value.sync.snapshots)) {
    warnings.push({
      type: 'legacy-normalized',
      message: 'Sync state was normalized for the current backup schema.',
    })
  }

  const stores = {
    workspace,
    dispatch,
    writing,
    planning,
    reports,
    review,
    calibration,
    settings,
    sync,
  }
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
  const normalizedStores = normalizeBackupStores(stores).stores ?? stores

  return {
    kind: ATLAS_BACKUP_KIND,
    schemaVersion: ATLAS_BACKUP_SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    appName: 'JAMARQ Atlas',
    stores: normalizedStores,
    summary: summarizeAtlasStores(normalizedStores),
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

  if (
    value.schemaVersion !== 1 &&
    value.schemaVersion !== 2 &&
    value.schemaVersion !== 3 &&
    value.schemaVersion !== 4 &&
    value.schemaVersion !== ATLAS_BACKUP_SCHEMA_VERSION
  ) {
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
    diffs: createBackupDiffItems(
      summarizeAtlasStores(currentStores),
      summarizeAtlasStores(normalized.stores),
    ),
    warnings: normalized.warnings,
    normalizedStores: normalized.stores,
  }
}

function planningTotal(summary: AtlasBackupStoreSummary) {
  return (
    summary.planning.objectives +
    summary.planning.milestones +
    summary.planning.workSessions +
    summary.planning.notes
  )
}

function diffStatus(current: number, incoming: number) {
  if (current > 0 && incoming === 0) {
    return 'danger' as const
  }

  if (incoming < current) {
    return 'warning' as const
  }

  return 'ok' as const
}

export function createBackupDiffItems(
  currentSummary: AtlasBackupStoreSummary,
  incomingSummary: AtlasBackupStoreSummary,
): AtlasBackupDiffItem[] {
  const items = [
    {
      id: 'projects',
      label: 'Projects',
      current: currentSummary.workspace.projects,
      incoming: incomingSummary.workspace.projects,
    },
    {
      id: 'repository-bindings',
      label: 'Repository bindings',
      current: currentSummary.workspace.repositoryBindings,
      incoming: incomingSummary.workspace.repositoryBindings,
    },
    {
      id: 'dispatch-targets',
      label: 'Dispatch targets',
      current: currentSummary.dispatch.targets,
      incoming: incomingSummary.dispatch.targets,
    },
    {
      id: 'dispatch-evidence',
      label: 'Dispatch evidence',
      current:
        currentSummary.dispatch.preflightRuns +
        currentSummary.dispatch.hostEvidenceRuns +
        currentSummary.dispatch.verificationEvidenceRuns,
      incoming:
        incomingSummary.dispatch.preflightRuns +
        incomingSummary.dispatch.hostEvidenceRuns +
        incomingSummary.dispatch.verificationEvidenceRuns,
    },
    {
      id: 'writing-drafts',
      label: 'Writing drafts',
      current: currentSummary.writing.drafts,
      incoming: incomingSummary.writing.drafts,
    },
    {
      id: 'planning-records',
      label: 'Planning records',
      current: planningTotal(currentSummary),
      incoming: planningTotal(incomingSummary),
    },
    {
      id: 'report-packets',
      label: 'Report packets',
      current: currentSummary.reports.packets,
      incoming: incomingSummary.reports.packets,
    },
    {
      id: 'review-sessions',
      label: 'Review sessions',
      current: currentSummary.review.sessions,
      incoming: incomingSummary.review.sessions,
    },
    {
      id: 'calibration-progress',
      label: 'Calibration progress',
      current: currentSummary.calibration.progressRecords,
      incoming: incomingSummary.calibration.progressRecords,
    },
    {
      id: 'credential-references',
      label: 'Credential references',
      current: currentSummary.calibration.credentialReferences,
      incoming: incomingSummary.calibration.credentialReferences,
    },
    {
      id: 'sync-snapshots',
      label: 'Sync snapshots',
      current: currentSummary.sync.snapshots,
      incoming: incomingSummary.sync.snapshots,
    },
  ]

  return items.map((item) => ({
    ...item,
    delta: item.incoming - item.current,
    status: diffStatus(item.current, item.incoming),
  }))
}

function diagnosticStatus(messages: string[], danger = false) {
  if (danger) {
    return 'danger' as const
  }

  return messages.length > 0 ? ('warning' as const) : ('ok' as const)
}

export function createAtlasStoreDiagnostics(
  stores: AtlasBackupStores,
): AtlasStoreDiagnostic[] {
  const summary = summarizeAtlasStores(stores)
  const planningRecords = planningTotal(summary)
  const dispatchEvidence =
    summary.dispatch.preflightRuns +
    summary.dispatch.hostEvidenceRuns +
    summary.dispatch.verificationEvidenceRuns
  const diagnostics: AtlasStoreDiagnostic[] = []

  const workspaceMessages = [
    ...(summary.workspace.projects === 0 ? ['Workspace has no projects.'] : []),
    ...(summary.workspace.repositoryBindings === 0
      ? ['No repository bindings are currently stored.']
      : []),
  ]
  diagnostics.push({
    id: 'workspace',
    label: 'Workspace',
    schemaVersion: 'normalized workspace',
    status: diagnosticStatus(workspaceMessages, summary.workspace.projects === 0),
    countSummary: `${summary.workspace.projects} projects / ${summary.workspace.repositoryBindings} repo bindings`,
    messages: workspaceMessages,
    repairHint:
      'Use Board/GitHub Intake to add projects or bindings. Export a backup before Reset seed.',
  })

  const dispatchMessages = [
    ...(summary.dispatch.targets === 0 ? ['No Dispatch targets are configured.'] : []),
    ...(dispatchEvidence === 0 ? ['No Dispatch evidence has been captured yet.'] : []),
  ]
  diagnostics.push({
    id: 'dispatch',
    label: 'Dispatch',
    schemaVersion: 'normalized dispatch v1',
    status: diagnosticStatus(dispatchMessages, summary.dispatch.targets === 0),
    countSummary: `${summary.dispatch.targets} targets / ${dispatchEvidence} evidence runs`,
    messages: dispatchMessages,
    repairHint:
      'Use Dispatch runbooks, preflight, host evidence, and manual sessions to build evidence history.',
  })

  diagnostics.push({
    id: 'writing',
    label: 'Writing',
    schemaVersion: 'normalized writing v1',
    status: 'ok',
    countSummary: `${summary.writing.drafts} drafts / ${summary.writing.reviewEvents} audit events`,
    messages:
      summary.writing.drafts === 0
        ? ['No Writing drafts exist yet; this is safe for a fresh local store.']
        : [],
    repairHint: 'Writing drafts are optional and remain separate from Workspace status.',
  })

  diagnostics.push({
    id: 'planning',
    label: 'Planning',
    schemaVersion: `v${ATLAS_PLANNING_SCHEMA_VERSION}`,
    status: 'ok',
    countSummary: `${planningRecords} planning records`,
    messages:
      planningRecords === 0
        ? ['No Planning records exist yet; Review can create Planning notes explicitly.']
        : [],
    repairHint: 'Planning is manual-only. Missing records do not block Atlas operation.',
  })

  diagnostics.push({
    id: 'reports',
    label: 'Reports',
    schemaVersion: `v${ATLAS_REPORTS_SCHEMA_VERSION}`,
    status: 'ok',
    countSummary: `${summary.reports.packets} packets / ${summary.reports.auditEvents} audit events`,
    messages:
      summary.reports.packets === 0
        ? ['No Report packets exist yet; exports are local-only when created.']
        : [],
    repairHint: 'Reports can be regenerated from current local context when needed.',
  })

  diagnostics.push({
    id: 'review',
    label: 'Review',
    schemaVersion: `v${ATLAS_REVIEW_SCHEMA_VERSION}`,
    status: 'ok',
    countSummary: `${summary.review.sessions} sessions / ${summary.review.notes} notes`,
    messages:
      summary.review.sessions === 0
        ? ['No Review sessions have been stored yet; the queue remains derived.']
        : [],
    repairHint: 'Review sessions and notes are manual context only.',
  })

  diagnostics.push({
    id: 'calibration',
    label: 'Calibration',
    schemaVersion: `v${ATLAS_CALIBRATION_SCHEMA_VERSION}`,
    status: 'ok',
    countSummary: `${summary.calibration.progressRecords} progress records / ${summary.calibration.credentialReferences} credential references`,
    messages:
      summary.calibration.progressRecords === 0
        ? ['No Calibration Operations progress has been recorded yet.']
        : [],
    repairHint:
      'Calibration progress is local human metadata. Export a backup before large imports.',
  })

  const settingsMessages = [
    ...(stores.settings.operatorLabel ? [] : ['Operator label is not set.']),
    ...(stores.settings.deviceLabel ? [] : ['Device label is not set.']),
  ]
  diagnostics.push({
    id: 'settings',
    label: 'Settings',
    schemaVersion: `v${ATLAS_SETTINGS_SCHEMA_VERSION}`,
    status: diagnosticStatus(settingsMessages),
    countSummary: `${summary.settings.configured} device label / ${summary.settings.hasOperatorLabel} operator label`,
    messages: settingsMessages,
    repairHint: 'Use Settings to label this local Atlas device and operator.',
  })

  const syncMessages = [
    ...(summary.sync.snapshots === 0 ? ['No local sync snapshots exist yet.'] : []),
    ...(stores.sync.provider.status === 'error'
      ? [`Sync provider error: ${stores.sync.provider.message}`]
      : []),
  ]
  diagnostics.push({
    id: 'sync',
    label: 'Sync',
    schemaVersion: `v${ATLAS_SYNC_SCHEMA_VERSION}`,
    status: diagnosticStatus(syncMessages, stores.sync.provider.status === 'error'),
    countSummary: `${summary.sync.snapshots} local snapshots / provider ${stores.sync.provider.status}`,
    messages: syncMessages,
    repairHint:
      'Create a local snapshot before risky restore testing. Hosted sync remains manual push/pull.',
  })

  diagnostics.push({
    id: 'restore-compatibility',
    label: 'Restore Compatibility',
    schemaVersion: `backup v${ATLAS_BACKUP_SCHEMA_VERSION}`,
    status: 'ok',
    countSummary: 'accepts backup schemas v1-v5',
    messages: [
      'Restore is preview-first and full-replace.',
      'Older backups normalize missing Planning, Reports, Review, Calibration, Settings, and Sync stores.',
    ],
    repairHint:
      'If restore counts look wrong, cancel restore and export the current local backup first.',
  })

  return diagnostics
}

export function createAtlasBackupMarkdownReport(envelope: AtlasBackupEnvelope) {
  const { workspace, dispatch, writing, planning, reports, review, calibration, settings, sync } =
    envelope.summary

  return `# JAMARQ Atlas Backup Report

Generated: ${envelope.exportedAt}
Schema: ${envelope.schemaVersion}

## Included Stores

- Workspace: ${workspace.sections} sections, ${workspace.groups} groups, ${workspace.projects} projects
- Repository bindings: ${workspace.repositoryBindings}
- Activity events: ${workspace.activityEvents}
- Dispatch: ${dispatch.targets} targets, ${dispatch.records} records, ${dispatch.readinessEntries} readiness entries, ${dispatch.preflightRuns} preflight runs, ${dispatch.hostEvidenceRuns} host evidence runs, ${dispatch.verificationEvidenceRuns} verification evidence runs
- Writing: ${writing.drafts} drafts, ${writing.reviewEvents} review events, ${writing.approvedDrafts} approved, ${writing.exportedDrafts} exported, ${writing.archivedDrafts} archived
- Planning: ${planning.objectives} objectives, ${planning.milestones} milestones, ${planning.workSessions} work sessions, ${planning.notes} notes
- Reports: ${reports.packets} packets, ${reports.auditEvents} audit events, ${reports.exportedPackets} exported, ${reports.archivedPackets} archived
- Review: ${review.sessions} sessions, ${review.notes} notes, ${review.followUps} follow-ups, ${review.planned} planned outcomes
- Calibration: ${calibration.progressRecords} progress records, ${calibration.credentialReferences} credential references, ${calibration.auditEvents} audit events
- Settings: ${settings.configured} local settings store
- Sync: ${sync.snapshots} local snapshots, provider configured: ${sync.providerConfigured ? 'yes' : 'no'}

## Restore Rules

- Restore is previewed before it replaces local Atlas data.
- Restore replaces Workspace, Dispatch, Writing, Planning, Reports, Review, Calibration, Settings, and Sync stores together.
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
  const { workspace, dispatch, writing, planning, reports, review, calibration, sync } =
    envelope.summary

  return `JAMARQ Atlas backup ${envelope.exportedAt}: ${workspace.projects} projects, ${dispatch.targets} dispatch targets, ${dispatch.preflightRuns} preflight runs, ${dispatch.hostEvidenceRuns + dispatch.verificationEvidenceRuns} dispatch evidence runs, ${writing.drafts} writing drafts, ${planning.objectives + planning.milestones + planning.workSessions + planning.notes} planning records, ${reports.packets} report packets, ${review.sessions} review sessions, ${calibration.progressRecords} calibration progress records, ${sync.snapshots} sync snapshots.`
}

export function canApplyAtlasRestore(confirmation: string) {
  return confirmation === RESTORE_CONFIRMATION_PHRASE
}
