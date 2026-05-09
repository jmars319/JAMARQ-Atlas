import {
  Archive,
  CheckCircle2,
  CircleDot,
  Clock3,
  Filter,
  GitBranch,
  Search,
  ShieldAlert,
} from 'lucide-react'
import {
  WORK_STATUSES,
  formatDateLabel,
  statusToneClass,
  type ProjectRecord,
  type WorkStatus,
  type Workspace,
} from '../domain/atlas'
import { StatusBadge } from './StatusBadge'

type StatusFilter = WorkStatus | 'All'
type SectionFilter = string | 'All'

interface DashboardProps {
  workspace: Workspace
  projectRecords: ProjectRecord[]
  selectedProjectId: string
  query: string
  statusFilter: StatusFilter
  sectionFilter: SectionFilter
  onSelectProject: (projectId: string) => void
  onQueryChange: (query: string) => void
  onStatusFilterChange: (status: StatusFilter) => void
  onSectionFilterChange: (sectionId: SectionFilter) => void
}

function includesQuery(record: ProjectRecord, query: string): boolean {
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

function countByStatus(projectRecords: ProjectRecord[], status: WorkStatus): number {
  return projectRecords.filter((record) => record.project.manual.status === status).length
}

function visibleRecords({
  projectRecords,
  sectionFilter,
  statusFilter,
  query,
}: {
  projectRecords: ProjectRecord[]
  sectionFilter: SectionFilter
  statusFilter: StatusFilter
  query: string
}) {
  return projectRecords
    .filter((record) => sectionFilter === 'All' || record.section.id === sectionFilter)
    .filter((record) => statusFilter === 'All' || record.project.manual.status === statusFilter)
    .filter((record) => includesQuery(record, query))
}

export function Dashboard({
  workspace,
  projectRecords,
  selectedProjectId,
  query,
  statusFilter,
  sectionFilter,
  onSelectProject,
  onQueryChange,
  onStatusFilterChange,
  onSectionFilterChange,
}: DashboardProps) {
  const activeCount = countByStatus(projectRecords, 'Active')
  const waitingCount = countByStatus(projectRecords, 'Waiting')
  const verificationCount = countByStatus(projectRecords, 'Verification')
  const stableCount = countByStatus(projectRecords, 'Stable')
  const archivedCount = countByStatus(projectRecords, 'Archived')
  const records = visibleRecords({ projectRecords, sectionFilter, statusFilter, query })

  return (
    <section className="dashboard" aria-labelledby="dashboard-title">
      <div className="dashboard-header">
        <div>
          <p className="section-label">Workspace</p>
          <h1 id="dashboard-title">{workspace.name}</h1>
          <p>{workspace.purpose}</p>
        </div>
        <div className="dashboard-stats" aria-label="Workspace status counts">
          <div>
            <CircleDot size={16} />
            <strong>{activeCount}</strong>
            <span>Active</span>
          </div>
          <div>
            <Clock3 size={16} />
            <strong>{waitingCount}</strong>
            <span>Waiting</span>
          </div>
          <div>
            <ShieldAlert size={16} />
            <strong>{verificationCount}</strong>
            <span>Verify</span>
          </div>
          <div>
            <CheckCircle2 size={16} />
            <strong>{stableCount}</strong>
            <span>Stable</span>
          </div>
          <div>
            <Archive size={16} />
            <strong>{archivedCount}</strong>
            <span>Archived</span>
          </div>
        </div>
      </div>

      <div className="control-bar">
        <label className="search-control">
          <Search size={16} />
          <span className="sr-only">Search projects</span>
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search projects, risks, actions"
          />
        </label>

        <label className="select-control">
          <Filter size={16} />
          <span className="sr-only">Filter by section</span>
          <select
            value={sectionFilter}
            onChange={(event) => onSectionFilterChange(event.target.value as SectionFilter)}
          >
            <option value="All">All sections</option>
            {workspace.sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.name}
              </option>
            ))}
          </select>
        </label>

        <label className="select-control">
          <Filter size={16} />
          <span className="sr-only">Filter by status</span>
          <select
            value={statusFilter}
            onChange={(event) => onStatusFilterChange(event.target.value as StatusFilter)}
          >
            <option value="All">All statuses</option>
            {WORK_STATUSES.map((status) => (
              <option key={status.id} value={status.id}>
                {status.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="status-strip">
        {WORK_STATUSES.map((status) => (
          <button
            type="button"
            key={status.id}
            className={statusFilter === status.id ? 'is-selected' : ''}
            onClick={() => onStatusFilterChange(statusFilter === status.id ? 'All' : status.id)}
          >
            <span>{status.label}</span>
            <strong>{countByStatus(projectRecords, status.id)}</strong>
          </button>
        ))}
      </div>

      <div className="board-summary">
        <span>{records.length} project records shown</span>
        <span>Manual status drives the board. GitHub activity is advisory.</span>
      </div>

      <div className="kanban-board" aria-label="Atlas status board">
        {WORK_STATUSES.map((status) => {
          const laneRecords = records.filter((record) => record.project.manual.status === status.id)
          const laneId = `${status.id.toLowerCase().replaceAll(' ', '-')}-lane`

          if (statusFilter !== 'All' && statusFilter !== status.id) {
            return null
          }

          return (
            <section className="kanban-lane" key={status.id} aria-labelledby={laneId}>
              <div className="lane-heading">
                <div>
                  <span className={`lane-dot ${statusToneClass(status.id)}`} />
                  <h2 id={laneId}>{status.label}</h2>
                </div>
                <strong>{laneRecords.length}</strong>
              </div>

              <div className="lane-cards">
                {laneRecords.length === 0 ? (
                  <p className="empty-state">No matching work in this lane.</p>
                ) : null}

                {laneRecords.map((record) => (
                  <button
                    type="button"
                    className={`project-card project-row ${
                      selectedProjectId === record.project.id ? 'is-selected' : ''
                    }`}
                    key={record.project.id}
                    onClick={() => onSelectProject(record.project.id)}
                  >
                    <div className="card-topline">
                      <StatusBadge status={record.project.manual.status} />
                      {record.project.repositories.length > 0 ? (
                        <span className="repo-count">
                          <GitBranch size={13} />
                          {record.project.repositories.length}
                        </span>
                      ) : null}
                    </div>
                    <strong>{record.project.name}</strong>
                    <span className="card-context">
                      {record.section.name} / {record.group.name}
                    </span>
                    <p>{record.project.manual.nextAction}</p>
                    <div className="card-footer">
                      <span>{record.project.kind}</span>
                      <span>{formatDateLabel(record.project.manual.lastVerified)}</span>
                    </div>
                    {record.project.manual.currentRisk ? (
                      <span className="risk-line">{record.project.manual.currentRisk}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </section>
  )
}
