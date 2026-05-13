import {
  CalendarCheck,
  ClipboardList,
  FileText,
  GitBranch,
  NotebookPen,
  RefreshCcw,
  Search,
  ShieldAlert,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatDateTimeLabel, type ProjectRecord } from '../domain/atlas'
import type { DispatchState } from '../domain/dispatch'
import type { AtlasPlanningState } from '../domain/planning'
import {
  type ReviewDueState,
  type ReviewItemSource,
  type ReviewNote,
  type ReviewOutcome,
  type ReviewQueueItem,
  type ReviewSeverity,
  type ReviewSession,
  type ReviewState,
} from '../domain/review'
import type { ReportsState } from '../domain/reports'
import type { AtlasSyncState } from '../domain/sync'
import type { TimelineEvent } from '../domain/timeline'
import type { WritingWorkbenchState } from '../domain/writing'
import { useGithubRepositories } from '../hooks/useGithubRepositories'
import type { GithubRepositorySource, GithubRepositorySummary } from '../services/githubIntegration'
import { deriveRepoPlacementSuggestions } from '../services/repoSuggestions'
import {
  createReviewNote,
  createReviewSession,
  deriveReviewQueue,
  summarizeReviewQueue,
  summarizeReviewState,
} from '../services/review'

type ReviewSourceFilter = ReviewItemSource | 'all'
type ReviewSeverityFilter = ReviewSeverity | 'all'
type ReviewDueFilter = ReviewDueState | 'all'
type SectionFilter = string | 'all'

interface IntakeRepository {
  repository: GithubRepositorySummary
  sources: GithubRepositorySource[]
}

interface ReviewCenterProps {
  review: ReviewState
  projectRecords: ProjectRecord[]
  dispatch: DispatchState
  planning: AtlasPlanningState
  reports: ReportsState
  writing: WritingWorkbenchState
  sync: AtlasSyncState
  timelineEvents: TimelineEvent[]
  onSelectProject: (projectId: string) => void
  onAddReviewSession: (session: ReviewSession) => void
  onAddReviewNote: (note: ReviewNote) => void
  onCreatePlanningNote: (projectId: string, title: string, detail: string) => void
  onOpenGitHub: () => void
  onOpenPlanning: (projectId: string) => void
}

const sourceOptions: ReviewSourceFilter[] = [
  'all',
  'verification',
  'dispatch',
  'workspace',
  'github',
  'timeline',
  'planning',
  'writing',
  'reports',
  'data-sync',
]

const severityOptions: ReviewSeverityFilter[] = ['all', 'critical', 'high', 'medium', 'low']
const dueOptions: ReviewDueFilter[] = [
  'all',
  'overdue',
  'due',
  'upcoming',
  'blocked',
  'attention',
  'none',
]

function labelize(value: string) {
  if (value === 'all') {
    return 'All'
  }

  return value
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
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

function SourceNotice({
  label,
  loading,
  error,
}: {
  label: string
  loading: boolean
  error: ReturnType<typeof useGithubRepositories>['error']
}) {
  if (loading) {
    return (
      <div className="review-source-notice">
        <RefreshCcw size={15} />
        <span>{label} loading...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="review-source-notice review-source-warning">
        <ShieldAlert size={15} />
        <span>{label}: {error.message}</span>
      </div>
    )
  }

  return null
}

export function ReviewCenter({
  review,
  projectRecords,
  dispatch,
  planning,
  reports,
  writing,
  sync,
  timelineEvents,
  onSelectProject,
  onAddReviewSession,
  onAddReviewNote,
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
      }),
    [dispatch, planning, projectRecords, repoSuggestions, reports, sync, timelineEvents, writing],
  )
  const filteredQueue = queue
    .filter((item) => sectionFilter === 'all' || item.sectionId === sectionFilter)
    .filter((item) => sourceFilter === 'all' || item.source === sourceFilter)
    .filter((item) => severityFilter === 'all' || item.severity === severityFilter)
    .filter((item) => dueFilter === 'all' || item.dueState === dueFilter)
    .filter((item) => itemMatchesQuery(item, query))
  const summary = useMemo(() => summarizeReviewQueue(queue), [queue])
  const reviewSummary = useMemo(() => summarizeReviewState(review), [review])
  const sections = useMemo(
    () => [...new Map(projectRecords.map((record) => [record.section.id, record.section])).values()],
    [projectRecords],
  )
  const latestSessions = review.sessions.slice(0, 5)
  const latestNotes = review.notes.slice(0, 5)

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
    setMessage('Review session started locally.')
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
    setMessage('Review note captured locally.')
  }

  function createPlanningNote(item: ReviewQueueItem) {
    const body =
      noteDrafts[item.id]?.trim() ||
      `${item.title}\n\nReason: ${item.reason}\n\nDetail: ${item.detail}`

    if (!item.projectId) {
      return
    }

    onCreatePlanningNote(item.projectId, `Review follow-up: ${item.title}`, body)
    onAddReviewNote(
      createReviewNote({
        itemId: item.id,
        projectId: item.projectId,
        source: item.source,
        outcome: 'planned',
        body: `Created explicit Planning note from Review Center.\n\n${body}`,
      }),
    )
    setNoteDrafts((current) => ({ ...current, [item.id]: '' }))
    setMessage('Planning note created from Review. Project operational status was not changed.')
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
            <span>Unbound repos</span>
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
      </div>

      <div className="review-layout">
        <aside className="review-panel">
          <div className="panel-heading">
            <ClipboardList size={17} />
            <h2>Review controls</h2>
          </div>
          <div className="field-grid">
            <label className="field field-full">
              <span>Search review queue</span>
              <div className="search-control">
                <Search size={16} />
                <input
                  aria-label="Search review queue"
                  type="search"
                  placeholder="Search review queue"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </label>
            <label className="field">
              <span>Section</span>
              <select
                aria-label="Filter review section"
                value={sectionFilter}
                onChange={(event) => setSectionFilter(event.target.value as SectionFilter)}
              >
                <option value="all">All sections</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Source</span>
              <select
                aria-label="Filter review source"
                value={sourceFilter}
                onChange={(event) => setSourceFilter(event.target.value as ReviewSourceFilter)}
              >
                {sourceOptions.map((source) => (
                  <option key={source} value={source}>
                    {labelize(source)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Severity</span>
              <select
                aria-label="Filter review severity"
                value={severityFilter}
                onChange={(event) =>
                  setSeverityFilter(event.target.value as ReviewSeverityFilter)
                }
              >
                {severityOptions.map((severity) => (
                  <option key={severity} value={severity}>
                    {labelize(severity)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Due state</span>
              <select
                aria-label="Filter review due state"
                value={dueFilter}
                onChange={(event) => setDueFilter(event.target.value as ReviewDueFilter)}
              >
                {dueOptions.map((dueState) => (
                  <option key={dueState} value={dueState}>
                    {labelize(dueState)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="review-actions">
            <button type="button" onClick={() => startSession(filteredQueue.slice(0, 20))}>
              <ClipboardList size={15} />
              Start review session
            </button>
            <button type="button" onClick={onOpenGitHub}>
              <GitBranch size={15} />
              Open GitHub intake
            </button>
          </div>
          <p className="empty-state">
            Starting a session records what the operator reviewed. It does not change source-of-truth
            project, Dispatch, Verification, Writing, Reports, or Sync state.
          </p>
        </aside>

        <div className="review-main">
          <div className="review-summary">
            <span>{filteredQueue.length} review items shown</span>
            <span>
              Sessions {reviewSummary.sessions} / Notes {reviewSummary.notes} / Follow-ups{' '}
              {reviewSummary.followUps}
            </span>
          </div>

          <div className="review-queue" aria-label="Operator review queue">
            {filteredQueue.length === 0 ? (
              <p className="empty-state">No review items match this view.</p>
            ) : null}

            {filteredQueue.map((item) => {
              const outcome = outcomeDrafts[item.id] ?? 'noted'
              const noteDraft = noteDrafts[item.id] ?? ''

              return (
                <article key={item.id} className={`review-item review-severity-${item.severity}`}>
                  <div className="review-item-heading">
                    <div>
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
                    {item.projectId ? (
                      <button
                        type="button"
                        onClick={() => onSelectProject(item.projectId!)}
                      >
                        Open project
                      </button>
                    ) : null}
                  </div>

                  <p className="review-reason">{item.reason}</p>
                  <div className="activity-meta">
                    {item.projectName ? <span>{item.projectName}</span> : null}
                    {item.sectionName ? <span>{item.sectionName}</span> : null}
                    {item.groupName ? <span>{item.groupName}</span> : null}
                    {item.occurredAt ? <span>{formatDateTimeLabel(item.occurredAt)}</span> : null}
                    {item.meta.slice(0, 4).map((meta, metaIndex) => (
                      <span key={`${item.id}-${meta}-${metaIndex}`}>{meta}</span>
                    ))}
                  </div>

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
                    <button type="button" disabled={!noteDraft.trim()} onClick={() => addNote(item, outcome)}>
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
                </article>
              )
            })}
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
              {latestNotes.map((note) => {
                const link = note.projectId
                  ? projectRecords.find((record) => record.project.id === note.projectId)
                  : undefined

                return (
                  <article key={note.id}>
                    <span>{formatDateTimeLabel(note.createdAt)}</span>
                    <strong>{link?.project.name ?? labelize(note.source)}</strong>
                    <p>{note.body}</p>
                    <small>{labelize(note.outcome)}</small>
                  </article>
                )
              })}
            </div>
          ) : (
            <p className="empty-state">No review notes recorded yet.</p>
          )}
        </aside>
      </div>

      {message ? <p className="data-action-message">{message}</p> : null}
    </section>
  )
}
