import { describe, expect, it } from 'vitest'
import { seedDispatchState } from '../src/data/seedDispatch'
import { seedWorkspace } from '../src/data/seedWorkspace'
import { emptySettingsState } from '../src/services/settings'
import {
  canApplySyncRestore,
  createSyncRestorePreview,
  createSyncSnapshot,
  emptySyncState,
  fingerprintSyncStores,
  normalizeSyncState,
  runSyncProviderStub,
} from '../src/services/syncSnapshots'

const now = new Date('2026-05-10T12:00:00Z')
const stores = {
  workspace: seedWorkspace,
  dispatch: seedDispatchState,
  writing: { drafts: [] },
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

describe('sync snapshots', () => {
  it('normalizes missing sync state into local-only defaults', () => {
    const sync = normalizeSyncState(null, now)

    expect(sync.schemaVersion).toBe(1)
    expect(sync.provider.status).toBe('local-only')
    expect(sync.snapshots).toEqual([])
  })

  it('creates manual snapshots from Workspace, Dispatch, and Writing stores only', () => {
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
    expect(Object.keys(snapshot.stores)).toEqual(['workspace', 'dispatch', 'writing'])
    expect(serialized).not.toContain('jamarq-atlas.settings')
    expect(serialized).not.toContain('jamarq-atlas.sync')
    expect(collectKeys(snapshot).join(' ')).not.toMatch(/token|secret|password|credential/i)
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
})
