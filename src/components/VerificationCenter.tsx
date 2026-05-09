import { CalendarCheck, CheckCircle2, Clock3, Filter, RefreshCcw, Search, ShieldAlert } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  VERIFICATION_CADENCES,
  formatDateLabel,
  type ProjectRecord,
  type VerificationCadence,
} from '../domain/atlas'
import {
  buildVerificationQueue,
  getVerificationCadenceDefinition,
  type VerificationDueState,
} from '../services/verification'
import { StatusBadge } from './StatusBadge'

type SectionFilter = string | 'All'
type CadenceFilter = VerificationCadence | 'All'
type DueStateFilter = VerificationDueState | 'All'

interface VerificationCenterProps {
  projectRecords: ProjectRecord[]
  selectedProjectId: string
  onSelectProject: (projectId: string) => void
}

function stateLabel(state: VerificationDueState) {
  const labels: Record<VerificationDueState, string> = {
    overdue: 'Overdue',
    due: 'Due now',
    upcoming: 'Upcoming',
    recent: 'Recent',
    'ad-hoc': 'Ad hoc',
    unverified: 'Unverified',
  }

  return labels[state]
}

function dueText(state: VerificationDueState, daysUntilDue: number | null) {
  if (state === 'ad-hoc') {
    return 'No cadence'
  }

  if (state === 'unverified') {
    return 'Needs first verification'
  }

  if (daysUntilDue === null) {
    return 'Not set'
  }

  if (daysUntilDue < 0) {
    return `${Math.abs(daysUntilDue)} day${Math.abs(daysUntilDue) === 1 ? '' : 's'} overdue`
  }

  if (daysUntilDue === 0) {
    return 'Due today'
  }

  return `Due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`
}

function includesQuery(record: ProjectRecord, query: string) {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return true
  }

  return [
    record.section.name,
    record.group.name,
    record.project.name,
    record.project.summary,
    record.project.manual.nextAction,
    record.project.manual.currentRisk,
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery)
}

export function VerificationCenter({
  projectRecords,
  selectedProjectId,
  onSelectProject,
}: VerificationCenterProps) {
  const [query, setQuery] = useState('')
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('All')
  const [cadenceFilter, setCadenceFilter] = useState<CadenceFilter>('All')
  const [stateFilter, setStateFilter] = useState<DueStateFilter>('All')
  const queue = useMemo(() => buildVerificationQueue(projectRecords), [projectRecords])
  const filteredQueue = queue
    .filter(({ record }) => sectionFilter === 'All' || record.section.id === sectionFilter)
    .filter(({ evaluation }) => cadenceFilter === 'All' || evaluation.cadence === cadenceFilter)
    .filter(({ evaluation }) => stateFilter === 'All' || evaluation.dueState === stateFilter)
    .filter(({ record }) => includesQuery(record, query))

  const overdueCount = queue.filter((item) => item.evaluation.dueState === 'overdue').length
  const dueNowCount = queue.filter((item) =>
    ['due', 'unverified'].includes(item.evaluation.dueState),
  ).length
  const upcomingCount = queue.filter((item) => item.evaluation.dueState === 'upcoming').length
  const adHocCount = queue.filter((item) => item.evaluation.dueState === 'ad-hoc').length
  const recentCount = queue.filter((item) => item.evaluation.dueState === 'recent').length

  return (
    <section className="verification-center" aria-labelledby="verification-center-title">
      <div className="dashboard-header">
        <div>
          <p className="section-label">Verification Center</p>
          <h1 id="verification-center-title">Verification Queue</h1>
          <p>
            Review projects by manual cadence and last verified date. Verification is a human stamp,
            not an automatic status change.
          </p>
        </div>
        <div className="dashboard-stats" aria-label="Verification status counts">
          <div>
            <ShieldAlert size={17} />
            <strong>{overdueCount}</strong>
            <span>Overdue</span>
          </div>
          <div>
            <Clock3 size={17} />
            <strong>{dueNowCount}</strong>
            <span>Due now</span>
          </div>
          <div>
            <CalendarCheck size={17} />
            <strong>{upcomingCount}</strong>
            <span>Upcoming</span>
          </div>
          <div>
            <RefreshCcw size={17} />
            <strong>{adHocCount}</strong>
            <span>Ad hoc</span>
          </div>
          <div>
            <CheckCircle2 size={17} />
            <strong>{recentCount}</strong>
            <span>Recent</span>
          </div>
        </div>
      </div>

      <div className="verification-controls">
        <label className="search-control">
          <Search size={16} />
          <span className="sr-only">Search verification queue</span>
          <input
            type="search"
            placeholder="Search verification queue"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <label className="select-control">
          <Filter size={16} />
          <span className="sr-only">Filter by section</span>
          <select
            value={sectionFilter}
            onChange={(event) => setSectionFilter(event.target.value as SectionFilter)}
          >
            <option value="All">All sections</option>
            {[...new Map(projectRecords.map((record) => [record.section.id, record.section])).values()].map(
              (section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ),
            )}
          </select>
        </label>

        <label className="select-control">
          <Filter size={16} />
          <span className="sr-only">Filter by cadence</span>
          <select
            value={cadenceFilter}
            onChange={(event) => setCadenceFilter(event.target.value as CadenceFilter)}
          >
            <option value="All">All cadences</option>
            {VERIFICATION_CADENCES.map((cadence) => (
              <option key={cadence.id} value={cadence.id}>
                {cadence.label}
              </option>
            ))}
          </select>
        </label>

        <label className="select-control">
          <Filter size={16} />
          <span className="sr-only">Filter by due state</span>
          <select
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value as DueStateFilter)}
          >
            <option value="All">All due states</option>
            {(['overdue', 'due', 'upcoming', 'recent', 'ad-hoc', 'unverified'] as const).map(
              (state) => (
                <option key={state} value={state}>
                  {stateLabel(state)}
                </option>
              ),
            )}
          </select>
        </label>
      </div>

      <div className="verification-summary">
        <span>{filteredQueue.length} project records shown</span>
        <span>Marking verified updates the date and audit trail only.</span>
      </div>

      <div className="verification-table" aria-label="Project verification queue">
        {filteredQueue.length === 0 ? (
          <p className="empty-state">No projects match this verification view.</p>
        ) : null}

        {filteredQueue.map(({ record, evaluation }) => (
          <button
            type="button"
            key={record.project.id}
            className={`verification-row verification-${evaluation.dueState} ${
              selectedProjectId === record.project.id ? 'is-selected' : ''
            }`}
            onClick={() => onSelectProject(record.project.id)}
          >
            <div>
              <span className="section-label">
                {record.section.name} / {record.group.name}
              </span>
              <strong>{record.project.name}</strong>
              <p>{record.project.manual.currentRisk || record.project.manual.nextAction}</p>
            </div>
            <div className="verification-row-meta">
              <StatusBadge status={record.project.manual.status} />
              <span>{getVerificationCadenceDefinition(evaluation.cadence).label}</span>
              <span>{formatDateLabel(record.project.manual.lastVerified)}</span>
              <span>{evaluation.dueDate ? formatDateLabel(evaluation.dueDate) : 'No due date'}</span>
              <strong>{dueText(evaluation.dueState, evaluation.daysUntilDue)}</strong>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
