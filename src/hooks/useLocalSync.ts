import type { AtlasRemoteSyncSnapshot, AtlasSyncProviderState, AtlasSyncSnapshot, AtlasSyncState } from '../domain/sync'
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
import { useLocalStoreState } from './useLocalStore'

export function useLocalSync() {
  const {
    state: sync,
    setState: setSync,
    resetState: resetSync,
  } = useLocalStoreState<AtlasSyncState>({
    storeId: 'sync',
    fallback: emptySyncState,
    normalize: normalizeSyncState,
  })

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
