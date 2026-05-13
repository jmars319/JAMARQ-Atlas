import {
  Archive,
  ClipboardCheck,
  Copy,
  Download,
  FileText,
  Filter,
  NotebookText,
  Save,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatDateTimeLabel, type ProjectRecord } from '../domain/atlas'
import type { DispatchState } from '../domain/dispatch'
import type { PlanningState } from '../domain/planning'
import {
  REPORT_PACKET_TYPES,
  getReportPacketType,
  type ReportPacket,
  type ReportPacketType,
  type ReportsState,
} from '../domain/reports'
import type { ReviewState } from '../domain/review'
import type { WritingDraft, WritingWorkbenchState } from '../domain/writing'
import { copyTextToClipboard } from '../services/aiWritingAssistant'
import { createReportPacket, reportFilename } from '../services/reports'

type ReportScope = string | 'all'

interface ReportsCenterProps {
  reports: ReportsState
  review: ReviewState
  projectRecords: ProjectRecord[]
  dispatch: DispatchState
  planning: PlanningState
  writing: WritingWorkbenchState
  selectedProjectId: string
  onSelectProject: (projectId: string) => void
  onCreatePacket: (packet: ReportPacket) => void
  onUpdatePacketMarkdown: (packetId: string, markdown: string) => void
  onRecordCopied: (packetId: string) => void
  onMarkExported: (packetId: string) => void
  onArchivePacket: (packetId: string) => void
}

function statusLabel(status: ReportPacket['status']) {
  return status.slice(0, 1).toUpperCase() + status.slice(1)
}

function filterWritingDrafts(drafts: WritingDraft[], scope: ReportScope) {
  return drafts
    .filter((draft) => ['approved', 'exported'].includes(draft.status))
    .filter((draft) => scope === 'all' || draft.projectId === scope)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

function downloadMarkdown(packet: ReportPacket) {
  const blob = new Blob([packet.markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = reportFilename(packet)
  anchor.click()
  URL.revokeObjectURL(url)
}

function ReportPacketEditor({
  packet,
  onSave,
  onCopy,
  onDownload,
  onArchive,
}: {
  packet: ReportPacket
  onSave: (markdown: string) => void
  onCopy: () => void
  onDownload: () => void
  onArchive: () => void
}) {
  const [markdownDraft, setMarkdownDraft] = useState(packet.markdown)

  return (
    <>
      <div className="reports-editor-heading">
        <div>
          <span className="section-label">
            {getReportPacketType(packet.type).label} / {statusLabel(packet.status)}
          </span>
          <h2>{packet.title}</h2>
        </div>
        <div className="reports-editor-actions">
          <button type="button" onClick={() => onSave(markdownDraft)}>
            <Save size={15} />
            Save edits
          </button>
          <button type="button" onClick={onCopy}>
            <Copy size={15} />
            Copy Markdown
          </button>
          <button type="button" onClick={onDownload}>
            <Download size={15} />
            Download Markdown
          </button>
          <button type="button" onClick={onArchive}>
            <Archive size={15} />
            Archive
          </button>
        </div>
      </div>

      <textarea
        aria-label="Report Markdown"
        value={markdownDraft}
        rows={20}
        onChange={(event) => setMarkdownDraft(event.target.value)}
      />

      {packet.contextWarnings.length > 0 ? (
        <div className="reports-warning">
          <strong>Context warnings</strong>
          <ul>
            {packet.contextWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="reports-audit" aria-label="Report audit timeline">
        <strong>Report audit</strong>
        <ol>
          {packet.auditEvents
            .slice()
            .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
            .map((event) => (
              <li key={event.id}>
                <span>{formatDateTimeLabel(event.occurredAt)}</span>
                <strong>{event.type}</strong>
                <p>{event.detail}</p>
              </li>
            ))}
        </ol>
      </div>
    </>
  )
}

export function ReportsCenter({
  reports,
  review,
  projectRecords,
  dispatch,
  planning,
  writing,
  selectedProjectId,
  onSelectProject,
  onCreatePacket,
  onUpdatePacketMarkdown,
  onRecordCopied,
  onMarkExported,
  onArchivePacket,
}: ReportsCenterProps) {
  const [packetType, setPacketType] = useState<ReportPacketType>('client-update-packet')
  const [scope, setScope] = useState<ReportScope>(selectedProjectId || 'all')
  const [selectedWritingDraftIds, setSelectedWritingDraftIds] = useState<string[]>([])
  const [selectedPacketId, setSelectedPacketId] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const eligibleDrafts = useMemo(
    () => filterWritingDrafts(writing.drafts, scope),
    [scope, writing.drafts],
  )
  const selectedPacket =
    reports.packets.find((packet) => packet.id === selectedPacketId) ?? reports.packets[0] ?? null
  const activePackets = reports.packets.filter((packet) => packet.status !== 'archived')
  const exportedCount = reports.packets.filter((packet) => packet.status === 'exported').length
  const archivedCount = reports.packets.filter((packet) => packet.status === 'archived').length
  const scopedRecords =
    scope === 'all'
      ? projectRecords
      : projectRecords.filter((record) => record.project.id === scope)

  function toggleWritingDraft(draftId: string) {
    setSelectedWritingDraftIds((current) =>
      current.includes(draftId)
        ? current.filter((candidate) => candidate !== draftId)
        : [...current, draftId],
    )
  }

  function handleScopeChange(nextScope: ReportScope) {
    setScope(nextScope)
    setSelectedWritingDraftIds([])

    if (nextScope !== 'all') {
      onSelectProject(nextScope)
    }
  }

  function handleSelectAllDrafts() {
    setSelectedWritingDraftIds(eligibleDrafts.map((draft) => draft.id))
  }

  function handleCreatePacket() {
    const packet = createReportPacket({
      type: packetType,
      projectRecords,
      dispatch,
      reports,
      review,
      planning,
      writingDrafts: writing.drafts,
      projectIds: scope === 'all' ? [] : [scope],
      writingDraftIds: selectedWritingDraftIds,
    })

    onCreatePacket(packet)
    setSelectedPacketId(packet.id)
    setActionMessage('Report packet assembled locally for human review.')
  }

  function handleSavePacketMarkdown(packet: ReportPacket, markdown: string) {
    onUpdatePacketMarkdown(packet.id, markdown)
    setActionMessage('Report Markdown edits saved locally.')
  }

  async function handleCopyPacket(packet: ReportPacket) {
    const result = await copyTextToClipboard(packet.markdown)
    setActionMessage(result.message)

    if (result.ok) {
      onRecordCopied(packet.id)
    }
  }

  function handleDownloadPacket(packet: ReportPacket) {
    downloadMarkdown(packet)
    onMarkExported(packet.id)
    setActionMessage(`Markdown report exported locally as ${reportFilename(packet)}.`)
  }

  return (
    <section className="reports-center" aria-labelledby="reports-title">
      <div className="dashboard-header">
        <div>
          <p className="section-label">Reporting</p>
          <h1 id="reports-title">Report Packet Builder</h1>
          <p>
            Assemble local Markdown update packets from approved writing, manual project status,
            verification, Dispatch posture, Planning notes, and scoped GitHub context.
          </p>
        </div>
        <div className="dashboard-stats" aria-label="Report packet counts">
          <div>
            <FileText size={17} />
            <strong>{reports.packets.length}</strong>
            <span>Total packets</span>
          </div>
          <div>
            <NotebookText size={17} />
            <strong>{activePackets.length}</strong>
            <span>Active</span>
          </div>
          <div>
            <Download size={17} />
            <strong>{exportedCount}</strong>
            <span>Exported</span>
          </div>
          <div>
            <Archive size={17} />
            <strong>{archivedCount}</strong>
            <span>Archived</span>
          </div>
        </div>
      </div>

      <div className="reports-layout">
        <aside className="reports-panel" aria-label="Create report packet">
          <div className="panel-heading">
            <ClipboardCheck size={17} />
            <h2>Create packet</h2>
          </div>

          <div className="field-grid">
            <label className="field field-full">
              <span>Report type</span>
              <select
                aria-label="Report type"
                value={packetType}
                onChange={(event) => setPacketType(event.target.value as ReportPacketType)}
              >
                {REPORT_PACKET_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field-full">
              <span>Report project</span>
              <select
                aria-label="Report project"
                value={scope}
                onChange={(event) => handleScopeChange(event.target.value as ReportScope)}
              >
                <option value="all">All projects</option>
                {projectRecords.map((record) => (
                  <option key={record.project.id} value={record.project.id}>
                    {record.project.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="reports-draft-picker" aria-label="Report writing drafts">
            <div className="reports-subheading">
              <Filter size={15} />
              <strong>Approved/exported Writing drafts</strong>
            </div>
            {eligibleDrafts.length === 0 ? (
              <p className="empty-state">No approved or exported Writing drafts match this scope.</p>
            ) : null}
            {eligibleDrafts.length > 0 ? (
              <button type="button" onClick={handleSelectAllDrafts}>
                Select all drafts
              </button>
            ) : null}
            {eligibleDrafts.map((draft) => (
              <label key={draft.id} className="check-field">
                <input
                  type="checkbox"
                  checked={selectedWritingDraftIds.includes(draft.id)}
                  onChange={() => toggleWritingDraft(draft.id)}
                />
                <span>
                  {draft.title} / {draft.status}
                </span>
              </label>
            ))}
          </div>

          <button type="button" className="primary-action" onClick={handleCreatePacket}>
            <ClipboardCheck size={15} />
            Create report packet
          </button>

          <p className="empty-state">
            Report packets are local artifacts. Copying or exporting Markdown does not send,
            publish, deploy, ship, or verify anything.
          </p>
        </aside>

        <div className="reports-main">
          <div className="reports-scope">
            <span>{scopedRecords.length} projects in current scope</span>
            <span>{eligibleDrafts.length} approved/exported drafts available</span>
          </div>

          <div className="reports-workspace">
            <div className="reports-history" aria-label="Report packet history">
              <div className="panel-heading">
                <FileText size={17} />
                <h2>Packets</h2>
              </div>
              {reports.packets.length === 0 ? (
                <p className="empty-state">No report packets yet.</p>
              ) : null}
              {reports.packets.map((packet) => (
                <button
                  type="button"
                  key={packet.id}
                  className={`reports-packet-card ${
                    selectedPacket?.id === packet.id ? 'is-selected' : ''
                  }`}
                  onClick={() => setSelectedPacketId(packet.id)}
                >
                  <span>{getReportPacketType(packet.type).label}</span>
                  <strong>{packet.title}</strong>
                  <small>
                    {statusLabel(packet.status)} / {formatDateTimeLabel(packet.updatedAt)}
                  </small>
                </button>
              ))}
            </div>

            <div className="reports-editor">
              {selectedPacket ? (
                <ReportPacketEditor
                  key={selectedPacket.id}
                  packet={selectedPacket}
                  onSave={(markdown) => handleSavePacketMarkdown(selectedPacket, markdown)}
                  onCopy={() => handleCopyPacket(selectedPacket)}
                  onDownload={() => handleDownloadPacket(selectedPacket)}
                  onArchive={() => onArchivePacket(selectedPacket.id)}
                />
              ) : (
                <p className="empty-state">Create a report packet to review Markdown output.</p>
              )}
            </div>
          </div>

          {actionMessage ? <p className="writing-action-message">{actionMessage}</p> : null}
        </div>
      </div>
    </section>
  )
}
