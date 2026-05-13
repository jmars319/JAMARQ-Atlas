import type { AtlasRemoteSyncSnapshot, AtlasSyncSnapshot } from '../domain/sync'
import { requestJsonResponse, redactRequestMessage } from './requestClient'

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

export function normalizeHostedSyncError(
  value: unknown,
  fallbackMessage: string,
): HostedSyncApiError {
  if (typeof value === 'object' && value !== null) {
    const candidate = value as Partial<HostedSyncApiError>
    const type =
      candidate.type === 'not-configured' ||
      candidate.type === 'supabase-error' ||
      candidate.type === 'invalid-request' ||
      candidate.type === 'not-found' ||
      candidate.type === 'unknown'
        ? candidate.type
        : 'unknown'

    return {
      type,
      message: typeof candidate.message === 'string' ? candidate.message : fallbackMessage,
    }
  }

  return {
    type: 'unknown',
    message: fallbackMessage,
  }
}

async function fetchHostedSyncJson<T>(
  path: string,
  init?: RequestInit,
): Promise<HostedSyncApiResponse<T>> {
  try {
    const { response, body } = await requestJsonResponse<HostedSyncApiResponse<T>>(path, init ?? {}, {
      retries: init?.method && init.method !== 'GET' ? 0 : 1,
      retrySafe: !init?.method || init.method === 'GET',
      timeoutMs: 15_000,
    })

    if (!response.ok) {
      return {
        ok: false,
        configured: body?.configured ?? false,
        data: null,
        error: normalizeHostedSyncError(
          body?.error,
          `Atlas Sync API returned ${response.status}.`,
        ),
      }
    }

    if (body) {
      return {
        ...body,
        error: body.error
          ? normalizeHostedSyncError(body.error, 'Atlas Sync API returned an error.')
          : null,
      }
    }

    return {
      ok: false,
      configured: false,
      data: null,
      error: {
        type: 'unknown',
        message: 'Atlas Sync API returned an unreadable response.',
      },
    }
  } catch (error) {
    return {
      ok: false,
      configured: false,
      data: null,
      error: {
        type: 'unknown',
        message: redactRequestMessage(
          error instanceof Error ? error.message : 'Atlas Sync API request failed.',
        ),
      },
    }
  }
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
