import { useEffect, useState } from 'react'
import type { AtlasRemoteSyncSnapshot, AtlasSyncProviderState, AtlasSyncSnapshot, AtlasSyncState } from '../domain/sync'
import { ATLAS_STORE_DEFINITIONS_BY_ID } from '../domain/storeRegistry'
import {
  addSyncSnapshot,
  deleteSyncSnapshot,
  emptySyncState,
  normalizeSyncState,
  recordRemoteSyncPush,
  recordRemoteSyncSnapshots,
  removeRemoteSyncSnapshot,
  updateSyncProviderState,
} from '../services/syncSnapshots'

const STORAGE_KEY = ATLAS_STORE_DEFINITIONS_BY_ID.sync.localStorageKey

function readSync(): AtlasSyncState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)

    if (!stored) {
      return emptySyncState()
    }

    return normalizeSyncState(JSON.parse(stored))
  } catch {
    return emptySyncState()
  }
}

export function useLocalSync() {
  const [sync, setSync] = useState<AtlasSyncState>(() => readSync())

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sync))
  }, [sync])

  function addSnapshot(snapshot: AtlasSyncSnapshot) {
    setSync((current) => addSyncSnapshot(current, snapshot))
  }

  function removeSnapshot(snapshotId: string) {
    setSync((current) => deleteSyncSnapshot(current, snapshotId))
  }

  function updateProvider(update: Partial<AtlasSyncProviderState>) {
    setSync((current) => updateSyncProviderState(current, update))
  }

  function recordRemoteSnapshots(snapshots: AtlasRemoteSyncSnapshot[]) {
    setSync((current) => recordRemoteSyncSnapshots(current, snapshots))
  }

  function recordRemotePush(snapshot: AtlasRemoteSyncSnapshot) {
    setSync((current) => recordRemoteSyncPush(current, snapshot))
  }

  function removeRemoteSnapshot(snapshotId: string) {
    setSync((current) => removeRemoteSyncSnapshot(current, snapshotId))
  }

  function resetSync() {
    const freshSync = emptySyncState()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(freshSync))
    setSync(freshSync)
  }

  return {
    sync,
    setSync,
    addSnapshot,
    removeSnapshot,
    updateProvider,
    recordRemoteSnapshots,
    recordRemotePush,
    removeRemoteSnapshot,
    resetSync,
  }
}
