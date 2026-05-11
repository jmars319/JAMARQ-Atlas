import type { IncomingMessage, ServerResponse } from 'node:http'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AtlasRemoteSyncSnapshot,
  AtlasSyncApiError,
  AtlasSyncSnapshot,
  AtlasSyncStoreSummary,
} from '../src/domain/sync'

const SYNC_TABLE = 'atlas_sync_snapshots'

type EnvRecord = Record<string, string | undefined>
type SyncApiResponse<T> = {
  ok: boolean
  configured: boolean
  data: T | null
  error: AtlasSyncApiError | null
}

interface SyncConfig {
  configured: boolean
  supabaseUrl: string
  serviceRoleKey: string
  workspaceId: string
  table: string
}

interface RemoteSnapshotRow {
  workspace_id: string
  snapshot_id: string
  device_id: string
  device_label: string
  label: string
  note: string
  fingerprint: string
  summary: AtlasSyncStoreSummary
  stores: AtlasSyncSnapshot['stores']
  created_at: string
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body, null, 2))
}

function syncResponse<T>({
  configured,
  data,
  error,
}: {
  configured: boolean
  data: T | null
  error: AtlasSyncApiError | null
}): SyncApiResponse<T> {
  return {
    ok: !error,
    configured,
    data,
    error,
  }
}

export function getSyncConfig(env: EnvRecord = process.env): SyncConfig {
  const supabaseUrl = env.SUPABASE_URL ?? ''
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const workspaceId = env.ATLAS_SYNC_WORKSPACE_ID || 'local-atlas'

  return {
    configured: Boolean(supabaseUrl && serviceRoleKey && workspaceId),
    supabaseUrl,
    serviceRoleKey,
    workspaceId,
    table: SYNC_TABLE,
  }
}

export function createSyncStatus(config: SyncConfig) {
  return syncResponse({
    configured: config.configured,
    data: {
      provider: 'supabase' as const,
      configured: config.configured,
      workspaceId: config.workspaceId,
      table: config.table,
      message: config.configured
        ? 'Supabase hosted sync is configured for manual snapshots.'
        : 'Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ATLAS_SYNC_WORKSPACE_ID to enable hosted sync.',
    },
    error: null,
  })
}

export function createSyncNotConfiguredResponse(config: SyncConfig) {
  return syncResponse<never>({
    configured: false,
    data: null,
    error: {
      type: 'not-configured',
      message: `Supabase sync is not configured for workspace ${config.workspaceId}.`,
    },
  })
}

function supabaseClient(config: SyncConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readSnapshot(value: unknown): AtlasSyncSnapshot | null {
  const snapshot = isRecord(value) && isRecord(value.snapshot) ? value.snapshot : value

  if (!isRecord(snapshot) || !readString(snapshot.id) || !isRecord(snapshot.stores)) {
    return null
  }

  return snapshot as unknown as AtlasSyncSnapshot
}

export function snapshotToRemoteRow(
  snapshot: AtlasSyncSnapshot,
  workspaceId: string,
): RemoteSnapshotRow {
  return {
    workspace_id: workspaceId,
    snapshot_id: snapshot.id,
    device_id: snapshot.deviceId,
    device_label: snapshot.deviceLabel,
    label: snapshot.label,
    note: snapshot.note,
    fingerprint: snapshot.fingerprint,
    summary: snapshot.summary,
    stores: snapshot.stores,
    created_at: snapshot.createdAt,
  }
}

export function remoteRowToMetadata(row: Partial<RemoteSnapshotRow>): AtlasRemoteSyncSnapshot {
  return {
    id: readString(row.snapshot_id),
    label: readString(row.label) || 'Remote snapshot',
    note: readString(row.note),
    createdAt: readString(row.created_at),
    deviceId: readString(row.device_id) || 'unknown-device',
    deviceLabel: readString(row.device_label) || 'Unknown device',
    fingerprint: readString(row.fingerprint),
    summary: row.summary as AtlasSyncStoreSummary,
  }
}

export function remoteRowToSnapshot(row: RemoteSnapshotRow): AtlasSyncSnapshot {
  return {
    ...remoteRowToMetadata(row),
    stores: row.stores,
  }
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const body = Buffer.concat(chunks).toString('utf8')
  return body ? JSON.parse(body) : null
}

async function pushSnapshot(request: IncomingMessage, config: SyncConfig) {
  if (!config.configured) {
    return createSyncNotConfiguredResponse(config)
  }

  const snapshot = readSnapshot(await readBody(request))

  if (!snapshot) {
    return syncResponse({
      configured: true,
      data: null,
      error: {
        type: 'invalid-request',
        message: 'Sync push requires a snapshot payload.',
      },
    })
  }

  const { data, error } = await supabaseClient(config)
    .from(SYNC_TABLE)
    .upsert(snapshotToRemoteRow(snapshot, config.workspaceId), {
      onConflict: 'workspace_id,snapshot_id',
    })
    .select()
    .single<RemoteSnapshotRow>()

  if (error || !data) {
    return syncResponse({
      configured: true,
      data: null,
      error: {
        type: 'supabase-error',
        message: error?.message ?? 'Supabase did not return the pushed snapshot.',
      },
    })
  }

  return syncResponse({
    configured: true,
    data: {
      snapshot: remoteRowToMetadata(data),
    },
    error: null,
  })
}

async function listSnapshots(config: SyncConfig) {
  if (!config.configured) {
    return createSyncNotConfiguredResponse(config)
  }

  const { data, error } = await supabaseClient(config)
    .from(SYNC_TABLE)
    .select('snapshot_id,device_id,device_label,label,note,fingerprint,summary,created_at')
    .eq('workspace_id', config.workspaceId)
    .order('created_at', { ascending: false })
    .limit(50)
    .returns<RemoteSnapshotRow[]>()

  if (error) {
    return syncResponse({
      configured: true,
      data: null,
      error: {
        type: 'supabase-error',
        message: error.message,
      },
    })
  }

  return syncResponse({
    configured: true,
    data: {
      snapshots: (data ?? []).map((row) => remoteRowToMetadata(row)),
    },
    error: null,
  })
}

async function getSnapshot(snapshotId: string, config: SyncConfig) {
  if (!config.configured) {
    return createSyncNotConfiguredResponse(config)
  }

  const { data, error } = await supabaseClient(config)
    .from(SYNC_TABLE)
    .select('*')
    .eq('workspace_id', config.workspaceId)
    .eq('snapshot_id', snapshotId)
    .single<RemoteSnapshotRow>()

  if (error || !data) {
    return syncResponse({
      configured: true,
      data: null,
      error: {
        type: error?.code === 'PGRST116' ? 'not-found' : 'supabase-error',
        message: error?.message ?? 'Remote snapshot was not found.',
      },
    })
  }

  return syncResponse({
    configured: true,
    data: {
      snapshot: remoteRowToSnapshot(data),
    },
    error: null,
  })
}

export async function syncApiMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next?: () => void,
) {
  if (!request.url?.startsWith('/api/sync')) {
    next?.()
    return
  }

  try {
    const url = new URL(request.url, 'http://localhost')
    const config = getSyncConfig()

    if (url.pathname === '/api/sync/status') {
      json(response, 200, createSyncStatus(config))
      return
    }

    if (url.pathname === '/api/sync/push' && request.method === 'POST') {
      json(response, 200, await pushSnapshot(request, config))
      return
    }

    if (url.pathname === '/api/sync/remote-snapshots') {
      json(response, 200, await listSnapshots(config))
      return
    }

    const snapshotMatch = url.pathname.match(/^\/api\/sync\/remote-snapshots\/([^/]+)$/)

    if (snapshotMatch) {
      json(response, 200, await getSnapshot(decodeURIComponent(snapshotMatch[1]), config))
      return
    }

    json(
      response,
      404,
      syncResponse({
        configured: config.configured,
        data: null,
        error: {
          type: 'not-found',
          message: 'Unknown Atlas Sync API route.',
        },
      }),
    )
  } catch (error) {
    json(
      response,
      200,
      syncResponse({
        configured: false,
        data: null,
        error: {
          type: 'unknown',
          message: error instanceof Error ? error.message : 'Atlas Sync API failed.',
        },
      }),
    )
  }
}
