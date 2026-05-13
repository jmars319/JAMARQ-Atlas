import { describe, expect, it } from 'vitest'
import { seedDispatchState } from '../src/data/seedDispatch'
import { seedWorkspace } from '../src/data/seedWorkspace'
import { emptyPlanningStore } from '../src/services/planning'
import { emptyReportsStore } from '../src/services/reports'
import { emptyReviewStore } from '../src/services/review'
import { emptySettingsState } from '../src/services/settings'
import {
  canApplySyncRestore,
  compareSyncSnapshot,
  createSyncRestorePreview,
  createRemoteSnapshotRetentionNotice,
  createSyncSnapshot,
  emptySyncState,
  fingerprintSyncStores,
  normalizeSyncState,
  recordRemoteSyncPush,
  removeRemoteSyncSnapshot,
  updateSyncProviderState,
  runSyncProviderStub,
} from '../src/services/syncSnapshots'
import {
  createSyncNotConfiguredResponse,
  createSyncStatus,
  getSyncConfig,
  snapshotToRemoteRow,
} from '../server/syncApi'
import { normalizeHostedSyncError } from '../src/services/hostedSync'

const now = new Date('2026-05-10T12:00:00Z')
const planning = emptyPlanningStore(now)
const reports = emptyReportsStore(now)
const review = emptyReviewStore(now)
const stores = {
  workspace: seedWorkspace,
  dispatch: seedDispatchState,
  writing: { drafts: [] },
  planning,
  reports,
  review,
}

function collectKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectKeys(item))
  }

  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, nested]) => [key, ...collectKeys(nested)])
  }

  return []
}

function collectSecretShapedKeys(value: unknown) {
  return collectKeys(value).filter(
    (key) => key !== 'credentialRef' && /token|secret|password|credential/i.test(key),
  )
}

describe('sync snapshots', () => {
  it('normalizes missing sync state into local-only defaults', () => {
    const sync = normalizeSyncState(null, now)

    expect(sync.schemaVersion).toBe(3)
    expect(sync.provider.status).toBe('local-only')
    expect(sync.snapshots).toEqual([])
  })

  it('creates manual snapshots from Workspace, Dispatch, Writing, Planning, Reports, and Review stores only', () => {
    const snapshot = createSyncSnapshot({
      stores,
      settings: emptySettingsState(now),
      sync: emptySyncState(now),
      label: 'Before hosted sync',
      note: 'Manual checkpoint.',
      now,
    })
    const serialized = JSON.stringify(snapshot)

    expect(snapshot.label).toBe('Before hosted sync')
    expect(snapshot.summary.workspace.projects).toBeGreaterThan(0)
    expect(snapshot.summary.dispatch.targets).toBeGreaterThan(0)
    expect(snapshot.summary.writing.drafts).toBe(0)
    expect(snapshot.summary.planning.objectives).toBe(0)
    expect(snapshot.summary.reports.packets).toBe(0)
    expect(snapshot.summary.review.sessions).toBe(0)
    expect(Object.keys(snapshot.stores)).toEqual([
      'workspace',
      'dispatch',
      'writing',
      'planning',
      'reports',
      'review',
    ])
    expect(serialized).not.toContain('jamarq-atlas.settings')
    expect(serialized).not.toContain('jamarq-atlas.sync')
    expect(collectSecretShapedKeys(snapshot)).toEqual([])
  })

  it('creates stable fingerprints for unchanged data', () => {
    const first = fingerprintSyncStores(stores)
    const second = fingerprintSyncStores(JSON.parse(JSON.stringify(stores)))
    const changed = fingerprintSyncStores({
      ...stores,
      workspace: { ...stores.workspace, purpose: `${stores.workspace.purpose} changed` },
    })

    expect(first).toBe(second)
    expect(changed).not.toBe(first)
  })

  it('builds restore previews without mutating current stores', () => {
    const snapshot = createSyncSnapshot({
      stores: {
        ...stores,
        writing: { drafts: [] },
      },
      label: 'Restore candidate',
      note: '',
      now,
    })
    const currentBefore = JSON.stringify(stores)
    const preview = createSyncRestorePreview(stores, snapshot)

    expect(preview.currentSummary.workspace.projects).toBeGreaterThan(0)
    expect(preview.incomingSummary.writing.drafts).toBe(0)
    expect(JSON.stringify(stores)).toBe(currentBefore)
  })

  it('warns on same-fingerprint restores and incoming count drops', () => {
    const identicalSnapshot = createSyncSnapshot({
      stores,
      label: 'Same state',
      note: '',
      now,
    })
    const samePreview = createSyncRestorePreview(stores, identicalSnapshot)

    expect(samePreview.fingerprintMatches).toBe(true)
    expect(samePreview.warnings).toContain('Incoming snapshot fingerprint matches current local stores.')

    const smallerSnapshot = createSyncSnapshot({
      stores: {
        workspace: { ...seedWorkspace, sections: [] },
        dispatch: { ...seedDispatchState, targets: [] },
        writing: { drafts: [] },
        planning,
        reports,
        review,
      },
      label: 'Smaller state',
      note: '',
      now,
    })
    const smallerPreview = createSyncRestorePreview(stores, smallerSnapshot)

    expect(smallerPreview.warnings).toContain('Incoming snapshot contains no projects.')
    expect(smallerPreview.warnings).toContain(
      'Incoming snapshot has fewer Dispatch targets than current local data.',
    )
  })

  it('requires exact typed confirmation before restore can apply', () => {
    expect(canApplySyncRestore('RESTORE ATLAS')).toBe(true)
    expect(canApplySyncRestore('restore atlas')).toBe(false)
  })

  it('returns provider stub results without external writes', () => {
    const result = runSyncProviderStub('push', now)

    expect(result.status).toBe('not-configured')
    expect(result.operation).toBe('push')
    expect(result.message).toContain('No external read or write')
  })

  it('reports missing Supabase config as a scoped not-configured result', () => {
    const config = getSyncConfig({})
    const status = createSyncStatus(config)
    const response = createSyncNotConfiguredResponse(config)

    expect(status.data?.configured).toBe(false)
    expect(response.error?.type).toBe('not-configured')
    expect(response.configured).toBe(false)
  })

  it('normalizes hosted sync errors into safe provider messages', () => {
    expect(
      normalizeHostedSyncError(
        { type: 'supabase-error', message: 'Relation atlas_sync_snapshots does not exist.' },
        'Fallback sync error.',
      ),
    ).toEqual({
      type: 'supabase-error',
      message: 'Relation atlas_sync_snapshots does not exist.',
    })
    expect(normalizeHostedSyncError({ type: 'password', message: 12 }, 'Fallback sync error.')).toEqual({
      type: 'unknown',
      message: 'Fallback sync error.',
    })
  })

  it('builds Supabase push rows from Workspace, Dispatch, Writing, Planning, Reports, and Review only', () => {
    const snapshot = createSyncSnapshot({
      stores,
      settings: emptySettingsState(now),
      sync: emptySyncState(now),
      label: 'Remote candidate',
      note: 'No sensitive values.',
      now,
    })
    const row = snapshotToRemoteRow(snapshot, 'atlas-test')

    expect(row.workspace_id).toBe('atlas-test')
    expect(row.snapshot_id).toBe(snapshot.id)
    expect(Object.keys(row.stores)).toEqual([
      'workspace',
      'dispatch',
      'writing',
      'planning',
      'reports',
      'review',
    ])
    expect(collectSecretShapedKeys(row)).toEqual([])
  })

  it('records remote provider errors without removing local snapshots', () => {
    const snapshot = createSyncSnapshot({
      stores,
      label: 'Local keeper',
      note: '',
      now,
    })
    const withSnapshot = {
      ...emptySyncState(now),
      snapshots: [snapshot],
    }
    const errored = updateSyncProviderState(withSnapshot, {
      id: 'supabase',
      status: 'error',
      message: 'Provider error.',
    })

    expect(errored.snapshots).toHaveLength(1)
    expect(errored.provider.status).toBe('error')
  })

  it('tracks pushed remote snapshots without copying full stores into provider metadata', () => {
    const snapshot = createSyncSnapshot({
      stores,
      label: 'Remote metadata',
      note: '',
      now,
    })
    const updated = recordRemoteSyncPush(emptySyncState(now), {
      id: snapshot.id,
      label: snapshot.label,
      note: snapshot.note,
      createdAt: snapshot.createdAt,
      deviceId: snapshot.deviceId,
      deviceLabel: snapshot.deviceLabel,
      fingerprint: snapshot.fingerprint,
      summary: snapshot.summary,
    })

    expect(updated.provider.status).toBe('configured')
    expect(updated.provider.remoteSnapshots[0].id).toBe(snapshot.id)
    expect(JSON.stringify(updated.provider.remoteSnapshots[0])).not.toContain('"stores"')
  })

  it('compares local and remote snapshot fingerprints and counts', () => {
    const snapshot = createSyncSnapshot({
      stores,
      label: 'Remote comparison',
      note: '',
      now,
    })
    const comparison = compareSyncSnapshot(stores, {
      id: snapshot.id,
      label: snapshot.label,
      note: snapshot.note,
      createdAt: snapshot.createdAt,
      deviceId: snapshot.deviceId,
      deviceLabel: snapshot.deviceLabel,
      fingerprint: snapshot.fingerprint,
      summary: snapshot.summary,
    })

    expect(comparison.fingerprintMatches).toBe(true)
    expect(comparison.summaryLines.join(' ')).toContain('Projects')
  })

  it('removes remote snapshot metadata locally after provider delete', () => {
    const snapshot = createSyncSnapshot({
      stores,
      label: 'Remote delete candidate',
      note: '',
      now,
    })
    const withRemote = recordRemoteSyncPush(emptySyncState(now), {
      id: snapshot.id,
      label: snapshot.label,
      note: snapshot.note,
      createdAt: snapshot.createdAt,
      deviceId: snapshot.deviceId,
      deviceLabel: snapshot.deviceLabel,
      fingerprint: snapshot.fingerprint,
      summary: snapshot.summary,
    })
    const removed = removeRemoteSyncSnapshot(withRemote, snapshot.id, now)

    expect(removed.provider.remoteSnapshots).toEqual([])
  })

  it('returns a latest-50 retention warning when remote metadata reaches the load limit', () => {
    const notice = createRemoteSnapshotRetentionNotice(
      Array.from({ length: 50 }, (_, index) => ({
        id: `remote-${index}`,
        label: `Remote ${index}`,
        note: '',
        createdAt: now.toISOString(),
        deviceId: 'device',
        deviceLabel: 'Device',
        fingerprint: `fingerprint-${index}`,
        summary: {
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
        },
      })),
    )

    expect(notice.warning).toContain('Showing latest 50 remote snapshots')
  })
})
