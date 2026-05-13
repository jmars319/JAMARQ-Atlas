import { ClipboardList, GitBranch, NotebookPen, RefreshCcw, Search, ShieldAlert } from 'lucide-react'
import type { ProjectRecord } from '../domain/atlas'
import type {
  ReviewDueState,
  ReviewItemSource,
  ReviewSavedFilter,
  ReviewSeverity,
  ReviewSessionPresetId,
} from '../domain/review'
import { REVIEW_SESSION_PRESETS } from '../services/review'
import type { useGithubRepositories } from '../hooks/useGithubRepositories'

export type ReviewSourceFilter = ReviewItemSource | 'all'
export type ReviewSeverityFilter = ReviewSeverity | 'all'
export type ReviewDueFilter = ReviewDueState | 'all'
export type SectionFilter = string | 'all'

export const sourceOptions: ReviewSourceFilter[] = [
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

export const severityOptions: ReviewSeverityFilter[] = ['all', 'critical', 'high', 'medium', 'low']
export const dueOptions: ReviewDueFilter[] = [
  'all',
  'overdue',
  'due',
  'upcoming',
  'blocked',
  'attention',
  'none',
]

export function labelize(value: string) {
  if (value === 'all') {
    return 'All'
  }

  return value
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

export function SourceNotice({
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
        <span>
          {label}: {error.message}
        </span>
      </div>
    )
  }

  return null
}

export function ReviewControlsPanel({
  query,
  sectionFilter,
  sourceFilter,
  severityFilter,
  dueFilter,
  sections,
  savedFilters,
  onQueryChange,
  onSectionFilterChange,
  onSourceFilterChange,
  onSeverityFilterChange,
  onDueFilterChange,
  onStartReviewSession,
  onSaveFilter,
  onOpenGitHub,
  onStartPresetSession,
  onApplySavedFilter,
  onDeleteSavedFilter,
}: {
  query: string
  sectionFilter: SectionFilter
  sourceFilter: ReviewSourceFilter
  severityFilter: ReviewSeverityFilter
  dueFilter: ReviewDueFilter
  sections: ProjectRecord['section'][]
  savedFilters: ReviewSavedFilter[]
  onQueryChange: (query: string) => void
  onSectionFilterChange: (filter: SectionFilter) => void
  onSourceFilterChange: (filter: ReviewSourceFilter) => void
  onSeverityFilterChange: (filter: ReviewSeverityFilter) => void
  onDueFilterChange: (filter: ReviewDueFilter) => void
  onStartReviewSession: () => void
  onSaveFilter: () => void
  onOpenGitHub: () => void
  onStartPresetSession: (presetId: ReviewSessionPresetId) => void
  onApplySavedFilter: (filter: ReviewSavedFilter) => void
  onDeleteSavedFilter: (filterId: string) => void
}) {
  return (
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
              onChange={(event) => onQueryChange(event.target.value)}
            />
          </div>
        </label>
        <label className="field">
          <span>Section</span>
          <select
            aria-label="Filter review section"
            value={sectionFilter}
            onChange={(event) => onSectionFilterChange(event.target.value as SectionFilter)}
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
            onChange={(event) => onSourceFilterChange(event.target.value as ReviewSourceFilter)}
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
              onSeverityFilterChange(event.target.value as ReviewSeverityFilter)
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
            onChange={(event) => onDueFilterChange(event.target.value as ReviewDueFilter)}
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
        <button type="button" onClick={onStartReviewSession}>
          <ClipboardList size={15} />
          Start review session
        </button>
        <button type="button" onClick={onSaveFilter}>
          <NotebookPen size={15} />
          Save filter
        </button>
        <button type="button" onClick={onOpenGitHub}>
          <GitBranch size={15} />
          Open GitHub intake
        </button>
      </div>
      <div className="review-preset-grid" aria-label="Review session presets">
        {REVIEW_SESSION_PRESETS.map((preset) => (
          <button key={preset.id} type="button" onClick={() => onStartPresetSession(preset.id)}>
            <strong>{preset.label}</strong>
            <span>{preset.detail}</span>
          </button>
        ))}
      </div>
      {savedFilters.length > 0 ? (
        <div className="review-history-list" aria-label="Saved review filters">
          {savedFilters.slice(0, 6).map((filter) => (
            <article key={filter.id}>
              <strong>{filter.label}</strong>
              <p>
                {labelize(filter.sourceFilter)} / {labelize(filter.severityFilter)} /{' '}
                {labelize(filter.dueFilter)}
              </p>
              <div className="review-actions">
                <button type="button" onClick={() => onApplySavedFilter(filter)}>
                  Apply
                </button>
                <button type="button" onClick={() => onDeleteSavedFilter(filter.id)}>
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      <p className="empty-state">
        Starting a session records what the operator reviewed. It does not change source-of-truth
        project, Dispatch, Verification, Writing, Reports, or Sync state.
      </p>
    </aside>
  )
}
