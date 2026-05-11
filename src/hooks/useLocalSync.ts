import { useEffect, useState } from 'react'
import type { AtlasSyncSnapshot, AtlasSyncState } from '../domain/sync'
import {
  addSyncSnapshot,
  deleteSyncSnapshot,
  emptySyncState,
  normalizeSyncState,
} from '../services/syncSnapshots'

const STORAGE_KEY = 'jamarq-atlas.sync.v1'

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
    resetSync,
  }
}
