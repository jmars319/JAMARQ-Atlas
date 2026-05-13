import {
  Archive,
  BadgeCheck,
  Bot,
  CheckCircle2,
  Clock3,
  Copy,
  Download,
  FileText,
  GitCommitHorizontal,
  NotebookPen,
  Search,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatDateLabel, formatDateTimeLabel, type ProjectRecord } from '../domain/atlas'
import type { DispatchState } from '../domain/dispatch'
import {
  getWritingTemplate,
  WRITING_TEMPLATES,
  type WritingDraft,
  type WritingDraftStatus,
  type WritingProviderResult,
  type WritingTemplateId,
  type WritingWorkbenchState,
} from '../domain/writing'
import { useWritingGithubContext } from '../hooks/useWritingGithubContext'
import {
  buildWritingMarkdownPacket,
  copyTextToClipboard,
  createWritingDraft,
} from '../services/aiWritingAssistant'
import { evaluateVerification } from '../services/verification'
import { requestWritingProviderDraft } from '../services/writingProvider'

type DraftFilter = WritingDraftStatus | 'active' | 'all'

interface WritingWorkbenchProps {
  projectRecords: ProjectRecord[]
  dispatch: DispatchState
  writing: WritingWorkbenchState
  selectedProjectId: string
  selectedTemplateId: WritingTemplateId
  selectedDraftId: string
  onSelectProject: (projectId: string) => void
  onSelectTemplate: (templateId: WritingTemplateId) => void
  onCreateDraft: (draft: WritingDraft) => void
  onSelectDraft: (draftId: string) => void
  onUpdateDraftText: (draftId: string, draftText: string) => void
  onUpdateDraftNotes: (draftId: string, notes: string) => void
  onRecordProviderSuggestion: (draftId: string, providerResult: WritingProviderResult) => void
  onApplyProviderSuggestion: (draftId: string) => void
  onMarkReviewed: (draftId: string) => void
  onApproveDraft: (draftId: string) => void
  onRecordCopied: (draftId: string, type: 'copied' | 'prompt-copied') => void
  onMarkExported: (draftId: string) => void
  onArchiveDraft: (draftId: string) => void
}

function statusLabel(status: WritingDraftStatus) {
  return status.slice(0, 1).toUpperCase() + status.slice(1)
}

function filterDrafts(drafts: WritingDraft[], filter: DraftFilter, query: string) {
  const normalizedQuery = query.trim().toLowerCase()

  return drafts
    .filter((draft) => {
      if (filter === 'all') {
        return true
      }

      if (filter === 'active') {
        return draft.status !== 'archived'
      }

      return draft.status === filter
    })
    .filter((draft) => {
      if (!normalizedQuery) {
        return true
      }

      return [
        draft.title,
        getWritingTemplate(draft.templateId).label,
        draft.contextSnapshot.projectName,
        draft.draftText,
        draft.notes,
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery)
    })
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
}

export function WritingWorkbench({
  projectRecords,
  dispatch,
  writing,
  selectedProjectId,
  selectedTemplateId,
  selectedDraftId,
  onSelectProject,
  onSelectTemplate,
  onCreateDraft,
  onSelectDraft,
  onUpdateDraftText,
  onUpdateDraftNotes,
  onRecordProviderSuggestion,
  onApplyProviderSuggestion,
  onMarkReviewed,
  onApproveDraft,
  onRecordCopied,
  onMarkExported,
  onArchiveDraft,
}: WritingWorkbenchProps) {
  const [draftFilter, setDraftFilter] = useState<DraftFilter>('active')
  const [query, setQuery] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [generatingDraftId, setGeneratingDraftId] = useState('')
  const selectedRecord =
    projectRecords.find((record) => record.project.id === selectedProjectId) ?? projectRecords[0]
  const selectedProjectDrafts = writing.drafts.filter(
    (draft) => draft.projectId === selectedRecord?.project.id,
  )
  const selectedDraft =
    writing.drafts.find((draft) => draft.id === selectedDraftId) ??
    selectedProjectDrafts.find((draft) => draft.status !== 'archived') ??
    null
  const visibleDrafts = useMemo(
    () => filterDrafts(writing.drafts, draftFilter, query),
    [draftFilter, query, writing.drafts],
  )
  const activeDraftCount = writing.drafts.filter((draft) => draft.status === 'draft').length
  const reviewedDraftCount = writing.drafts.filter((draft) => draft.status === 'reviewed').length
  const approvedDraftCount = writing.drafts.filter((draft) => draft.status === 'approved').length
  const exportedDraftCount = writing.drafts.filter((draft) => draft.status === 'exported').length
  const archivedDraftCount = writing.drafts.filter((draft) => draft.status === 'archived').length
  const selectedTemplate = getWritingTemplate(selectedTemplateId)
  const selectedRepository = selectedRecord?.project.repositories[0]
  const githubContext = useWritingGithubContext(selectedRepository)
  const verification = selectedRecord ? evaluateVerification(selectedRecord.project) : null
  const dispatchTargets = selectedRecord
    ? dispatch.targets.filter((target) => target.projectId === selectedRecord.project.id)
    : []

  function handleCreateDraft() {
    if (!selectedRecord) {
      return
    }

    onCreateDraft(
      createWritingDraft({
        templateId: selectedTemplateId,
        record: selectedRecord,
        dispatch,
        github: githubContext.context,
      }),
    )
  }

  async function handleCopyDraft(draft: WritingDraft) {
    const result = await copyTextToClipboard(draft.draftText)
    setActionMessage(result.message)

    if (result.ok) {
      onRecordCopied(draft.id, 'copied')
    }
  }

  async function handleCopyPrompt(draft: WritingDraft) {
    const result = await copyTextToClipboard(draft.promptPacket)
    setActionMessage(result.message)

    if (result.ok) {
      onRecordCopied(draft.id, 'prompt-copied')
    }
  }

  function handleMarkdownExport(draft: WritingDraft) {
    const packet = buildWritingMarkdownPacket(draft)
    const blob = new Blob([packet.markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = packet.filename
    anchor.click()
    URL.revokeObjectURL(url)
    onMarkExported(draft.id)
    setActionMessage(`Markdown packet exported locally as ${packet.filename}.`)
  }

  async function handleGenerateProviderSuggestion(draft: WritingDraft) {
    setGeneratingDraftId(draft.id)
    setActionMessage('Requesting provider suggestion...')

    try {
      const result = await requestWritingProviderDraft(draft)
      onRecordProviderSuggestion(draft.id, result)
      setActionMessage(result.message)
    } finally {
      setGeneratingDraftId('')
    }
  }

  function handleApplyProviderSuggestion(draft: WritingDraft) {
    onApplyProviderSuggestion(draft.id)
    setActionMessage('Provider suggestion applied to editable draft text.')
  }

  return (
    <section className="writing-workbench" aria-labelledby="writing-title">
      <div className="dashboard-header">
        <div>
          <p className="section-label">AI Writing Workbench</p>
          <h1 id="writing-title">Writing Workbench</h1>
          <p>
            Prepare reviewable operational drafts from Atlas state and advisory signals. Drafts do
            not change status, risk, readiness, or verification.
          </p>
        </div>
        <div className="dashboard-stats" aria-label="Writing draft counts">
          <div>
            <FileText size={17} />
            <strong>{writing.drafts.length}</strong>
            <span>Total</span>
          </div>
          <div>
            <Clock3 size={17} />
            <strong>{activeDraftCount}</strong>
            <span>Drafts</span>
          </div>
          <div>
            <CheckCircle2 size={17} />
            <strong>{reviewedDraftCount}</strong>
            <span>Reviewed</span>
          </div>
          <div>
            <Archive size={17} />
            <strong>{archivedDraftCount}</strong>
            <span>Archived</span>
          </div>
          <div>
            <BadgeCheck size={17} />
            <strong>{approvedDraftCount}</strong>
            <span>Approved</span>
          </div>
          <div>
            <Download size={17} />
            <strong>{exportedDraftCount}</strong>
            <span>Exported</span>
          </div>
        </div>
      </div>

      <div className="writing-controls">
        <label className="repo-selector">
          <NotebookPen size={16} />
          <span className="sr-only">Writing project</span>
          <select
            aria-label="Writing project"
            value={selectedRecord?.project.id ?? ''}
            onChange={(event) => onSelectProject(event.target.value)}
          >
            {projectRecords.map((record) => (
              <option key={record.project.id} value={record.project.id}>
                {record.project.name}
              </option>
            ))}
          </select>
        </label>

        <label className="repo-selector">
          <Bot size={16} />
          <span className="sr-only">Writing template</span>
          <select
            aria-label="Writing template"
            value={selectedTemplateId}
            onChange={(event) => onSelectTemplate(event.target.value as WritingTemplateId)}
          >
            {WRITING_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
        </label>

        <button type="button" className="primary-action" onClick={handleCreateDraft}>
          <FileText size={15} />
          Create draft packet
        </button>
      </div>

      <div className="writing-context-grid">
        <div>
          <span>Selected template</span>
          <strong>{selectedTemplate.label}</strong>
          <p>{selectedTemplate.intent}</p>
        </div>
        <div>
          <span>Verification</span>
          <strong>{verification ? verification.dueState : 'Not available'}</strong>
          <p>{verification?.dueDate ? `Due ${formatDateLabel(verification.dueDate)}` : 'No due date'}</p>
        </div>
        <div>
          <span>Dispatch context</span>
          <strong>{dispatchTargets.length}</strong>
          <p>{dispatchTargets.length === 1 ? 'target' : 'targets'} connected to this project</p>
        </div>
        <div>
          <span>GitHub context</span>
          <strong>{githubContext.loading ? 'Loading' : githubContext.context.repository ?? 'None'}</strong>
          <p>{githubContext.context.warnings[0] ?? 'GitHub snippets are advisory only.'}</p>
        </div>
      </div>

      <div className="writing-layout">
        <section className="writing-editor" aria-labelledby="writing-editor-title">
          <div className="resource-panel-header">
            <div>
              <strong id="writing-editor-title">
                {selectedDraft ? selectedDraft.title : 'No draft selected'}
              </strong>
              <span>
                {selectedDraft
                  ? `${getWritingTemplate(selectedDraft.templateId).label} / ${statusLabel(selectedDraft.status)}`
                  : 'Create or select a draft packet to begin.'}
              </span>
            </div>
            {selectedDraft ? (
              <div className="writing-editor-actions">
                <button
                  type="button"
                  disabled={selectedDraft.status === 'archived' || generatingDraftId === selectedDraft.id}
                  onClick={() => void handleGenerateProviderSuggestion(selectedDraft)}
                >
                  <Sparkles size={15} />
                  Generate provider suggestion
                </button>
                <button
                  type="button"
                  disabled={!selectedDraft.providerResult.generatedText}
                  onClick={() => handleApplyProviderSuggestion(selectedDraft)}
                >
                  <Sparkles size={15} />
                  Apply suggestion to draft
                </button>
                <button
                  type="button"
                  disabled={selectedDraft.status !== 'draft'}
                  onClick={() => onMarkReviewed(selectedDraft.id)}
                >
                  <CheckCircle2 size={15} />
                  Mark reviewed
                </button>
                <button
                  type="button"
                  disabled={selectedDraft.status !== 'reviewed'}
                  onClick={() => onApproveDraft(selectedDraft.id)}
                >
                  <BadgeCheck size={15} />
                  Approve
                </button>
                <button type="button" onClick={() => handleCopyDraft(selectedDraft)}>
                  <Copy size={15} />
                  Copy draft
                </button>
                <button type="button" onClick={() => handleCopyPrompt(selectedDraft)}>
                  <Copy size={15} />
                  Copy prompt
                </button>
                <button
                  type="button"
                  disabled={!['approved', 'exported'].includes(selectedDraft.status)}
                  onClick={() => handleMarkdownExport(selectedDraft)}
                >
                  <Download size={15} />
                  Export Markdown
                </button>
                <button
                  type="button"
                  disabled={selectedDraft.status === 'archived'}
                  onClick={() => onArchiveDraft(selectedDraft.id)}
                >
                  <Archive size={15} />
                  Archive
                </button>
              </div>
            ) : null}
          </div>

          {selectedDraft ? (
            <>
              <div className="writing-meta-grid">
                <div>
                  <span>Project</span>
                  <strong>{selectedDraft.contextSnapshot.projectName}</strong>
                </div>
                <div>
                  <span>Captured</span>
                  <strong>{formatDateTimeLabel(selectedDraft.contextSnapshot.capturedAt)}</strong>
                </div>
                <div>
                  <span>Provider</span>
                  <strong>{selectedDraft.providerResult.status}</strong>
                </div>
                <div>
                  <span>Updated</span>
                  <strong>{formatDateTimeLabel(selectedDraft.updatedAt)}</strong>
                </div>
              </div>

              {selectedDraft.contextSnapshot.warnings.length > 0 ? (
                <div className="writing-warning">
                  <ShieldAlert size={16} />
                  <div>
                    <strong>Review context before using this draft</strong>
                    <span>{selectedDraft.contextSnapshot.warnings.join(' ')}</span>
                  </div>
                </div>
              ) : null}

              {actionMessage ? (
                <p className="writing-action-message" aria-live="polite">
                  {actionMessage}
                </p>
              ) : null}

              {selectedDraft.providerResult.status !== 'stub' ? (
                <div
                  className={
                    selectedDraft.providerResult.status === 'generated'
                      ? 'writing-provider-status'
                      : 'writing-warning'
                  }
                >
                  <ShieldAlert size={16} />
                  <div>
                    <strong>
                      Provider {selectedDraft.providerResult.status}
                      {selectedDraft.providerResult.model
                        ? ` / ${selectedDraft.providerResult.model}`
                        : ''}
                    </strong>
                    <span>{selectedDraft.providerResult.message}</span>
                  </div>
                </div>
              ) : null}

              {selectedDraft.providerResult.generatedText ? (
                <div className="writing-provider-suggestion" aria-label="Provider suggestion">
                  <div className="resource-panel-header">
                    <div>
                      <strong>Provider Suggestion</strong>
                      <span>
                        {selectedDraft.providerResult.providerName} /{' '}
                        {selectedDraft.providerResult.model || 'model not recorded'}
                        {selectedDraft.providerResult.generatedAt
                          ? ` / ${formatDateTimeLabel(selectedDraft.providerResult.generatedAt)}`
                          : ''}
                      </span>
                    </div>
                    <button type="button" onClick={() => handleApplyProviderSuggestion(selectedDraft)}>
                      <Sparkles size={15} />
                      Apply suggestion to draft
                    </button>
                  </div>
                  <textarea readOnly rows={7} value={selectedDraft.providerResult.generatedText} />
                </div>
              ) : null}

              <label className="field field-full">
                <span>Draft text</span>
                <textarea
                  rows={11}
                  value={selectedDraft.draftText}
                  onChange={(event) => onUpdateDraftText(selectedDraft.id, event.target.value)}
                />
              </label>

              <label className="field field-full">
                <span>Draft notes</span>
                <textarea
                  rows={3}
                  value={selectedDraft.notes}
                  onChange={(event) => onUpdateDraftNotes(selectedDraft.id, event.target.value)}
                  placeholder="Review notes, missing facts, or send/use status"
                />
              </label>

              <label className="field field-full">
                <span>Prompt packet</span>
                <textarea readOnly rows={11} value={selectedDraft.promptPacket} />
              </label>

              <div className="writing-audit" aria-label="Writing review audit">
                <strong>Review Audit</strong>
                {selectedDraft.reviewEvents.length > 0 ? (
                  <ol>
                    {selectedDraft.reviewEvents
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
                ) : (
                  <p className="empty-state">No review events recorded.</p>
                )}
              </div>
            </>
          ) : (
            <p className="empty-state">
              No writing draft is selected. Choose a project and template, then create a draft packet.
            </p>
          )}
        </section>

        <aside className="writing-history" aria-labelledby="writing-history-title">
          <div className="resource-panel-header">
            <div>
              <strong id="writing-history-title">Draft History</strong>
              <span>{visibleDrafts.length} local drafts shown</span>
            </div>
          </div>

          <label className="search-control">
            <Search size={16} />
            <span className="sr-only">Search writing drafts</span>
            <input
              type="search"
              placeholder="Search drafts"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>

          <div className="repo-tabs" role="tablist" aria-label="Writing draft filters">
            {[
              ['active', 'Active'],
              ['draft', 'Draft'],
              ['reviewed', 'Reviewed'],
              ['approved', 'Approved'],
              ['exported', 'Exported'],
              ['archived', 'Archived'],
              ['all', 'All'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={draftFilter === id ? 'is-selected' : ''}
                onClick={() => setDraftFilter(id as DraftFilter)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="writing-draft-list" aria-label="Writing draft history">
            {visibleDrafts.length === 0 ? (
              <p className="empty-state">No writing drafts match this view.</p>
            ) : null}

            {visibleDrafts.map((draft) => (
              <button
                type="button"
                key={draft.id}
                className={`writing-draft-card ${selectedDraft?.id === draft.id ? 'is-selected' : ''}`}
                onClick={() => onSelectDraft(draft.id)}
              >
                <div className="card-topline">
                  <span className="resource-pill">{getWritingTemplate(draft.templateId).label}</span>
                  <span className={`resource-pill writing-status-${draft.status}`}>
                    {statusLabel(draft.status)}
                  </span>
                </div>
                <strong>{draft.title}</strong>
                <span className="card-context">
                  {draft.contextSnapshot.sectionName} / {draft.contextSnapshot.groupName}
                </span>
                <p>{draft.draftText.split('\n').find(Boolean) ?? 'Draft text is empty.'}</p>
                <div className="card-footer">
                  <span>{formatDateTimeLabel(draft.updatedAt)}</span>
                  <span>
                    <GitCommitHorizontal size={13} />
                    {draft.contextSnapshot.github.latestCommits.length}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  )
}
