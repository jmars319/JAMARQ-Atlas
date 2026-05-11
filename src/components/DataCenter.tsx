import { useMemo, useState, type ChangeEvent } from 'react'
import { ArchiveRestore, ClipboardCopy, Download, FileJson, FileText, ShieldCheck } from 'lucide-react'
import type { Workspace } from '../domain/atlas'
import type { DispatchState } from '../domain/dispatch'
import type { AtlasBackupStores, AtlasRestorePreview } from '../domain/dataPortability'
import type { AtlasSettingsState } from '../domain/settings'
import type { AtlasSyncState } from '../domain/sync'
import type { WritingWorkbenchState } from '../domain/writing'
import {
  createAtlasBackupEnvelope,
  createAtlasBackupMarkdownReport,
  createBackupSummaryText,
  createRestorePreview,
  canApplyAtlasRestore,
  parseAtlasBackupJson,
  RESTORE_CONFIRMATION_PHRASE,
  summarizeAtlasStores,
} from '../services/dataPortability'

interface DataCenterProps {
  workspace: Workspace
  dispatch: DispatchState
  writing: WritingWorkbenchState
  settings: AtlasSettingsState
  sync: AtlasSyncState
  onRestoreStores: (stores: AtlasBackupStores) => void
}

function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function dateStamp(value: string) {
  return value.replace(/[:.]/g, '-')
}

function SummaryCard({
  title,
  items,
}: {
  title: string
  items: { label: string; value: number }[]
}) {
  return (
    <div className="data-summary-card">
      <strong>{title}</strong>
      <dl>
        {items.map((item) => (
          <div key={item.label}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function PreviewComparison({ preview }: { preview: AtlasRestorePreview }) {
  return (
    <div className="data-preview-grid" aria-label="Restore preview">
      <SummaryCard
        title="Current Local Data"
        items={[
          { label: 'Projects', value: preview.currentSummary.workspace.projects },
          { label: 'Repo bindings', value: preview.currentSummary.workspace.repositoryBindings },
          { label: 'Dispatch targets', value: preview.currentSummary.dispatch.targets },
          { label: 'Preflight runs', value: preview.currentSummary.dispatch.preflightRuns },
          { label: 'Writing drafts', value: preview.currentSummary.writing.drafts },
          { label: 'Sync snapshots', value: preview.currentSummary.sync.snapshots },
        ]}
      />
      <SummaryCard
        title="Incoming Backup"
        items={[
          { label: 'Projects', value: preview.incomingSummary.workspace.projects },
          { label: 'Repo bindings', value: preview.incomingSummary.workspace.repositoryBindings },
          { label: 'Dispatch targets', value: preview.incomingSummary.dispatch.targets },
          { label: 'Preflight runs', value: preview.incomingSummary.dispatch.preflightRuns },
          { label: 'Writing drafts', value: preview.incomingSummary.writing.drafts },
          { label: 'Sync snapshots', value: preview.incomingSummary.sync.snapshots },
        ]}
      />
    </div>
  )
}

export function DataCenter({
  workspace,
  dispatch,
  writing,
  settings,
  sync,
  onRestoreStores,
}: DataCenterProps) {
  const [preview, setPreview] = useState<AtlasRestorePreview | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const stores = useMemo(
    () => ({ workspace, dispatch, writing, settings, sync }),
    [dispatch, settings, sync, workspace, writing],
  )
  const envelope = useMemo(() => createAtlasBackupEnvelope(stores), [stores])
  const summary = useMemo(() => summarizeAtlasStores(stores), [stores])
  const restoreReady = preview !== null && canApplyAtlasRestore(confirmation)

  function exportJson() {
    const currentEnvelope = createAtlasBackupEnvelope(stores)
    downloadTextFile(
      `jamarq-atlas-backup-${dateStamp(currentEnvelope.exportedAt)}.json`,
      JSON.stringify(currentEnvelope, null, 2),
      'application/json',
    )
    setMessage('JSON backup downloaded locally.')
  }

  function exportMarkdown() {
    const currentEnvelope = createAtlasBackupEnvelope(stores)
    downloadTextFile(
      `jamarq-atlas-backup-report-${dateStamp(currentEnvelope.exportedAt)}.md`,
      createAtlasBackupMarkdownReport(currentEnvelope),
      'text/markdown',
    )
    setMessage('Markdown inventory report downloaded locally.')
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(createBackupSummaryText(envelope))
      setMessage('Backup summary copied locally.')
    } catch {
      setMessage('Clipboard API is unavailable in this browser.')
    }
  }

  async function importBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    const result = parseAtlasBackupJson(await file.text())

    if (!result.ok || !result.envelope) {
      setPreview(null)
      setConfirmation('')
      setErrors(result.errors)
      setMessage('Backup import failed validation.')
      return
    }

    setPreview(createRestorePreview(stores, result.envelope))
    setErrors([])
    setConfirmation('')
    setMessage('Backup validated. Review the preview before restoring.')
  }

  function restoreBackup() {
    if (!restoreReady || !preview) {
      return
    }

    onRestoreStores(preview.normalizedStores)
    setPreview(null)
    setConfirmation('')
    setErrors([])
    setMessage(
      'Backup restored locally. Workspace, Dispatch, Writing, Settings, and Sync stores were replaced.',
    )
  }

  return (
    <section className="data-center" aria-labelledby="data-center-title">
      <div className="dashboard-header">
        <div>
          <p className="section-label">Atlas Data Center</p>
          <h1 id="data-center-title">Backups & Restore</h1>
          <p>
            Export local Atlas state, inspect backup contents, and restore Workspace, Dispatch,
            Writing, Settings, and Sync stores after explicit human confirmation.
          </p>
        </div>
        <div className="dashboard-stats" aria-label="Data inventory counts">
          <div>
            <FileJson size={16} />
            <strong>{summary.workspace.projects}</strong>
            <span>Projects</span>
          </div>
          <div>
            <ArchiveRestore size={16} />
            <strong>{summary.dispatch.targets}</strong>
            <span>Targets</span>
          </div>
          <div>
            <FileText size={16} />
            <strong>{summary.writing.drafts}</strong>
            <span>Drafts</span>
          </div>
          <div>
            <ArchiveRestore size={16} />
            <strong>{summary.sync.snapshots}</strong>
            <span>Snapshots</span>
          </div>
        </div>
      </div>

      <div className="data-layout">
        <section className="data-panel">
          <div className="panel-heading">
            <Download size={17} />
            <h2>Export Current Local Data</h2>
          </div>
          <div className="data-summary-grid">
            <SummaryCard
              title="Workspace"
              items={[
                { label: 'Sections', value: summary.workspace.sections },
                { label: 'Groups', value: summary.workspace.groups },
                { label: 'Projects', value: summary.workspace.projects },
                { label: 'Repo bindings', value: summary.workspace.repositoryBindings },
                { label: 'Activity events', value: summary.workspace.activityEvents },
              ]}
            />
            <SummaryCard
              title="Dispatch"
              items={[
                { label: 'Targets', value: summary.dispatch.targets },
                { label: 'Records', value: summary.dispatch.records },
                { label: 'Readiness', value: summary.dispatch.readinessEntries },
                { label: 'Preflight runs', value: summary.dispatch.preflightRuns },
              ]}
            />
            <SummaryCard
              title="Writing"
              items={[
                { label: 'Drafts', value: summary.writing.drafts },
                { label: 'Review events', value: summary.writing.reviewEvents },
                { label: 'Approved', value: summary.writing.approvedDrafts },
                { label: 'Exported', value: summary.writing.exportedDrafts },
                { label: 'Archived', value: summary.writing.archivedDrafts },
              ]}
            />
            <SummaryCard
              title="Settings & Sync"
              items={[
                { label: 'Settings stores', value: summary.settings.configured },
                { label: 'Operator labels', value: summary.settings.hasOperatorLabel },
                { label: 'Snapshots', value: summary.sync.snapshots },
                { label: 'Provider configured', value: summary.sync.providerConfigured },
              ]}
            />
          </div>
          <div className="data-actions">
            <button type="button" onClick={exportJson}>
              <FileJson size={15} />
              Download JSON backup
            </button>
            <button type="button" onClick={exportMarkdown}>
              <FileText size={15} />
              Download Markdown report
            </button>
            <button type="button" onClick={() => void copySummary()}>
              <ClipboardCopy size={15} />
              Copy summary
            </button>
          </div>
        </section>

        <section className="data-panel">
          <div className="panel-heading">
            <ArchiveRestore size={17} />
            <h2>Restore From Backup</h2>
          </div>
          <label className="field field-full">
            <span>Import Atlas backup JSON</span>
            <input type="file" accept="application/json,.json" onChange={importBackup} />
          </label>
          {errors.length > 0 ? (
            <div className="data-error">
              <strong>Import validation failed</strong>
              <ul>
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {preview ? (
            <div className="data-restore-preview">
              <PreviewComparison preview={preview} />
              {preview.warnings.length > 0 ? (
                <div className="data-warning">
                  <strong>Restore warnings</strong>
                  <ul>
                    {preview.warnings.map((warning) => (
                      <li key={`${warning.type}-${warning.message}`}>{warning.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <label className="field field-full">
                <span>Type {RESTORE_CONFIRMATION_PHRASE} to replace local stores</span>
                <input
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                />
              </label>
              <button type="button" className="danger-action" disabled={!restoreReady} onClick={restoreBackup}>
                <ArchiveRestore size={15} />
                Restore backup
              </button>
            </div>
          ) : (
            <p className="empty-state">
              No restore preview loaded. Import a JSON backup to inspect counts before replacing
              local Atlas stores.
            </p>
          )}
        </section>

        <section className="data-panel data-guardrails">
          <div className="panel-heading">
            <ShieldCheck size={17} />
            <h2>Data Rules</h2>
          </div>
          <ul className="dispatch-list">
            <li>Backups include Workspace, Dispatch, Writing, Settings, and Sync stores only.</li>
            <li>Backups exclude GitHub tokens, env vars, browser secrets, and unknown storage keys.</li>
            <li>Restore replaces local stores after preview and typed confirmation.</li>
            <li>Restore does not send, publish, deploy, verify, or change source-of-truth rules.</li>
            <li>Hosted sync and GitHub writes are intentionally out of scope.</li>
          </ul>
        </section>
      </div>

      {message ? <p className="data-action-message">{message}</p> : null}
    </section>
  )
}
