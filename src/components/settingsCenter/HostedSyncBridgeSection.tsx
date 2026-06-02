import { useSettingsCenterContext } from './useSettingsCenterContext'
import { UploadCloud, RefreshCw, Trash2, ArchiveRestore } from 'lucide-react'
import { SnapshotSummary } from '../SettingsCenterParts'
import { statusLabel, buildHostedSyncCard } from '../SettingsCenterParts.helpers'
import { SYNC_RESTORE_CONFIRMATION_PHRASE } from '../../services/syncSnapshots'

export function HostedSyncBridgeSection() {
  const {
    handleDeleteRemoteSnapshot,
    handleLoadRemoteSnapshots,
    handlePushHostedSnapshot,
    handleRestoreRemoteSnapshot,
    handleSelectRemoteSnapshot,
    hostedSyncError,
    hostedSyncStatus,
    loadHostedSyncStatus,
    loadingHostedSync,
    pendingRemoteDeleteId,
    remoteRestorePreview,
    remoteRestoreReady,
    remoteRetentionNotice,
    remoteSnapshotComparison,
    remoteSnapshotConfirmation,
    remoteSnapshotLabel,
    remoteSnapshotLimit,
    remoteSnapshotNote,
    selectedRemoteSnapshotId,
    setPendingRemoteDeleteId,
    setRemoteSnapshotConfirmation,
    setRemoteSnapshotLabel,
    setRemoteSnapshotLimit,
    setRemoteSnapshotNote,
    sync,
  } = useSettingsCenterContext()

  return (
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
            <span>Remote retention view</span>
            <select
              aria-label="Remote retention view"
              value={remoteSnapshotLimit}
              onChange={(event) => setRemoteSnapshotLimit(Number(event.target.value))}
            >
              <option value={50}>Show latest 50</option>
            </select>
          </label>
          <div className="settings-snapshot-summary">
            <strong>Remote inventory</strong>
            <span>{remoteRetentionNotice.message}</span>
            <span>{remoteRetentionNotice.shown} snapshots loaded locally</span>
          </div>
        </div>
        {remoteRetentionNotice.warning ? (
          <div className="data-warning">
            <strong>Remote retention warning</strong>
            <ul>
              <li>{remoteRetentionNotice.warning}</li>
            </ul>
          </div>
        ) : null}
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
                  {pendingRemoteDeleteId === snapshot.id ? (
                    <button
                      type="button"
                      className="danger-action"
                      onClick={() => void handleDeleteRemoteSnapshot(snapshot.id)}
                    >
                      <Trash2 size={15} />
                      Confirm remote delete
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPendingRemoteDeleteId(snapshot.id)}
                    >
                      <Trash2 size={15} />
                      Delete remote snapshot
                    </button>
                  )}
                </article>
              ))}
            </div>

            {remoteRestorePreview ? (
              <div className="settings-restore-preview" aria-label="Remote sync restore preview">
                {remoteSnapshotComparison ? (
                  <div
                    className="settings-compare-grid"
                    aria-label="Remote/local snapshot comparison"
                  >
                    <div className="settings-snapshot-summary">
                      <strong>Fingerprint</strong>
                      <span>
                        {remoteSnapshotComparison.fingerprintMatches
                          ? 'Fingerprints match'
                          : 'Fingerprints differ'}
                      </span>
                      <span>Local: {remoteSnapshotComparison.localFingerprint}</span>
                      <span>Remote: {remoteSnapshotComparison.remoteFingerprint}</span>
                    </div>
                    <div className="settings-snapshot-summary">
                      <strong>Remote source</strong>
                      <span>{remoteSnapshotComparison.deviceLabel}</span>
                      <span>{new Date(remoteSnapshotComparison.createdAt).toLocaleString()}</span>
                    </div>
                    <div className="settings-snapshot-summary">
                      <strong>Count comparison</strong>
                      {remoteSnapshotComparison.summaryLines.map((line) => (
                        <span key={line}>{line}</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                {remoteSnapshotComparison?.countDrops.length ? (
                  <div className="data-warning">
                    <strong>Remote/local count drops</strong>
                    <ul>
                      {remoteSnapshotComparison.countDrops.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="settings-preview-grid">
                  <SnapshotSummary
                    title="Current local data"
                    projects={remoteRestorePreview.currentSummary.workspace.projects}
                    targets={remoteRestorePreview.currentSummary.dispatch.targets}
                    drafts={remoteRestorePreview.currentSummary.writing.drafts}
                    planningRecords={
                      remoteRestorePreview.currentSummary.planning.objectives +
                      remoteRestorePreview.currentSummary.planning.milestones +
                      remoteRestorePreview.currentSummary.planning.workSessions +
                      remoteRestorePreview.currentSummary.planning.notes
                    }
                    reportPackets={remoteRestorePreview.currentSummary.reports.packets}
                    reviewSessions={remoteRestorePreview.currentSummary.review.sessions}
                    calibrationProgress={
                      remoteRestorePreview.currentSummary.calibration.progressRecords
                    }
                  />
                  <SnapshotSummary
                    title="Remote snapshot"
                    projects={remoteRestorePreview.incomingSummary.workspace.projects}
                    targets={remoteRestorePreview.incomingSummary.dispatch.targets}
                    drafts={remoteRestorePreview.incomingSummary.writing.drafts}
                    planningRecords={
                      remoteRestorePreview.incomingSummary.planning.objectives +
                      remoteRestorePreview.incomingSummary.planning.milestones +
                      remoteRestorePreview.incomingSummary.planning.workSessions +
                      remoteRestorePreview.incomingSummary.planning.notes
                    }
                    reportPackets={remoteRestorePreview.incomingSummary.reports.packets}
                    reviewSessions={remoteRestorePreview.incomingSummary.review.sessions}
                    calibrationProgress={
                      remoteRestorePreview.incomingSummary.calibration.progressRecords
                    }
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
  )
}
