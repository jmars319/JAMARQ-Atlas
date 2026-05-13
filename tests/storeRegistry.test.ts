import { describe, expect, it } from 'vitest'
import {
  ATLAS_BACKUP_STORE_IDS,
  ATLAS_STORE_DEFINITIONS_BY_ID,
  ATLAS_STORE_REGISTRY,
  ATLAS_SYNC_SNAPSHOT_STORE_IDS,
} from '../src/domain/storeRegistry'
import { getSyncSnapshotStoreDefinitions } from '../src/services/syncSnapshots'

const allStoreIds = [
  'workspace',
  'dispatch',
  'writing',
  'planning',
  'reports',
  'review',
  'calibration',
  'settings',
  'sync',
]

describe('Atlas store registry', () => {
  it('defines every Atlas local store with keys and secret policy', () => {
    expect(ATLAS_STORE_REGISTRY.map((definition) => definition.id)).toEqual(allStoreIds)

    for (const definition of ATLAS_STORE_REGISTRY) {
      expect(definition.label.length).toBeGreaterThan(0)
      expect(definition.localStorageKey).toMatch(/^jamarq-atlas\./)
      expect(definition.schemaVersionLabel.length).toBeGreaterThan(0)
      expect(definition.restoreBehaviorLabel.length).toBeGreaterThan(0)
      expect(definition.secretPolicy.toLowerCase()).toContain('secret')
      expect(ATLAS_STORE_DEFINITIONS_BY_ID[definition.id]).toBe(definition)
    }
  })

  it('marks backup and sync snapshot inclusion from one policy surface', () => {
    expect(ATLAS_BACKUP_STORE_IDS).toEqual(allStoreIds)
    expect(ATLAS_SYNC_SNAPSHOT_STORE_IDS).toEqual([
      'workspace',
      'dispatch',
      'writing',
      'planning',
      'reports',
      'review',
      'calibration',
    ])
    expect(ATLAS_STORE_DEFINITIONS_BY_ID.settings.syncSnapshotIncluded).toBe(false)
    expect(ATLAS_STORE_DEFINITIONS_BY_ID.sync.syncSnapshotIncluded).toBe(false)
  })

  it('exposes Sync snapshot store metadata from the registry', () => {
    expect(getSyncSnapshotStoreDefinitions().map((definition) => definition.id)).toEqual(
      ATLAS_SYNC_SNAPSHOT_STORE_IDS,
    )
    expect(getSyncSnapshotStoreDefinitions().some((definition) => definition.id === 'settings')).toBe(
      false,
    )
  })
})
