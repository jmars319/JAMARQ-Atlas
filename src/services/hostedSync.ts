import type { AtlasRemoteSyncSnapshot, AtlasSyncSnapshot } from '../domain/sync'

export interface HostedSyncStatus {
  provider: 'supabase'
  configured: boolean
  workspaceId: string
  table: string
  message: string
}

export interface HostedSyncApiError {
  type: 'not-configured' | 'supabase-error' | 'invalid-request' | 'not-found' | 'unknown'
  message: string
}

export interface HostedSyncApiResponse<T> {
  ok: boolean
  configured: boolean
  data: T | null
  error: HostedSyncApiError | null
}

export interface HostedSyncPushResult {
  snapshot: AtlasRemoteSyncSnapshot
}

export interface HostedSyncSnapshotListResult {
  snapshots: AtlasRemoteSyncSnapshot[]
}

export interface HostedSyncSnapshotResult {
  snapshot: AtlasSyncSnapshot
}

export interface HostedSyncDeleteResult {
  snapshotId: string
}

async function fetchHostedSyncJson<T>(
  path: string,
  init?: RequestInit,
): Promise<HostedSyncApiResponse<T>> {
  const response = await fetch(path, init)

  if (!response.ok) {
    return {
      ok: false,
      configured: false,
      data: null,
      error: {
        type: 'unknown',
        message: `Atlas Sync API returned ${response.status}.`,
      },
    }
  }

  return (await response.json()) as HostedSyncApiResponse<T>
}

export function fetchHostedSyncStatus(signal?: AbortSignal) {
  return fetchHostedSyncJson<HostedSyncStatus>('/api/sync/status', { signal })
}

export function pushHostedSyncSnapshot(snapshot: AtlasSyncSnapshot) {
  return fetchHostedSyncJson<HostedSyncPushResult>('/api/sync/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ snapshot }),
  })
}

export function fetchHostedSyncSnapshots(signal?: AbortSignal) {
  return fetchHostedSyncJson<HostedSyncSnapshotListResult>('/api/sync/remote-snapshots', {
    signal,
  })
}

export function fetchHostedSyncSnapshot(snapshotId: string, signal?: AbortSignal) {
  return fetchHostedSyncJson<HostedSyncSnapshotResult>(
    `/api/sync/remote-snapshots/${encodeURIComponent(snapshotId)}`,
    { signal },
  )
}

export function deleteHostedSyncSnapshot(snapshotId: string) {
  return fetchHostedSyncJson<HostedSyncDeleteResult>(
    `/api/sync/remote-snapshots/${encodeURIComponent(snapshotId)}`,
    { method: 'DELETE' },
  )
}
