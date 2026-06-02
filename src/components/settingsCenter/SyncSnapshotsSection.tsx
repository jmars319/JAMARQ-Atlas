import { useSettingsCenterContext } from './useSettingsCenterContext'
import { HardDrive, PlusCircle, Trash2, ArchiveRestore } from 'lucide-react'
import { SnapshotSummary } from '../SettingsCenterParts'
import { SYNC_RESTORE_CONFIRMATION_PHRASE } from '../../services/syncSnapshots'

export function SyncSnapshotsSection() {
  const {
    handleCreateSnapshot,
    handleDeleteSnapshot,
    handleRestoreSnapshot,
    pendingDeleteId,
    restorePreview,
    restoreReady,
    selectedSnapshot,
    setPendingDeleteId,
    setSelectedSnapshotId,
    setSnapshotConfirmation,
    setSnapshotLabel,
    setSnapshotNote,
    snapshotConfirmation,
    snapshotLabel,
    snapshotNote,
    sync,
    syncMessage,
  } = useSettingsCenterContext()

  return (
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
                    planningRecords={
                      restorePreview.currentSummary.planning.objectives +
                      restorePreview.currentSummary.planning.milestones +
                      restorePreview.currentSummary.planning.workSessions +
                      restorePreview.currentSummary.planning.notes
                    }
                    reportPackets={restorePreview.currentSummary.reports.packets}
                    reviewSessions={restorePreview.currentSummary.review.sessions}
                    calibrationProgress={restorePreview.currentSummary.calibration.progressRecords}
                  />
                  <SnapshotSummary
                    title="Selected snapshot"
                    projects={restorePreview.incomingSummary.workspace.projects}
                    targets={restorePreview.incomingSummary.dispatch.targets}
                    drafts={restorePreview.incomingSummary.writing.drafts}
                    planningRecords={
                      restorePreview.incomingSummary.planning.objectives +
                      restorePreview.incomingSummary.planning.milestones +
                      restorePreview.incomingSummary.planning.workSessions +
                      restorePreview.incomingSummary.planning.notes
                    }
                    reportPackets={restorePreview.incomingSummary.reports.packets}
                    reviewSessions={restorePreview.incomingSummary.review.sessions}
                    calibrationProgress={
                      restorePreview.incomingSummary.calibration.progressRecords
                    }
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
  )
}
