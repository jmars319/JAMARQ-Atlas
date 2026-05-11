import type { Workspace } from '../domain/atlas'
import type { AtlasSettingsState } from '../domain/settings'
import {
  ATLAS_SYNC_SCHEMA_VERSION,
  type AtlasSyncCoreStores,
  type AtlasSyncProviderOperation,
  type AtlasSyncProviderResult,
  type AtlasSyncProviderState,
  type AtlasSyncRestorePreview,
  type AtlasSyncSnapshot,
  type AtlasSyncState,
  type AtlasSyncStoreSummary,
} from '../domain/sync'
import { normalizeWritingState } from './aiWritingAssistant'
import { normalizeDispatchState } from './dispatchStorage'
import { normalizeWorkspaceVerificationCadence } from './verification'

export const SYNC_RESTORE_CONFIRMATION_PHRASE = 'RESTORE ATLAS'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
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
    dispatch: normalizeDispatchState(value.dispatch ?? {}),
    writing: normalizeWritingState(value.writing ?? {}),
  }
}

export function fingerprintSyncStores(stores: AtlasSyncCoreStores) {
  return `fnv1a-${hashText(stableStringify(stores))}`
}

export function createLocalSyncProviderState(now = new Date()): AtlasSyncProviderState {
  return {
    id: 'local',
    status: 'local-only',
    message: 'Manual local snapshots are available. Hosted sync is not configured.',
    updatedAt: now.toISOString(),
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
        id: 'local' as const,
        status: 'local-only' as const,
        message:
          readString(value.provider.message) ||
          'Manual local snapshots are available. Hosted sync is not configured.',
        updatedAt: safeDate(value.provider.updatedAt, now),
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
  const normalizedStores = normalizeSyncStores(snapshot.stores)
  const warnings: string[] = []
  const incomingSummary = summarizeSyncStores(normalizedStores)

  if (incomingSummary.workspace.projects === 0) {
    warnings.push('Incoming snapshot contains no projects.')
  }

  return {
    snapshotId: snapshot.id,
    currentSummary: summarizeSyncStores(currentStores),
    incomingSummary,
    warnings,
    normalizedStores,
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
