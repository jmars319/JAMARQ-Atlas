import type { Workspace } from '../domain/atlas'
import type { AtlasSettingsState } from '../domain/settings'
import {
  ATLAS_SYNC_SNAPSHOT_STORE_IDS,
  getAtlasStoreDefinition,
} from '../domain/storeRegistry'
import {
  ATLAS_SYNC_SCHEMA_VERSION,
  type AtlasSyncCoreStores,
  type AtlasSyncProviderOperation,
  type AtlasSyncProviderResult,
  type AtlasSyncProviderState,
  type AtlasRemoteSyncSnapshot,
  type AtlasSyncRetentionNotice,
  type AtlasSyncRestorePreview,
  type AtlasSyncSnapshotComparison,
  type AtlasSyncSnapshot,
  type AtlasSyncState,
  type AtlasSyncStoreSummary,
} from '../domain/sync'
import { normalizeWritingState } from './aiWritingAssistant'
import { normalizeCalibrationState, summarizeCalibrationState } from './calibration'
import { normalizeDispatchState } from './dispatchStorage'
import { normalizePlanningState, summarizePlanningState } from './planning'
import { normalizeReportsState } from './reports'
import { normalizeReviewState, summarizeReviewState } from './review'
import { normalizeWorkspaceVerificationCadence } from './verification'

export const SYNC_RESTORE_CONFIRMATION_PHRASE = 'RESTORE ATLAS'
export const REMOTE_SYNC_SNAPSHOT_LIMIT = 50
const SYNC_NORMALIZATION_FALLBACK_DATE = new Date('1970-01-01T00:00:00.000Z')

export function getSyncSnapshotStoreDefinitions() {
  return ATLAS_SYNC_SNAPSHOT_STORE_IDS.map((storeId) => getAtlasStoreDefinition(storeId))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function emptySyncSummary(): AtlasSyncStoreSummary {
  return {
    workspace: {
      sections: 0,
      groups: 0,
      projects: 0,
      repositoryBindings: 0,
      activityEvents: 0,
    },
    dispatch: {
      targets: 0,
      records: 0,
      readinessEntries: 0,
      preflightRuns: 0,
    },
    writing: {
      drafts: 0,
      reviewEvents: 0,
      approvedDrafts: 0,
      exportedDrafts: 0,
      archivedDrafts: 0,
    },
    planning: {
      objectives: 0,
      milestones: 0,
      workSessions: 0,
      notes: 0,
      active: 0,
      planned: 0,
      waiting: 0,
    },
    reports: {
      packets: 0,
      auditEvents: 0,
      exportedPackets: 0,
      archivedPackets: 0,
    },
    review: {
      sessions: 0,
      notes: 0,
      followUps: 0,
      planned: 0,
    },
    calibration: {
      progressRecords: 0,
      needsValue: 0,
      entered: 0,
      verified: 0,
      deferred: 0,
      credentialReferences: 0,
      auditEvents: 0,
    },
  }
}

function normalizeSyncSummary(value: unknown): AtlasSyncStoreSummary {
  const defaults = emptySyncSummary()

  if (!isRecord(value)) {
    return defaults
  }

  const workspace = isRecord(value.workspace) ? value.workspace : {}
  const dispatch = isRecord(value.dispatch) ? value.dispatch : {}
  const writing = isRecord(value.writing) ? value.writing : {}
  const planning = isRecord(value.planning) ? value.planning : {}
  const reports = isRecord(value.reports) ? value.reports : {}
  const review = isRecord(value.review) ? value.review : {}
  const calibration = isRecord(value.calibration) ? value.calibration : {}

  return {
    workspace: {
      sections: Number(workspace.sections) || 0,
      groups: Number(workspace.groups) || 0,
      projects: Number(workspace.projects) || 0,
      repositoryBindings: Number(workspace.repositoryBindings) || 0,
      activityEvents: Number(workspace.activityEvents) || 0,
    },
    dispatch: {
      targets: Number(dispatch.targets) || 0,
      records: Number(dispatch.records) || 0,
      readinessEntries: Number(dispatch.readinessEntries) || 0,
      preflightRuns: Number(dispatch.preflightRuns) || 0,
    },
    writing: {
      drafts: Number(writing.drafts) || 0,
      reviewEvents: Number(writing.reviewEvents) || 0,
      approvedDrafts: Number(writing.approvedDrafts) || 0,
      exportedDrafts: Number(writing.exportedDrafts) || 0,
      archivedDrafts: Number(writing.archivedDrafts) || 0,
    },
    planning: {
      objectives: Number(planning.objectives) || 0,
      milestones: Number(planning.milestones) || 0,
      workSessions: Number(planning.workSessions) || 0,
      notes: Number(planning.notes) || 0,
      active: Number(planning.active) || 0,
      planned: Number(planning.planned) || 0,
      waiting: Number(planning.waiting) || 0,
    },
    reports: {
      packets: Number(reports.packets) || 0,
      auditEvents: Number(reports.auditEvents) || 0,
      exportedPackets: Number(reports.exportedPackets) || 0,
      archivedPackets: Number(reports.archivedPackets) || 0,
    },
    review: {
      sessions: Number(review.sessions) || 0,
      notes: Number(review.notes) || 0,
      followUps: Number(review.followUps) || 0,
      planned: Number(review.planned) || 0,
    },
    calibration: {
      progressRecords: Number(calibration.progressRecords) || 0,
      needsValue: Number(calibration.needsValue) || 0,
      entered: Number(calibration.entered) || 0,
      verified: Number(calibration.verified) || 0,
      deferred: Number(calibration.deferred) || 0,
      credentialReferences: Number(calibration.credentialReferences) || 0,
      auditEvents: Number(calibration.auditEvents) || 0,
    },
  }
}

function safeDate(value: unknown, fallback: Date) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value
  }

  return fallback.toISOString()
}

function createDeviceId(now = new Date()) {
  return `atlas-sync-${now.getTime().toString(36)}`
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

function hashText(value: string) {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function summarizeSyncStores(stores: AtlasSyncCoreStores): AtlasSyncStoreSummary {
  const groups = stores.workspace.sections.flatMap((section) => section.groups)
  const projects = groups.flatMap((group) => group.projects)

  return {
    workspace: {
      sections: stores.workspace.sections.length,
      groups: groups.length,
      projects: projects.length,
      repositoryBindings: projects.reduce(
        (total, project) => total + project.repositories.length,
        0,
      ),
      activityEvents: projects.reduce((total, project) => total + project.activity.length, 0),
    },
    dispatch: {
      targets: stores.dispatch.targets.length,
      records: stores.dispatch.records.length,
      readinessEntries: stores.dispatch.readiness.length,
      preflightRuns: stores.dispatch.preflightRuns.length,
    },
    writing: {
      drafts: stores.writing.drafts.length,
      reviewEvents: stores.writing.drafts.reduce(
        (total, draft) => total + draft.reviewEvents.length,
        0,
      ),
      approvedDrafts: stores.writing.drafts.filter((draft) => draft.status === 'approved').length,
      exportedDrafts: stores.writing.drafts.filter((draft) => draft.status === 'exported').length,
      archivedDrafts: stores.writing.drafts.filter((draft) => draft.status === 'archived').length,
    },
    planning: summarizePlanningState(stores.planning),
    reports: {
      packets: stores.reports.packets.length,
      auditEvents: stores.reports.packets.reduce(
        (total, packet) => total + packet.auditEvents.length,
        0,
      ),
      exportedPackets: stores.reports.packets.filter((packet) => packet.status === 'exported').length,
      archivedPackets: stores.reports.packets.filter((packet) => packet.status === 'archived').length,
    },
    review: summarizeReviewState(stores.review),
    calibration: summarizeCalibrationState(stores.calibration),
  }
}

export function normalizeSyncStores(value: unknown): AtlasSyncCoreStores {
  if (!isRecord(value)) {
    throw new Error('Sync stores must be an object.')
  }

  if (!value.workspace) {
    throw new Error('Sync snapshot is missing workspace state.')
  }

  return {
    workspace: normalizeWorkspaceVerificationCadence(value.workspace as Workspace),
    dispatch: normalizeDispatchState(value.dispatch ?? {}, SYNC_NORMALIZATION_FALLBACK_DATE),
    writing: normalizeWritingState(value.writing ?? {}),
    planning: normalizePlanningState(value.planning ?? {}),
    reports: normalizeReportsState(value.reports ?? {}),
    review: normalizeReviewState(value.review ?? {}),
    calibration: normalizeCalibrationState(value.calibration ?? {}, SYNC_NORMALIZATION_FALLBACK_DATE),
  }
}

export function fingerprintSyncStores(stores: AtlasSyncCoreStores) {
  return `fnv1a-${hashText(stableStringify(normalizeSyncStores(stores)))}`
}

export function createLocalSyncProviderState(now = new Date()): AtlasSyncProviderState {
  return {
    id: 'local',
    status: 'local-only',
    message: 'Manual local snapshots are available. Hosted sync is not configured.',
    updatedAt: now.toISOString(),
    remoteSnapshots: [],
  }
}

export function createSupabaseSyncProviderState({
  status,
  message,
  workspaceId,
  remoteSnapshots = [],
  now = new Date(),
}: {
  status: AtlasSyncProviderState['status']
  message: string
  workspaceId?: string
  remoteSnapshots?: AtlasRemoteSyncSnapshot[]
  now?: Date
}): AtlasSyncProviderState {
  return {
    id: 'supabase',
    status,
    message,
    workspaceId,
    updatedAt: now.toISOString(),
    remoteSnapshots,
  }
}

export function emptySyncState(now = new Date()): AtlasSyncState {
  return {
    schemaVersion: ATLAS_SYNC_SCHEMA_VERSION,
    deviceId: createDeviceId(now),
    deviceLabel: 'Local Atlas device',
    provider: createLocalSyncProviderState(now),
    snapshots: [],
    updatedAt: now.toISOString(),
  }
}

export function normalizeSyncSnapshot(value: unknown, now = new Date()): AtlasSyncSnapshot | null {
  if (!isRecord(value)) {
    return null
  }

  try {
    const stores = normalizeSyncStores(value.stores)
    const createdAt = safeDate(value.createdAt, now)
    const fingerprint = readString(value.fingerprint) || fingerprintSyncStores(stores)

    return {
      id: readString(value.id) || `snapshot-${Date.parse(createdAt).toString(36)}-${fingerprint}`,
      label: readString(value.label) || 'Manual snapshot',
      note: readString(value.note),
      createdAt,
      deviceId: readString(value.deviceId) || 'unknown-device',
      deviceLabel: readString(value.deviceLabel) || 'Unknown device',
      fingerprint,
      summary: summarizeSyncStores(stores),
      stores,
    }
  } catch {
    return null
  }
}

export function normalizeSyncState(value: unknown, now = new Date()): AtlasSyncState {
  const defaults = emptySyncState(now)

  if (!isRecord(value)) {
    return defaults
  }

  const provider = isRecord(value.provider)
    ? {
        id: readString(value.provider.id) === 'supabase' ? ('supabase' as const) : ('local' as const),
        status:
          readString(value.provider.status) === 'configured' ||
          readString(value.provider.status) === 'not-configured' ||
          readString(value.provider.status) === 'error'
            ? (readString(value.provider.status) as AtlasSyncProviderState['status'])
            : ('local-only' as const),
        message:
          readString(value.provider.message) ||
          'Manual local snapshots are available. Hosted sync is not configured.',
        updatedAt: safeDate(value.provider.updatedAt, now),
        workspaceId: readString(value.provider.workspaceId) || undefined,
        lastPushAt: readString(value.provider.lastPushAt)
          ? safeDate(value.provider.lastPushAt, now)
          : undefined,
        lastPullAt: readString(value.provider.lastPullAt)
          ? safeDate(value.provider.lastPullAt, now)
          : undefined,
        remoteSnapshots: Array.isArray(value.provider.remoteSnapshots)
          ? value.provider.remoteSnapshots
              .map((snapshot) => normalizeRemoteSyncSnapshot(snapshot))
              .filter((snapshot): snapshot is AtlasRemoteSyncSnapshot => snapshot !== null)
          : [],
      }
    : defaults.provider
  const snapshots = Array.isArray(value.snapshots)
    ? value.snapshots
        .map((snapshot) => normalizeSyncSnapshot(snapshot, now))
        .filter((snapshot): snapshot is AtlasSyncSnapshot => snapshot !== null)
    : []

  return {
    schemaVersion: ATLAS_SYNC_SCHEMA_VERSION,
    deviceId: readString(value.deviceId) || defaults.deviceId,
    deviceLabel: readString(value.deviceLabel) || defaults.deviceLabel,
    provider,
    snapshots,
    updatedAt: safeDate(value.updatedAt, now),
  }
}

export function createSyncSnapshot({
  stores,
  settings,
  sync,
  label,
  note,
  now = new Date(),
}: {
  stores: AtlasSyncCoreStores
  settings?: AtlasSettingsState
  sync?: AtlasSyncState
  label: string
  note: string
  now?: Date
}): AtlasSyncSnapshot {
  const normalizedStores = normalizeSyncStores(stores)
  const fingerprint = fingerprintSyncStores(normalizedStores)
  const createdAt = now.toISOString()
  const snapshotLabel = label.trim() || `Manual snapshot ${createdAt.slice(0, 10)}`
  const deviceId = sync?.deviceId || settings?.deviceId || createDeviceId(now)
  const deviceLabel = settings?.deviceLabel || sync?.deviceLabel || 'Local Atlas device'

  return {
    id: `snapshot-${now.getTime().toString(36)}-${fingerprint.slice(-8)}`,
    label: snapshotLabel,
    note: note.trim(),
    createdAt,
    deviceId,
    deviceLabel,
    fingerprint,
    summary: summarizeSyncStores(normalizedStores),
    stores: normalizedStores,
  }
}

export function normalizeRemoteSyncSnapshot(value: unknown): AtlasRemoteSyncSnapshot | null {
  if (!isRecord(value)) {
    return null
  }

  if (!readString(value.id)) {
    return null
  }

  return {
    id: readString(value.id),
    label: readString(value.label) || 'Remote snapshot',
    note: readString(value.note),
    createdAt: safeDate(value.createdAt, new Date()),
    deviceId: readString(value.deviceId) || 'unknown-device',
    deviceLabel: readString(value.deviceLabel) || 'Unknown device',
    fingerprint: readString(value.fingerprint),
    summary: normalizeSyncSummary(value.summary),
  }
}

export function updateSyncProviderState(
  state: AtlasSyncState,
  provider: Partial<AtlasSyncProviderState>,
  now = new Date(),
): AtlasSyncState {
  return {
    ...state,
    provider: {
      ...state.provider,
      ...provider,
      remoteSnapshots: provider.remoteSnapshots ?? state.provider.remoteSnapshots,
      updatedAt: now.toISOString(),
    },
    updatedAt: now.toISOString(),
  }
}

export function recordRemoteSyncSnapshots(
  state: AtlasSyncState,
  remoteSnapshots: AtlasRemoteSyncSnapshot[],
  now = new Date(),
): AtlasSyncState {
  return updateSyncProviderState(
    state,
    {
      id: 'supabase',
      status: 'configured',
      message: `${remoteSnapshots.length} remote snapshots loaded.`,
      remoteSnapshots,
      lastPullAt: now.toISOString(),
    },
    now,
  )
}

export function recordRemoteSyncPush(
  state: AtlasSyncState,
  snapshot: AtlasRemoteSyncSnapshot,
  now = new Date(),
): AtlasSyncState {
  const remoteSnapshots = [
    snapshot,
    ...state.provider.remoteSnapshots.filter((candidate) => candidate.id !== snapshot.id),
  ]

  return updateSyncProviderState(
    state,
    {
      id: 'supabase',
      status: 'configured',
      message: `Remote snapshot ${snapshot.label} pushed.`,
      remoteSnapshots,
      lastPushAt: now.toISOString(),
    },
    now,
  )
}

export function removeRemoteSyncSnapshot(
  state: AtlasSyncState,
  snapshotId: string,
  now = new Date(),
): AtlasSyncState {
  return updateSyncProviderState(
    state,
    {
      remoteSnapshots: state.provider.remoteSnapshots.filter(
        (snapshot) => snapshot.id !== snapshotId,
      ),
      message: 'Remote snapshot deleted from provider metadata.',
    },
    now,
  )
}

export function addSyncSnapshot(state: AtlasSyncState, snapshot: AtlasSyncSnapshot): AtlasSyncState {
  return {
    ...state,
    deviceId: snapshot.deviceId,
    deviceLabel: snapshot.deviceLabel,
    snapshots: [snapshot, ...state.snapshots.filter((candidate) => candidate.id !== snapshot.id)],
    updatedAt: snapshot.createdAt,
  }
}

export function deleteSyncSnapshot(
  state: AtlasSyncState,
  snapshotId: string,
  now = new Date(),
): AtlasSyncState {
  return {
    ...state,
    snapshots: state.snapshots.filter((snapshot) => snapshot.id !== snapshotId),
    updatedAt: now.toISOString(),
  }
}

export function createSyncRestorePreview(
  currentStores: AtlasSyncCoreStores,
  snapshot: AtlasSyncSnapshot,
): AtlasSyncRestorePreview {
  const normalizedCurrentStores = normalizeSyncStores(currentStores)
  const normalizedStores = normalizeSyncStores(snapshot.stores)
  const warnings: string[] = []
  const currentSummary = summarizeSyncStores(normalizedCurrentStores)
  const incomingSummary = summarizeSyncStores(normalizedStores)
  const currentFingerprint = fingerprintSyncStores(normalizedCurrentStores)
  const incomingFingerprint = fingerprintSyncStores(normalizedStores)

  if (incomingSummary.workspace.projects === 0) {
    warnings.push('Incoming snapshot contains no projects.')
  }

  if (incomingSummary.dispatch.targets === 0) {
    warnings.push('Incoming snapshot contains no Dispatch targets.')
  }

  if (incomingSummary.writing.drafts === 0) {
    warnings.push('Incoming snapshot contains no Writing drafts.')
  }

  if (
    incomingSummary.planning.objectives +
      incomingSummary.planning.milestones +
      incomingSummary.planning.workSessions +
      incomingSummary.planning.notes ===
    0
  ) {
    warnings.push('Incoming snapshot contains no Planning records.')
  }

  if (currentFingerprint === incomingFingerprint) {
    warnings.push('Incoming snapshot fingerprint matches current local stores.')
  }

  if (incomingSummary.workspace.projects < currentSummary.workspace.projects) {
    warnings.push('Incoming snapshot has fewer projects than current local data.')
  }

  if (incomingSummary.dispatch.targets < currentSummary.dispatch.targets) {
    warnings.push('Incoming snapshot has fewer Dispatch targets than current local data.')
  }

  if (incomingSummary.writing.drafts < currentSummary.writing.drafts) {
    warnings.push('Incoming snapshot has fewer Writing drafts than current local data.')
  }

  if (incomingSummary.reports.packets < currentSummary.reports.packets) {
    warnings.push('Incoming snapshot has fewer Report packets than current local data.')
  }

  if (incomingSummary.review.sessions < currentSummary.review.sessions) {
    warnings.push('Incoming snapshot has fewer Review sessions than current local data.')
  }

  if (incomingSummary.calibration.progressRecords < currentSummary.calibration.progressRecords) {
    warnings.push('Incoming snapshot has fewer Calibration progress records than current local data.')
  }

  return {
    snapshotId: snapshot.id,
    currentSummary,
    incomingSummary,
    fingerprintMatches: currentFingerprint === incomingFingerprint,
    warnings,
    normalizedStores,
  }
}

function countDrops(
  currentSummary: AtlasSyncStoreSummary,
  incomingSummary: AtlasSyncStoreSummary,
) {
  const drops: string[] = []

  if (incomingSummary.workspace.projects < currentSummary.workspace.projects) {
    drops.push(
      `Projects drop from ${currentSummary.workspace.projects} to ${incomingSummary.workspace.projects}.`,
    )
  }

  if (incomingSummary.workspace.repositoryBindings < currentSummary.workspace.repositoryBindings) {
    drops.push(
      `Repository bindings drop from ${currentSummary.workspace.repositoryBindings} to ${incomingSummary.workspace.repositoryBindings}.`,
    )
  }

  if (incomingSummary.dispatch.targets < currentSummary.dispatch.targets) {
    drops.push(
      `Dispatch targets drop from ${currentSummary.dispatch.targets} to ${incomingSummary.dispatch.targets}.`,
    )
  }

  if (incomingSummary.dispatch.preflightRuns < currentSummary.dispatch.preflightRuns) {
    drops.push(
      `Dispatch preflight runs drop from ${currentSummary.dispatch.preflightRuns} to ${incomingSummary.dispatch.preflightRuns}.`,
    )
  }

  if (incomingSummary.writing.drafts < currentSummary.writing.drafts) {
    drops.push(
      `Writing drafts drop from ${currentSummary.writing.drafts} to ${incomingSummary.writing.drafts}.`,
    )
  }

  const currentPlanning =
    currentSummary.planning.objectives +
    currentSummary.planning.milestones +
    currentSummary.planning.workSessions +
    currentSummary.planning.notes
  const incomingPlanning =
    incomingSummary.planning.objectives +
    incomingSummary.planning.milestones +
    incomingSummary.planning.workSessions +
    incomingSummary.planning.notes

  if (incomingPlanning < currentPlanning) {
    drops.push(`Planning records drop from ${currentPlanning} to ${incomingPlanning}.`)
  }

  if (incomingSummary.reports.packets < currentSummary.reports.packets) {
    drops.push(
      `Report packets drop from ${currentSummary.reports.packets} to ${incomingSummary.reports.packets}.`,
    )
  }

  if (incomingSummary.review.sessions < currentSummary.review.sessions) {
    drops.push(
      `Review sessions drop from ${currentSummary.review.sessions} to ${incomingSummary.review.sessions}.`,
    )
  }

  if (incomingSummary.calibration.progressRecords < currentSummary.calibration.progressRecords) {
    drops.push(
      `Calibration progress records drop from ${currentSummary.calibration.progressRecords} to ${incomingSummary.calibration.progressRecords}.`,
    )
  }

  return drops
}

export function compareSyncSnapshot(
  currentStores: AtlasSyncCoreStores,
  snapshot: Pick<
    AtlasSyncSnapshot | AtlasRemoteSyncSnapshot,
    'id' | 'createdAt' | 'deviceLabel' | 'fingerprint' | 'summary'
  >,
): AtlasSyncSnapshotComparison {
  const normalizedCurrentStores = normalizeSyncStores(currentStores)
  const currentSummary = summarizeSyncStores(normalizedCurrentStores)
  const localFingerprint = fingerprintSyncStores(normalizedCurrentStores)
  const drops = countDrops(currentSummary, snapshot.summary)

  return {
    snapshotId: snapshot.id,
    localFingerprint,
    remoteFingerprint: snapshot.fingerprint,
    fingerprintMatches: localFingerprint === snapshot.fingerprint,
    createdAt: snapshot.createdAt,
    deviceLabel: snapshot.deviceLabel,
    countDrops: drops,
    summaryLines: [
      `Projects: local ${currentSummary.workspace.projects}, snapshot ${snapshot.summary.workspace.projects}`,
      `Repository bindings: local ${currentSummary.workspace.repositoryBindings}, snapshot ${snapshot.summary.workspace.repositoryBindings}`,
      `Dispatch targets: local ${currentSummary.dispatch.targets}, snapshot ${snapshot.summary.dispatch.targets}`,
      `Preflight runs: local ${currentSummary.dispatch.preflightRuns}, snapshot ${snapshot.summary.dispatch.preflightRuns}`,
      `Writing drafts: local ${currentSummary.writing.drafts}, snapshot ${snapshot.summary.writing.drafts}`,
      `Writing review events: local ${currentSummary.writing.reviewEvents}, snapshot ${snapshot.summary.writing.reviewEvents}`,
      `Planning records: local ${
        currentSummary.planning.objectives +
        currentSummary.planning.milestones +
        currentSummary.planning.workSessions +
        currentSummary.planning.notes
      }, snapshot ${
        snapshot.summary.planning.objectives +
        snapshot.summary.planning.milestones +
        snapshot.summary.planning.workSessions +
        snapshot.summary.planning.notes
      }`,
      `Report packets: local ${currentSummary.reports.packets}, snapshot ${snapshot.summary.reports.packets}`,
      `Review sessions: local ${currentSummary.review.sessions}, snapshot ${snapshot.summary.review.sessions}`,
      `Calibration progress: local ${currentSummary.calibration.progressRecords}, snapshot ${snapshot.summary.calibration.progressRecords}`,
    ],
  }
}

export function createRemoteSnapshotRetentionNotice(
  snapshots: AtlasRemoteSyncSnapshot[],
  limit = REMOTE_SYNC_SNAPSHOT_LIMIT,
): AtlasSyncRetentionNotice {
  const warning =
    snapshots.length >= limit
      ? `Showing latest ${limit} remote snapshots. Older remote snapshots may exist in Supabase but are not loaded locally.`
      : null

  return {
    limit,
    shown: snapshots.length,
    message: `Showing latest ${limit} remote snapshots.`,
    warning,
  }
}

export function canApplySyncRestore(confirmation: string) {
  return confirmation === SYNC_RESTORE_CONFIRMATION_PHRASE
}

export function runSyncProviderStub(
  operation: AtlasSyncProviderOperation,
  now = new Date(),
): AtlasSyncProviderResult {
  return {
    operation,
    status: 'not-configured',
    message: 'Hosted sync provider is not configured. No external read or write was attempted.',
    occurredAt: now.toISOString(),
  }
}
