import { useEffect, useMemo, useState } from 'react'
import {
  ArchiveRestore,
  Bot,
  DatabaseZap,
  GitBranch,
  HardDrive,
  PlusCircle,
  RefreshCw,
  Rocket,
  Settings2,
  ShieldCheck,
  Trash2,
  UploadCloud,
} from 'lucide-react'
import type { Workspace } from '../domain/atlas'
import type { DispatchState } from '../domain/dispatch'
import type { AtlasConnectionCard, AtlasSettingsState } from '../domain/settings'
import type {
  AtlasRemoteSyncSnapshot,
  AtlasSyncCoreStores,
  AtlasSyncProviderState,
  AtlasSyncSnapshot,
  AtlasSyncState,
} from '../domain/sync'
import type { WritingWorkbenchState } from '../domain/writing'
import {
  fetchHostedSyncSnapshot,
  fetchHostedSyncSnapshots,
  fetchHostedSyncStatus,
  pushHostedSyncSnapshot,
  type HostedSyncStatus,
} from '../services/hostedSync'
import { buildStaticConnectionCards } from '../services/settings'
import {
  canApplySyncRestore,
  createSyncSnapshot,
  createSyncRestorePreview,
  SYNC_RESTORE_CONFIRMATION_PHRASE,
} from '../services/syncSnapshots'

interface GithubStatusResponse {
  configured: boolean
  configuredRepos: string[]
  authMode: string
}

interface SettingsCenterProps {
  settings: AtlasSettingsState
  workspace: Workspace
  dispatch: DispatchState
  writing: WritingWorkbenchState
  sync: AtlasSyncState
  onSettingsChange: (
    update: Partial<Pick<AtlasSettingsState, 'deviceLabel' | 'operatorLabel' | 'notes'>>,
  ) => void
  onCreateSnapshot: (label: string, note: string) => void
  onDeleteSnapshot: (snapshotId: string) => void
  onRestoreSnapshot: (stores: AtlasSyncCoreStores) => void
  onSyncProviderChange: (update: Partial<AtlasSyncProviderState>) => void
  onRecordRemoteSnapshots: (snapshots: AtlasRemoteSyncSnapshot[]) => void
  onRecordRemotePush: (snapshot: AtlasRemoteSyncSnapshot) => void
}

const connectionIcons = {
  github: GitBranch,
  dispatch: Rocket,
  writing: Bot,
  data: DatabaseZap,
  sync: HardDrive,
  supabase: UploadCloud,
}

function statusLabel(status: AtlasConnectionCard['status']) {
  const labels: Record<AtlasConnectionCard['status'], string> = {
    available: 'Available',
    missing: 'Missing',
    stub: 'Stubbed',
    'local-only': 'Local only',
    unknown: 'Unknown',
  }

  return labels[status]
}

function buildGithubCard(status: GithubStatusResponse | null, error: string | null) {
  if (error) {
    return {
      id: 'github',
      title: 'GitHub Local API',
      status: 'unknown',
      summary: 'GitHub status could not be read.',
      detail: error,
    } satisfies AtlasConnectionCard
  }

  if (!status?.configured) {
    return {
      id: 'github',
      title: 'GitHub Local API',
      status: 'missing',
      summary: 'No GitHub token is configured.',
      detail:
        'Atlas still runs normally. Set GITHUB_TOKEN or GH_TOKEN in local environment when live read-only GitHub panels are needed.',
    } satisfies AtlasConnectionCard
  }

  return {
    id: 'github',
    title: 'GitHub Local API',
    status: 'available',
    summary: 'Read-only GitHub boundary is configured.',
    detail: `${status.configuredRepos.length} configured repos through ${status.authMode}. Tokens remain server-side.`,
  } satisfies AtlasConnectionCard
}

function buildHostedSyncCard(
  status: HostedSyncStatus | null,
  error: string | null,
  provider: AtlasSyncProviderState,
) {
  if (error || provider.status === 'error') {
    return {
      id: 'supabase',
      title: 'Supabase Hosted Sync',
      status: 'unknown',
      summary: 'Hosted sync status could not be read.',
      detail: error || provider.message,
      updatedAt: provider.updatedAt,
    } satisfies AtlasConnectionCard
  }

  if (!status?.configured && provider.status !== 'configured') {
    return {
      id: 'supabase',
      title: 'Supabase Hosted Sync',
      status: 'missing',
      summary: 'Supabase hosted sync is not configured.',
      detail:
        'Atlas stays local-first. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ATLAS_SYNC_WORKSPACE_ID locally to enable manual remote snapshots.',
      updatedAt: provider.updatedAt,
    } satisfies AtlasConnectionCard
  }

  return {
    id: 'supabase',
    title: 'Supabase Hosted Sync',
    status: 'available',
    summary: 'Manual Supabase snapshot push and pull are configured.',
    detail: `Workspace ${status?.workspaceId || provider.workspaceId || 'configured'} is available. No background sync or merge is enabled.`,
    updatedAt: provider.updatedAt,
  } satisfies AtlasConnectionCard
}

function ConnectionCard({ card }: { card: AtlasConnectionCard }) {
  const Icon = connectionIcons[card.id as keyof typeof connectionIcons] ?? ShieldCheck

  return (
    <article className="settings-connection-card">
      <div className="settings-card-icon">
        <Icon size={18} />
      </div>
      <div>
        <div className="settings-card-heading">
          <h3>{card.title}</h3>
          <span className={`resource-pill settings-status-${card.status}`}>
            {statusLabel(card.status)}
          </span>
        </div>
        <p>{card.summary}</p>
        <span>{card.detail}</span>
      </div>
    </article>
  )
}

function SnapshotSummary({
  title,
  projects,
  targets,
  drafts,
}: {
  title: string
  projects: number
  targets: number
  drafts: number
}) {
  return (
    <div className="settings-snapshot-summary">
      <strong>{title}</strong>
      <span>{projects} projects</span>
      <span>{targets} Dispatch targets</span>
      <span>{drafts} Writing drafts</span>
    </div>
  )
}

async function requestGithubStatus(signal?: AbortSignal) {
  const response = await fetch('/api/github/status', { signal })

  if (!response.ok) {
    throw new Error(`GitHub status returned ${response.status}.`)
  }

  return (await response.json()) as GithubStatusResponse
}

export function SettingsCenter({
  settings,
  workspace,
  dispatch,
  writing,
  sync,
  onSettingsChange,
  onCreateSnapshot,
  onDeleteSnapshot,
  onRestoreSnapshot,
  onSyncProviderChange,
  onRecordRemoteSnapshots,
  onRecordRemotePush,
}: SettingsCenterProps) {
  const [githubStatus, setGithubStatus] = useState<GithubStatusResponse | null>(null)
  const [githubError, setGithubError] = useState<string | null>(null)
  const [loadingGithub, setLoadingGithub] = useState(false)
  const [hostedSyncStatus, setHostedSyncStatus] = useState<HostedSyncStatus | null>(null)
  const [hostedSyncError, setHostedSyncError] = useState<string | null>(null)
  const [loadingHostedSync, setLoadingHostedSync] = useState(false)
  const [snapshotLabel, setSnapshotLabel] = useState('')
  const [snapshotNote, setSnapshotNote] = useState('')
  const [selectedSnapshotId, setSelectedSnapshotId] = useState('')
  const [snapshotConfirmation, setSnapshotConfirmation] = useState('')
  const [remoteSnapshotLabel, setRemoteSnapshotLabel] = useState('')
  const [remoteSnapshotNote, setRemoteSnapshotNote] = useState('')
  const [selectedRemoteSnapshotId, setSelectedRemoteSnapshotId] = useState('')
  const [remoteSnapshotConfirmation, setRemoteSnapshotConfirmation] = useState('')
  const [remoteSnapshot, setRemoteSnapshot] = useState<AtlasSyncSnapshot | null>(null)
  const [pendingDeleteId, setPendingDeleteId] = useState('')
  const [syncMessage, setSyncMessage] = useState('')

  async function loadGithubStatus() {
    setLoadingGithub(true)
    setGithubError(null)

    try {
      setGithubStatus(await requestGithubStatus())
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : 'GitHub status request failed.')
      setGithubStatus(null)
    } finally {
      setLoadingGithub(false)
    }
  }

  async function loadHostedSyncStatus() {
    setLoadingHostedSync(true)
    setHostedSyncError(null)

    try {
      const result = await fetchHostedSyncStatus()

      if (result.ok && result.data) {
        setHostedSyncStatus(result.data)
        onSyncProviderChange({
          id: 'supabase',
          status: result.data.configured ? 'configured' : 'not-configured',
          workspaceId: result.data.workspaceId,
          message: result.data.message,
        })
      } else {
        const message = result.error?.message || 'Hosted sync status request failed.'
        setHostedSyncStatus(null)
        setHostedSyncError(message)
        onSyncProviderChange({
          id: 'supabase',
          status: result.error?.type === 'not-configured' ? 'not-configured' : 'error',
          message,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Hosted sync status request failed.'
      setHostedSyncError(message)
      setHostedSyncStatus(null)
      onSyncProviderChange({ id: 'supabase', status: 'error', message })
    } finally {
      setLoadingHostedSync(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()

    void requestGithubStatus(controller.signal)
      .then((status) => {
        setGithubStatus(status)
        setGithubError(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setGithubError(error instanceof Error ? error.message : 'GitHub status request failed.')
        setGithubStatus(null)
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void fetchHostedSyncStatus(controller.signal)
      .then((result) => {
        if (result.ok && result.data) {
          setHostedSyncStatus(result.data)
          setHostedSyncError(null)
          return
        }

        setHostedSyncStatus(null)
        setHostedSyncError(result.error?.message || 'Hosted sync status request failed.')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setHostedSyncError(
          error instanceof Error ? error.message : 'Hosted sync status request failed.',
        )
        setHostedSyncStatus(null)
      })

    return () => controller.abort()
  }, [])

  const connectionCards = useMemo(
    () => [
      buildGithubCard(githubStatus, githubError),
      ...buildStaticConnectionCards(),
      buildHostedSyncCard(hostedSyncStatus, hostedSyncError, sync.provider),
    ],
    [githubError, githubStatus, hostedSyncError, hostedSyncStatus, sync.provider],
  )
  const currentStores = useMemo(
    () => ({ workspace, dispatch, writing }),
    [dispatch, workspace, writing],
  )
  const selectedSnapshot =
    sync.snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? sync.snapshots[0]
  const restorePreview = selectedSnapshot
    ? createSyncRestorePreview(currentStores, selectedSnapshot)
    : null
  const restoreReady = restorePreview !== null && canApplySyncRestore(snapshotConfirmation)
  const remoteRestorePreview = remoteSnapshot
    ? createSyncRestorePreview(currentStores, remoteSnapshot)
    : null
  const remoteRestoreReady =
    remoteRestorePreview !== null && canApplySyncRestore(remoteSnapshotConfirmation)

  function handleCreateSnapshot() {
    onCreateSnapshot(snapshotLabel, snapshotNote)
    setSnapshotLabel('')
    setSnapshotNote('')
    setSyncMessage('Local snapshot created.')
  }

  function handleRestoreSnapshot() {
    if (!restoreReady || !restorePreview) {
      return
    }

    onRestoreSnapshot(restorePreview.normalizedStores)
    setSnapshotConfirmation('')
    setSyncMessage('Snapshot restored locally. Workspace, Dispatch, and Writing stores were replaced.')
  }

  function handleDeleteSnapshot(snapshotId: string) {
    onDeleteSnapshot(snapshotId)
    setPendingDeleteId('')
    setSelectedSnapshotId((current) => (current === snapshotId ? '' : current))
    setSyncMessage('Local snapshot deleted.')
  }

  async function handlePushHostedSnapshot() {
    setLoadingHostedSync(true)
    setHostedSyncError(null)

    try {
      const snapshot = createSyncSnapshot({
        stores: currentStores,
        settings,
        sync,
        label: remoteSnapshotLabel || 'Hosted sync snapshot',
        note: remoteSnapshotNote,
      })
      const result = await pushHostedSyncSnapshot(snapshot)

      if (result.ok && result.data) {
        onRecordRemotePush(result.data.snapshot)
        setRemoteSnapshot(snapshot)
        setSelectedRemoteSnapshotId(snapshot.id)
        setRemoteSnapshotLabel('')
        setRemoteSnapshotNote('')
        setRemoteSnapshotConfirmation('')
        setSyncMessage('Remote snapshot pushed to Supabase.')
        onSyncProviderChange({
          id: 'supabase',
          status: 'configured',
          message: 'Remote snapshot pushed to Supabase.',
        })
        return
      }

      const message = result.error?.message || 'Remote snapshot push failed.'
      setHostedSyncError(message)
      setSyncMessage(message)
      onSyncProviderChange({
        id: 'supabase',
        status: result.error?.type === 'not-configured' ? 'not-configured' : 'error',
        message,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Remote snapshot push failed.'
      setHostedSyncError(message)
      setSyncMessage(message)
      onSyncProviderChange({ id: 'supabase', status: 'error', message })
    } finally {
      setLoadingHostedSync(false)
    }
  }

  async function handleLoadRemoteSnapshots() {
    setLoadingHostedSync(true)
    setHostedSyncError(null)

    try {
      const result = await fetchHostedSyncSnapshots()

      if (result.ok && result.data) {
        onRecordRemoteSnapshots(result.data.snapshots)
        setSyncMessage(`${result.data.snapshots.length} remote snapshots loaded.`)
        onSyncProviderChange({
          id: 'supabase',
          status: 'configured',
          message: `${result.data.snapshots.length} remote snapshots loaded.`,
        })
        return
      }

      const message = result.error?.message || 'Remote snapshot list failed.'
      setHostedSyncError(message)
      setSyncMessage(message)
      onSyncProviderChange({
        id: 'supabase',
        status: result.error?.type === 'not-configured' ? 'not-configured' : 'error',
        message,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Remote snapshot list failed.'
      setHostedSyncError(message)
      setSyncMessage(message)
      onSyncProviderChange({ id: 'supabase', status: 'error', message })
    } finally {
      setLoadingHostedSync(false)
    }
  }

  async function handleSelectRemoteSnapshot(snapshotId: string) {
    setSelectedRemoteSnapshotId(snapshotId)
    setRemoteSnapshot(null)
    setRemoteSnapshotConfirmation('')
    setLoadingHostedSync(true)
    setHostedSyncError(null)

    try {
      const result = await fetchHostedSyncSnapshot(snapshotId)

      if (result.ok && result.data) {
        setRemoteSnapshot(result.data.snapshot)
        setSyncMessage('Remote snapshot preview loaded.')
        onSyncProviderChange({
          id: 'supabase',
          status: 'configured',
          message: 'Remote snapshot preview loaded.',
        })
        return
      }

      const message = result.error?.message || 'Remote snapshot preview failed.'
      setHostedSyncError(message)
      setSyncMessage(message)
      onSyncProviderChange({
        id: 'supabase',
        status: result.error?.type === 'not-configured' ? 'not-configured' : 'error',
        message,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Remote snapshot preview failed.'
      setHostedSyncError(message)
      setSyncMessage(message)
      onSyncProviderChange({ id: 'supabase', status: 'error', message })
    } finally {
      setLoadingHostedSync(false)
    }
  }

  function handleRestoreRemoteSnapshot() {
    if (!remoteRestoreReady || !remoteRestorePreview) {
      return
    }

    onRestoreSnapshot(remoteRestorePreview.normalizedStores)
    setRemoteSnapshotConfirmation('')
    setSyncMessage('Remote snapshot restored locally after preview confirmation.')
  }

  async function handleRefreshConnectionStatuses() {
    await Promise.all([loadGithubStatus(), loadHostedSyncStatus()])
  }

  return (
    <section className="settings-center" aria-labelledby="settings-title">
      <div className="dashboard-header">
        <div>
          <p className="section-label">Atlas Settings</p>
          <h1 id="settings-title">Settings & Connections</h1>
          <p>
            Configure local Atlas labels and review integration readiness without storing secrets
            in browser state.
          </p>
        </div>
        <div className="dashboard-stats" aria-label="Settings status counts">
          <div>
            <Settings2 size={16} />
            <strong>{settings.schemaVersion}</strong>
            <span>Schema</span>
          </div>
          <div>
            <ShieldCheck size={16} />
            <strong>{connectionCards.filter((card) => card.status === 'available').length}</strong>
            <span>Available</span>
          </div>
          <div>
            <HardDrive size={16} />
            <strong>Local</strong>
            <span>Mode</span>
          </div>
        </div>
      </div>

      <div className="settings-layout">
        <section className="settings-panel">
          <div className="panel-heading">
            <Settings2 size={17} />
            <h2>Local Workspace Identity</h2>
          </div>
          <div className="settings-form-grid">
            <label className="field">
              <span>Device label</span>
              <input
                value={settings.deviceLabel}
                onChange={(event) => onSettingsChange({ deviceLabel: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Operator label</span>
              <input
                value={settings.operatorLabel}
                placeholder="Optional"
                onChange={(event) => onSettingsChange({ operatorLabel: event.target.value })}
              />
            </label>
            <label className="field field-full">
              <span>Local-only configuration notes</span>
              <textarea
                value={settings.notes}
                placeholder="Notes about this local Atlas install. Do not place secrets here."
                rows={4}
                onChange={(event) => onSettingsChange({ notes: event.target.value })}
              />
            </label>
          </div>
          <div className="settings-meta">
            <span>Device ID: {settings.deviceId}</span>
            <span>Updated: {new Date(settings.updatedAt).toLocaleString()}</span>
          </div>
        </section>

        <section className="settings-panel">
          <div className="panel-heading settings-panel-heading-row">
            <div>
              <ShieldCheck size={17} />
              <h2>Connection Readiness</h2>
            </div>
            <button
              type="button"
              onClick={() => void handleRefreshConnectionStatuses()}
              disabled={loadingGithub || loadingHostedSync}
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
          <div className="settings-connection-grid">
            {connectionCards.map((card) => (
              <ConnectionCard key={card.id} card={card} />
            ))}
          </div>
        </section>

        <section className="settings-panel">
          <div className="panel-heading">
            <HardDrive size={17} />
            <h2>Sync Snapshots</h2>
          </div>
          <div className="settings-form-grid">
            <label className="field">
              <span>Snapshot label</span>
              <input
                value={snapshotLabel}
                placeholder="Manual snapshot"
                onChange={(event) => setSnapshotLabel(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Snapshot note</span>
              <input
                value={snapshotNote}
                placeholder="Optional reason or context"
                onChange={(event) => setSnapshotNote(event.target.value)}
              />
            </label>
          </div>
          <div className="data-actions">
            <button type="button" onClick={handleCreateSnapshot}>
              <PlusCircle size={15} />
              Create local snapshot
            </button>
          </div>

          {sync.snapshots.length > 0 ? (
            <div className="settings-sync-grid">
              <div className="settings-snapshot-list" aria-label="Sync snapshot inventory">
                {sync.snapshots.map((snapshot) => (
                  <article
                    key={snapshot.id}
                    className={
                      selectedSnapshot?.id === snapshot.id
                        ? 'settings-snapshot-card is-selected'
                        : 'settings-snapshot-card'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSnapshotId(snapshot.id)
                        setSnapshotConfirmation('')
                      }}
                    >
                      <strong>{snapshot.label}</strong>
                      <span>{new Date(snapshot.createdAt).toLocaleString()}</span>
                      <span>{snapshot.fingerprint}</span>
                    </button>
                    {pendingDeleteId === snapshot.id ? (
                      <button
                        type="button"
                        className="danger-action"
                        onClick={() => handleDeleteSnapshot(snapshot.id)}
                      >
                        <Trash2 size={15} />
                        Confirm delete
                      </button>
                    ) : (
                      <button type="button" onClick={() => setPendingDeleteId(snapshot.id)}>
                        <Trash2 size={15} />
                        Delete
                      </button>
                    )}
                  </article>
                ))}
              </div>

              {restorePreview ? (
                <div className="settings-restore-preview" aria-label="Sync restore preview">
                  <div className="settings-preview-grid">
                    <SnapshotSummary
                      title="Current local data"
                      projects={restorePreview.currentSummary.workspace.projects}
                      targets={restorePreview.currentSummary.dispatch.targets}
                      drafts={restorePreview.currentSummary.writing.drafts}
                    />
                    <SnapshotSummary
                      title="Selected snapshot"
                      projects={restorePreview.incomingSummary.workspace.projects}
                      targets={restorePreview.incomingSummary.dispatch.targets}
                      drafts={restorePreview.incomingSummary.writing.drafts}
                    />
                  </div>
                  {restorePreview.warnings.length > 0 ? (
                    <div className="data-warning">
                      <strong>Snapshot warnings</strong>
                      <ul>
                        {restorePreview.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <label className="field field-full">
                    <span>Type {SYNC_RESTORE_CONFIRMATION_PHRASE} to restore snapshot</span>
                    <input
                      value={snapshotConfirmation}
                      onChange={(event) => setSnapshotConfirmation(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="danger-action"
                    disabled={!restoreReady}
                    onClick={handleRestoreSnapshot}
                  >
                    <ArchiveRestore size={15} />
                    Restore snapshot
                  </button>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="empty-state">
              No local sync snapshots yet. Create a manual snapshot before testing future hosted
              persistence.
            </p>
          )}
          {syncMessage ? <p className="data-action-message">{syncMessage}</p> : null}
        </section>

        <section className="settings-panel">
          <div className="panel-heading settings-panel-heading-row">
            <div>
              <UploadCloud size={17} />
              <h2>Hosted Sync Bridge</h2>
            </div>
            <button
              type="button"
              onClick={() => void loadHostedSyncStatus()}
              disabled={loadingHostedSync}
            >
              <RefreshCw size={15} />
              Refresh hosted status
            </button>
          </div>
          <p className="empty-state">
            Supabase sync is a manual snapshot log. It does not run in the background, merge
            changes, or store credentials in browser state.
          </p>
          <div className="settings-meta">
            <span>Status: {statusLabel(buildHostedSyncCard(hostedSyncStatus, hostedSyncError, sync.provider).status)}</span>
            <span>Workspace: {hostedSyncStatus?.workspaceId || sync.provider.workspaceId || 'Not configured'}</span>
            <span>Last push: {sync.provider.lastPushAt ? new Date(sync.provider.lastPushAt).toLocaleString() : 'Never'}</span>
            <span>Last pull: {sync.provider.lastPullAt ? new Date(sync.provider.lastPullAt).toLocaleString() : 'Never'}</span>
          </div>
          <div className="settings-form-grid">
            <label className="field">
              <span>Remote snapshot label</span>
              <input
                value={remoteSnapshotLabel}
                placeholder="Hosted checkpoint"
                onChange={(event) => setRemoteSnapshotLabel(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Remote snapshot note</span>
              <input
                value={remoteSnapshotNote}
                placeholder="Optional reason or context"
                onChange={(event) => setRemoteSnapshotNote(event.target.value)}
              />
            </label>
          </div>
          <div className="data-actions">
            <button
              type="button"
              onClick={() => void handlePushHostedSnapshot()}
              disabled={loadingHostedSync}
            >
              <UploadCloud size={15} />
              Push current state
            </button>
            <button
              type="button"
              onClick={() => void handleLoadRemoteSnapshots()}
              disabled={loadingHostedSync}
            >
              <RefreshCw size={15} />
              Load remote snapshots
            </button>
          </div>

          {sync.provider.remoteSnapshots.length > 0 ? (
            <div className="settings-sync-grid">
              <div className="settings-snapshot-list" aria-label="Remote sync snapshot inventory">
                {sync.provider.remoteSnapshots.map((snapshot) => (
                  <article
                    key={snapshot.id}
                    className={
                      selectedRemoteSnapshotId === snapshot.id
                        ? 'settings-snapshot-card is-selected'
                        : 'settings-snapshot-card'
                    }
                  >
                    <button
                      type="button"
                      onClick={() => void handleSelectRemoteSnapshot(snapshot.id)}
                    >
                      <strong>{snapshot.label}</strong>
                      <span>{new Date(snapshot.createdAt).toLocaleString()}</span>
                      <span>{snapshot.deviceLabel}</span>
                      <span>{snapshot.fingerprint}</span>
                    </button>
                  </article>
                ))}
              </div>

              {remoteRestorePreview ? (
                <div className="settings-restore-preview" aria-label="Remote sync restore preview">
                  <div className="settings-preview-grid">
                    <SnapshotSummary
                      title="Current local data"
                      projects={remoteRestorePreview.currentSummary.workspace.projects}
                      targets={remoteRestorePreview.currentSummary.dispatch.targets}
                      drafts={remoteRestorePreview.currentSummary.writing.drafts}
                    />
                    <SnapshotSummary
                      title="Remote snapshot"
                      projects={remoteRestorePreview.incomingSummary.workspace.projects}
                      targets={remoteRestorePreview.incomingSummary.dispatch.targets}
                      drafts={remoteRestorePreview.incomingSummary.writing.drafts}
                    />
                  </div>
                  {remoteRestorePreview.warnings.length > 0 ? (
                    <div className="data-warning">
                      <strong>Remote restore warnings</strong>
                      <ul>
                        {remoteRestorePreview.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <label className="field field-full">
                    <span>Type {SYNC_RESTORE_CONFIRMATION_PHRASE} to restore remote snapshot</span>
                    <input
                      value={remoteSnapshotConfirmation}
                      onChange={(event) => setRemoteSnapshotConfirmation(event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="danger-action"
                    disabled={!remoteRestoreReady}
                    onClick={handleRestoreRemoteSnapshot}
                  >
                    <ArchiveRestore size={15} />
                    Restore remote snapshot
                  </button>
                </div>
              ) : (
                <p className="empty-state">
                  Select a remote snapshot to load a restore preview before replacing local stores.
                </p>
              )}
            </div>
          ) : (
            <p className="empty-state">
              No remote snapshots loaded. Load snapshots after Supabase sync is configured, or push
              the current local state as the first remote checkpoint.
            </p>
          )}
        </section>

        <section className="settings-panel settings-guardrails">
          <div className="panel-heading">
            <ShieldCheck size={17} />
            <h2>Settings Rules</h2>
          </div>
          <ul className="dispatch-list">
            <li>Settings store only local labels, notes, and connection-readiness metadata.</li>
            <li>GitHub tokens, AI keys, deployment credentials, and env vars stay out of browser state.</li>
            <li>Connection cards are status surfaces, not automation triggers.</li>
            <li>Hosted sync uses manual snapshot push/pull only; no background sync or merge runs.</li>
            <li>Real AI providers remain disabled until explicit future phases.</li>
          </ul>
        </section>
      </div>
    </section>
  )
}
