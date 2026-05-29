import {
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  GitBranch,
  NotebookPen,
  ShieldAlert,
  SquareArrowOutUpRight,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatDateTimeLabel, type ProjectRecord } from '../domain/atlas'
import type { DispatchState } from '../domain/dispatch'
import type { AtlasPlanningState } from '../domain/planning'
import type { RepoOperationsState } from '../domain/repoOperations'
import type { RepoWorkflowRun } from '../domain/repoWorkflowRuns'
import {
  type ReviewNote,
  type ReviewOutcome,
  type ReviewQueueItem,
  type ReviewSavedFilter,
  type ReviewSession,
  type ReviewSessionPresetId,
  type ReviewState,
} from '../domain/review'
import type { ReportsState } from '../domain/reports'
import type { AtlasSyncState } from '../domain/sync'
import type { TimelineEvent } from '../domain/timeline'
import type { WritingWorkbenchState } from '../domain/writing'
import { useGithubCommandSummaries } from '../hooks/useGithubCommandSummaries'
import { useGithubRepositories } from '../hooks/useGithubRepositories'
import { useVercelCommandSummaries } from '../hooks/useVercelCommandSummaries'
import type { GithubRepositorySource, GithubRepositorySummary } from '../services/githubIntegration'
import { deriveRepoOperationsRows } from '../services/repoOperations'
import { deriveRepoPlacementSuggestions } from '../services/repoSuggestions'
import {
  createReviewNote,
  createReviewPlanningHandoff,
  createReviewSavedFilter,
  createReviewSession,
  createReviewSessionFromPreset,
  deriveTodaysReviewQueue,
  deriveReviewQueue,
  groupReviewQueue,
  parseGithubWritePilotReviewNote,
  summarizeReviewQueue,
  summarizeReviewState,
} from '../services/review'
import {
  ReviewControlsPanel,
  SourceNotice,
} from './ReviewCenterParts'
import {
  labelize,
  type ReviewDueFilter,
  type ReviewSeverityFilter,
  type ReviewSourceFilter,
  type SectionFilter,
} from './ReviewCenterFilters'

interface IntakeRepository {
  repository: GithubRepositorySummary
  sources: GithubRepositorySource[]
}

type ReviewQueueMode = 'today' | 'all'

interface ReviewCenterProps {
  review: ReviewState
  projectRecords: ProjectRecord[]
  dispatch: DispatchState
  planning: AtlasPlanningState
  reports: ReportsState
  writing: WritingWorkbenchState
  sync: AtlasSyncState
  repoOperations?: RepoOperationsState
  repoWorkflowRuns?: RepoWorkflowRun[]
  timelineEvents: TimelineEvent[]
  onSelectProject: (projectId: string) => void
  onAddReviewSession: (session: ReviewSession) => void
  onAddReviewNote: (note: ReviewNote) => void
  onSaveReviewFilter: (filter: ReviewSavedFilter) => void
  onDeleteReviewFilter: (filterId: string) => void
  onCreatePlanningNote: (
    projectId: string,
    title: string,
    detail: string,
    sourceLinks?: Array<{ type: 'review-note'; id: string; label: string }>,
  ) => void
  onOpenGitHub: () => void
  onOpenPlanning: (projectId: string) => void
}

function mergeRepositories(
  configured: GithubRepositorySummary[],
  viewer: GithubRepositorySummary[],
) {
  const repositories = new Map<string, IntakeRepository>()

  function add(repository: GithubRepositorySummary, source: GithubRepositorySource) {
    const key = repository.fullName.toLowerCase()
    const existing = repositories.get(key)

    if (existing) {
      if (!existing.sources.includes(source)) {
        existing.sources.push(source)
      }
      return
    }

    repositories.set(key, { repository, sources: [source] })
  }

  configured.forEach((repository) => add(repository, 'configured'))
  viewer.forEach((repository) => add(repository, 'viewer'))

  return [...repositories.values()].sort((left, right) =>
    left.repository.fullName.localeCompare(right.repository.fullName),
  )
}

function itemMatchesQuery(item: ReviewQueueItem, query: string) {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return true
  }

  return [
    item.title,
    item.detail,
    item.reason,
    item.projectName,
    item.sectionName,
    item.groupName,
    item.source,
    item.severity,
    ...item.meta,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery)
}

function ReviewHistoryNoteCard({
  note,
  projectRecords,
}: {
  note: ReviewNote
  projectRecords: ProjectRecord[]
}) {
  const project = note.projectId
    ? projectRecords.find((record) => record.project.id === note.projectId)
    : undefined
  const writePilot = parseGithubWritePilotReviewNote(note.body)

  if (!writePilot) {
    return (
      <article>
        <span>{formatDateTimeLabel(note.createdAt)}</span>
        <strong>{project?.project.name ?? labelize(note.source)}</strong>
        <p>{note.body}</p>
        <small>{labelize(note.outcome)}</small>
      </article>
    )
  }

  const resultLabel =
    writePilot.resultNumber !== null
      ? `${writePilot.action === 'issue' ? 'Issue' : 'Comment'} #${writePilot.resultNumber}`
      : writePilot.result || 'GitHub result'

  return (
    <article className="review-history-github-note">
      <div className="review-history-note-heading">
        <div>
          <span>{formatDateTimeLabel(note.createdAt)}</span>
          <strong>{writePilot.title}</strong>
        </div>
        <small>{labelize(note.outcome)}</small>
      </div>
      <p>{project?.project.name ?? 'Repository review'}</p>
      <div className="review-chip-row">
        <span className="review-chip review-chip-low">{writePilot.repositoryKey}</span>
        <span className="review-chip">{resultLabel}</span>
        <span className="review-chip">Actor: {writePilot.actor}</span>
      </div>
      {writePilot.htmlUrl ? (
        <a href={writePilot.htmlUrl} target="_blank" rel="noreferrer" className="review-history-link">
          <SquareArrowOutUpRight size={14} />
          Open on GitHub
        </a>
      ) : null}
      <details>
        <summary>Audit details</summary>
        <dl>
          <div>
            <dt>Source</dt>
            <dd>{writePilot.source}</dd>
          </div>
          <div>
            <dt>Broad write gate</dt>
            <dd>{writePilot.broadWriteControlsEnabled}</dd>
          </div>
          <div>
            <dt>Body excerpt</dt>
            <dd>{writePilot.bodyExcerpt || 'No excerpt captured.'}</dd>
          </div>
        </dl>
        <pre>{writePilot.rawBody}</pre>
      </details>
    </article>
  )
}

export function ReviewCenter({
  review,
  projectRecords,
  dispatch,
  planning,
  reports,
  writing,
  sync,
  repoOperations,
  repoWorkflowRuns = [],
  timelineEvents,
  onSelectProject,
  onAddReviewSession,
  onAddReviewNote,
  onSaveReviewFilter,
  onDeleteReviewFilter,
  onCreatePlanningNote,
  onOpenGitHub,
  onOpenPlanning,
}: ReviewCenterProps) {
  const configuredRepos = useGithubRepositories('configured')
  const viewerRepos = useGithubRepositories('viewer')
  const [query, setQuery] = useState('')
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all')
  const [sourceFilter, setSourceFilter] = useState<ReviewSourceFilter>('all')
  const [severityFilter, setSeverityFilter] = useState<ReviewSeverityFilter>('all')
  const [dueFilter, setDueFilter] = useState<ReviewDueFilter>('all')
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [outcomeDrafts, setOutcomeDrafts] = useState<Record<string, ReviewOutcome>>({})
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [queueMode, setQueueMode] = useState<ReviewQueueMode>('today')
  const [selectedReviewItemIds, setSelectedReviewItemIds] = useState<string[]>([])
  const [planningJumpProjectId, setPlanningJumpProjectId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const repositories = useMemo(
    () => mergeRepositories(configuredRepos.data, viewerRepos.data),
    [configuredRepos.data, viewerRepos.data],
  )
  const repoSuggestions = useMemo(
    () =>
      deriveRepoPlacementSuggestions(
        projectRecords,
        repositories.map(({ repository }) => repository),
      ),
    [projectRecords, repositories],
  )
  const boundRepoKeys = useMemo(
    () =>
      [
        ...projectRecords
        .flatMap((record) =>
          record.project.repositories.map((repository) => `${repository.owner}/${repository.name}`),
        ),
        ...(repoOperations?.snapshots
          .find((snapshot) => snapshot.id === repoOperations.selectedSnapshotId)
          ?.repositories.map((repository) =>
            repository.githubOwner && repository.githubRepo
              ? `${repository.githubOwner}/${repository.githubRepo}`
              : '',
          ) ?? []),
      ]
        .filter(
          (repoKey, index, repoKeys) =>
            repoKeys.findIndex(
              (candidate) => candidate.toLowerCase() === repoKey.toLowerCase(),
            ) === index,
        ),
    [projectRecords, repoOperations],
  )
  const githubCommandSummaries = useGithubCommandSummaries(boundRepoKeys)
  const repoOperationsRows = useMemo(
    () =>
      repoOperations
        ? deriveRepoOperationsRows({
            state: repoOperations,
            projectRecords,
            commandSummaries: githubCommandSummaries.data,
            workflowRuns: repoWorkflowRuns,
          })
        : [],
    [githubCommandSummaries.data, projectRecords, repoOperations, repoWorkflowRuns],
  )
  const vercelTargetIds = useMemo(
    () => dispatch.targets.filter((target) => target.hostType === 'vercel').map((target) => target.id),
    [dispatch.targets],
  )
  const vercelCommandSummaries = useVercelCommandSummaries(vercelTargetIds)
  const queue = useMemo(
    () =>
      deriveReviewQueue({
        projectRecords,
        dispatch,
        planning,
        reports,
        writing,
        sync,
        timelineEvents,
        repoSuggestions,
        githubCommandSummaries: githubCommandSummaries.data,
        vercelCommandSummaries: vercelCommandSummaries.data,
        repoOperationsRows,
      }),
    [
      dispatch,
      githubCommandSummaries.data,
      planning,
      projectRecords,
      repoSuggestions,
      repoOperationsRows,
      reports,
      sync,
      timelineEvents,
      vercelCommandSummaries.data,
      writing,
    ],
  )
  const filteredQueue = useMemo(
    () =>
      queue
        .filter((item) => sectionFilter === 'all' || item.sectionId === sectionFilter)
        .filter((item) => sourceFilter === 'all' || item.source === sourceFilter)
        .filter((item) => severityFilter === 'all' || item.severity === severityFilter)
        .filter((item) => dueFilter === 'all' || item.dueState === dueFilter)
        .filter((item) => itemMatchesQuery(item, query)),
    [dueFilter, query, queue, sectionFilter, severityFilter, sourceFilter],
  )
  const summary = useMemo(() => summarizeReviewQueue(queue), [queue])
  const reviewSummary = useMemo(() => summarizeReviewState(review), [review])
  const visibleQueue = useMemo(
    () => (queueMode === 'today' ? deriveTodaysReviewQueue(filteredQueue) : filteredQueue),
    [filteredQueue, queueMode],
  )
  const groupedQueue = useMemo(() => groupReviewQueue(visibleQueue), [visibleQueue])
  const visiblePlanningItems = useMemo(
    () => visibleQueue.filter((item) => item.projectId),
    [visibleQueue],
  )
  const selectedPlanningItems = useMemo(
    () => visiblePlanningItems.filter((item) => selectedReviewItemIds.includes(item.id)),
    [selectedReviewItemIds, visiblePlanningItems],
  )
  const sections = useMemo(
    () => [...new Map(projectRecords.map((record) => [record.section.id, record.section])).values()],
    [projectRecords],
  )
  const latestSessions = review.sessions.slice(0, 5)
  const latestNotes = review.notes.slice(0, 5)
  const activeReviewItemId =
    visibleQueue.find((item) => item.id === expandedItemId)?.id ?? visibleQueue[0]?.id ?? null

  function startSession(items: ReviewQueueItem[]) {
    if (items.length === 0) {
      return
    }

    const session = createReviewSession({
      title:
        items.length === 1
          ? `Review: ${items[0].title}`
          : `Operator review - ${items.length} items`,
      scope: items.length === 1 && items[0].projectId ? 'project' : 'all',
      cadence: 'ad-hoc',
      itemIds: items.map((item) => item.id),
      projectIds: items.flatMap((item) => (item.projectId ? [item.projectId] : [])),
      notes: 'Manual Review Center session. Queue inputs are advisory only.',
    })

    onAddReviewSession(session)
    setPlanningJumpProjectId(null)
    setMessage('Review session started locally.')
  }

  function startPresetSession(presetId: ReviewSessionPresetId) {
    const session = createReviewSessionFromPreset({ presetId, queue })

    if (!session) {
      setPlanningJumpProjectId(null)
      setMessage('No review queue items match that preset right now.')
      return
    }

    onAddReviewSession(session)
    setPlanningJumpProjectId(null)
    setMessage(`${session.title} started locally.`)
  }

  function saveCurrentFilter() {
    const filter = createReviewSavedFilter({
      label: `Review filter - ${new Date().toISOString().slice(0, 10)}`,
      query,
      sectionFilter,
      sourceFilter,
      severityFilter,
      dueFilter,
    })

    onSaveReviewFilter(filter)
    setPlanningJumpProjectId(null)
    setMessage('Review filter saved locally.')
  }

  function applySavedFilter(filter: ReviewSavedFilter) {
    setQuery(filter.query)
    setSectionFilter(filter.sectionFilter)
    setSourceFilter(filter.sourceFilter)
    setSeverityFilter(filter.severityFilter)
    setDueFilter(filter.dueFilter)
    setPlanningJumpProjectId(null)
    setMessage(`Applied saved filter: ${filter.label}.`)
  }

  function addNote(item: ReviewQueueItem, outcome: ReviewOutcome) {
    const body = noteDrafts[item.id]?.trim()

    if (!body) {
      return
    }

    onAddReviewNote(
      createReviewNote({
        itemId: item.id,
        projectId: item.projectId,
        source: item.source,
        outcome,
        body,
      }),
    )
    setNoteDrafts((current) => ({ ...current, [item.id]: '' }))
    setPlanningJumpProjectId(null)
    setMessage('Review note captured locally.')
  }

  function createPlanningNote(item: ReviewQueueItem) {
    if (!item.projectId) {
      return
    }

    const handoff = createReviewPlanningHandoff(item, noteDrafts[item.id])
    const note = createReviewNote({
      itemId: item.id,
      projectId: item.projectId,
      source: item.source,
      outcome: 'planned',
      body: handoff.reviewNoteBody,
    })

    onCreatePlanningNote(item.projectId, handoff.title, handoff.detail, [
      {
        type: 'review-note',
        id: note.id,
        label: `Review note ${note.id}`,
      },
    ])
    onAddReviewNote(note)
    setNoteDrafts((current) => ({ ...current, [item.id]: '' }))
    setPlanningJumpProjectId(item.projectId)
    setMessage('Planning note created from Review. Project operational status was not changed.')
  }

  function toggleSelectedReviewItem(itemId: string, selected: boolean) {
    setSelectedReviewItemIds((current) =>
      selected
        ? current.includes(itemId)
          ? current
          : [...current, itemId]
        : current.filter((candidate) => candidate !== itemId),
    )
  }

  function selectVisiblePlanningItems() {
    setSelectedReviewItemIds(visiblePlanningItems.map((item) => item.id))
  }

  function createPlanningNotesForSelected() {
    if (selectedPlanningItems.length === 0) {
      setPlanningJumpProjectId(null)
      setMessage('Select review items with projects before creating Planning notes.')
      return
    }

    selectedPlanningItems.forEach((item) => {
      if (!item.projectId) {
        return
      }

      const handoff = createReviewPlanningHandoff(item)
      const note = createReviewNote({
        itemId: item.id,
        projectId: item.projectId,
        source: item.source,
        outcome: 'planned',
        body: handoff.reviewNoteBody,
      })

      onCreatePlanningNote(item.projectId, handoff.title, handoff.detail, [
        {
          type: 'review-note',
          id: note.id,
          label: `Review note ${note.id}`,
        },
      ])
      onAddReviewNote(note)
    })

    setSelectedReviewItemIds([])
    setPlanningJumpProjectId(selectedPlanningItems[0]?.projectId ?? null)
    setMessage(
      `${selectedPlanningItems.length} Planning notes created from Review. Project operational status was not changed.`,
    )
  }

  return (
    <section className="review-center" aria-labelledby="review-center-title">
      <div className="dashboard-header">
        <div>
          <p className="section-label">Operator Review</p>
          <h1 id="review-center-title">Review Center</h1>
          <p>
            Review derived attention signals across Atlas. Sessions and notes are manual records;
            the queue does not decide status, readiness, verification, or priority.
          </p>
        </div>
        <div className="dashboard-stats" aria-label="Review queue counts">
          <div>
            <CalendarCheck size={17} />
            <strong>{summary.dueReview}</strong>
            <span>Due review</span>
          </div>
          <div>
            <ShieldAlert size={17} />
            <strong>{summary.blocked}</strong>
            <span>Blocked/high</span>
          </div>
          <div>
            <ClipboardList size={17} />
            <strong>{summary.deployFollowUp}</strong>
            <span>Deploy follow-up</span>
          </div>
          <div>
            <GitBranch size={17} />
            <strong>{summary.unboundRepos}</strong>
            <span>Unconnected repos</span>
          </div>
          <div>
            <FileText size={17} />
            <strong>{summary.draftReportFollowUp}</strong>
            <span>Draft/report</span>
          </div>
          <div>
            <NotebookPen size={17} />
            <strong>{summary.backupSyncAttention}</strong>
            <span>Backup/sync</span>
          </div>
        </div>
      </div>

      <div className="review-source-grid">
        <SourceNotice
          label="Configured GitHub repos"
          loading={configuredRepos.loading}
          error={configuredRepos.error}
        />
        <SourceNotice label="Viewer GitHub repos" loading={viewerRepos.loading} error={viewerRepos.error} />
        <SourceNotice
          label="Connected GitHub command summaries"
          loading={githubCommandSummaries.loading}
          error={githubCommandSummaries.error}
        />
        <SourceNotice
          label="Vercel deployment evidence"
          loading={vercelCommandSummaries.loading}
          error={vercelCommandSummaries.error}
        />
      </div>

      <div className="review-layout">
        <ReviewControlsPanel
          query={query}
          sectionFilter={sectionFilter}
          sourceFilter={sourceFilter}
          severityFilter={severityFilter}
          dueFilter={dueFilter}
          sections={sections}
          savedFilters={review.savedFilters}
          onQueryChange={setQuery}
          onSectionFilterChange={setSectionFilter}
          onSourceFilterChange={setSourceFilter}
          onSeverityFilterChange={setSeverityFilter}
          onDueFilterChange={setDueFilter}
          onStartReviewSession={() => startSession(visibleQueue.slice(0, 20))}
          onSaveFilter={saveCurrentFilter}
          onOpenGitHub={onOpenGitHub}
          onStartPresetSession={startPresetSession}
          onApplySavedFilter={applySavedFilter}
          onDeleteSavedFilter={onDeleteReviewFilter}
        />

        <div className="review-main">
          <div className="review-summary">
            <span>
              {visibleQueue.length} of {filteredQueue.length} review items shown
            </span>
            <span>
              Sessions {reviewSummary.sessions} / Notes {reviewSummary.notes} / Follow-ups{' '}
              {reviewSummary.followUps}
            </span>
          </div>

          <div className="review-mode-toggle" aria-label="Review queue mode">
            <button
              type="button"
              className={queueMode === 'today' ? 'is-selected' : ''}
              onClick={() => setQueueMode('today')}
            >
              Today&apos;s review
            </button>
            <button
              type="button"
              className={queueMode === 'all' ? 'is-selected' : ''}
              onClick={() => setQueueMode('all')}
            >
              Full queue
            </button>
          </div>

          <div className="review-batch-actions" aria-label="Review batch planning actions">
            <span>
              {selectedPlanningItems.length} selected / {visiblePlanningItems.length} project items
            </span>
            <button type="button" onClick={selectVisiblePlanningItems}>
              Select project items
            </button>
            <button
              type="button"
              disabled={selectedPlanningItems.length === 0}
              onClick={createPlanningNotesForSelected}
            >
              Create Planning notes
            </button>
            <button
              type="button"
              disabled={selectedReviewItemIds.length === 0}
              onClick={() => setSelectedReviewItemIds([])}
            >
              Clear
            </button>
          </div>

          <div className="review-queue" aria-label="Operator review queue">
            {visibleQueue.length === 0 ? (
              <p className="empty-state">No review items match this view.</p>
            ) : null}

            {groupedQueue.map((group) => (
              <section className="review-queue-group" key={group.id} aria-label={group.label}>
                <div className="review-group-heading">
                  <div>
                    <h3>{group.label}</h3>
                    <p>{group.detail}</p>
                  </div>
                  <strong>{group.items.length}</strong>
                </div>

                {group.items.map((item) => {
              const outcome = outcomeDrafts[item.id] ?? 'noted'
              const noteDraft = noteDrafts[item.id] ?? ''
              const isExpanded = item.id === activeReviewItemId

              return (
                <article
                  key={item.id}
                  className={`review-item review-severity-${item.severity} ${
                    isExpanded ? 'is-expanded' : ''
                  }`}
                >
                      <div className="review-item-heading">
                        <div>
                          {item.projectId ? (
                            <label className="review-select-control">
                              <input
                                type="checkbox"
                                checked={selectedReviewItemIds.includes(item.id)}
                                aria-label={`Select ${item.title} for Planning handoff`}
                                onChange={(event) =>
                                  toggleSelectedReviewItem(item.id, event.target.checked)
                                }
                              />
                              <span>Plan</span>
                            </label>
                          ) : null}
                          <div className="review-chip-row">
                            <span className={`queue-chip queue-${item.dueState}`}>
                              {labelize(item.dueState)}
                        </span>
                        <span className={`review-chip review-chip-${item.severity}`}>
                          {item.severity}
                        </span>
                        <span className="review-chip">{labelize(item.source)}</span>
                      </div>
                      <h2>{item.title}</h2>
                      <p>{item.detail}</p>
                    </div>
                    <div className="review-row-actions">
                      <button type="button" onClick={() => setExpandedItemId(item.id)}>
                        {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                        {isExpanded ? 'Reviewing' : 'Review'}
                      </button>
                      {item.projectId ? (
                        <button
                          type="button"
                          onClick={() => onSelectProject(item.projectId!)}
                        >
                          Open project
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="activity-meta">
                    {item.projectName ? <span>{item.projectName}</span> : null}
                    {item.sectionName ? <span>{item.sectionName}</span> : null}
                    {item.groupName ? <span>{item.groupName}</span> : null}
                    {item.occurredAt && isExpanded ? (
                      <span>{formatDateTimeLabel(item.occurredAt)}</span>
                    ) : null}
                    {item.meta.slice(0, isExpanded ? 4 : 2).map((meta, metaIndex) => (
                      <span key={`${item.id}-${meta}-${metaIndex}`}>{meta}</span>
                    ))}
                  </div>

                  {isExpanded ? (
                    <>
                      <p className="review-reason">{item.reason}</p>
                      <div className="review-note-grid">
                        <label className="field field-full">
                          <span>Review note</span>
                          <textarea
                            aria-label={`Review note for ${item.title}`}
                            rows={2}
                            value={noteDraft}
                            onChange={(event) =>
                              setNoteDrafts((current) => ({
                                ...current,
                                [item.id]: event.target.value,
                              }))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Outcome</span>
                          <select
                            aria-label={`Review outcome for ${item.title}`}
                            value={outcome}
                            onChange={(event) =>
                              setOutcomeDrafts((current) => ({
                                ...current,
                                [item.id]: event.target.value as ReviewOutcome,
                              }))
                            }
                          >
                            <option value="noted">Noted</option>
                            <option value="needs-follow-up">Needs follow-up</option>
                            <option value="no-action">No action</option>
                            <option value="planned">Planned</option>
                          </select>
                        </label>
                      </div>

                      <div className="review-actions">
                        <button type="button" onClick={() => startSession([item])}>
                          <ClipboardList size={15} />
                          Start session
                        </button>
                        <button
                          type="button"
                          disabled={!noteDraft.trim()}
                          onClick={() => addNote(item, outcome)}
                        >
                          <NotebookPen size={15} />
                          Add review note
                        </button>
                        {item.projectId ? (
                          <button type="button" onClick={() => createPlanningNote(item)}>
                            <CalendarCheck size={15} />
                            Create planning note
                          </button>
                        ) : null}
                        {item.projectId ? (
                          <button type="button" onClick={() => onOpenPlanning(item.projectId!)}>
                            <ClipboardList size={15} />
                            Open Planning
                          </button>
                        ) : null}
                      </div>
                    </>
                  ) : null}
                </article>
              )
                })}
              </section>
            ))}
          </div>
        </div>

        <aside className="review-panel review-history">
          <div className="panel-heading">
            <NotebookPen size={17} />
            <h2>Review history</h2>
          </div>
          {latestSessions.length > 0 ? (
            <div className="review-history-list" aria-label="Review sessions">
              {latestSessions.map((session) => (
                <article key={session.id}>
                  <span>{formatDateTimeLabel(session.updatedAt)}</span>
                  <strong>{session.title}</strong>
                  <p>
                    {session.itemIds.length} item(s), {session.projectIds.length} project(s),{' '}
                    {session.outcome}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">No review sessions recorded yet.</p>
          )}

          {latestNotes.length > 0 ? (
            <div className="review-history-list" aria-label="Review notes">
              {latestNotes.map((note) => (
                <ReviewHistoryNoteCard
                  key={note.id}
                  note={note}
                  projectRecords={projectRecords}
                />
              ))}
            </div>
          ) : (
            <p className="empty-state">No review notes recorded yet.</p>
          )}
        </aside>
      </div>

      {message ? (
        <div className="data-action-message review-action-message">
          <span>{message}</span>
          {planningJumpProjectId ? (
            <button type="button" onClick={() => onOpenPlanning(planningJumpProjectId)}>
              Open Planning
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
