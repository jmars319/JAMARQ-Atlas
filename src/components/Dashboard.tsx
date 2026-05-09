import {
  Archive,
  CheckCircle2,
  CircleDot,
  Clock3,
  Filter,
  Search,
  ShieldAlert,
} from 'lucide-react'
import {
  WORK_STATUSES,
  formatDateLabel,
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

  const visibleProjectIds = new Set(
    projectRecords
      .filter((record) => sectionFilter === 'All' || record.section.id === sectionFilter)
      .filter((record) => statusFilter === 'All' || record.project.manual.status === statusFilter)
      .filter((record) => includesQuery(record, query))
      .map((record) => record.project.id),
  )

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
            placeholder="Search sections, projects, risks, actions"
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

      <div className="section-stack">
        {workspace.sections.map((section) => {
          const sectionHidden = sectionFilter !== 'All' && sectionFilter !== section.id
          const visibleCount = section.groups.reduce(
            (count, group) =>
              count +
              group.projects.filter((candidate) => visibleProjectIds.has(candidate.id)).length,
            0,
          )

          if (sectionHidden) {
            return null
          }

          return (
            <section className="portfolio-section" key={section.id}>
              <div className="portfolio-heading">
                <div>
                  <p className="section-label">Section</p>
                  <h2>{section.name}</h2>
                  <p>{section.summary}</p>
                </div>
                <span>{visibleCount} shown</span>
              </div>

              {visibleCount === 0 ? (
                <p className="empty-state">No matching projects in this section.</p>
              ) : null}

              {section.groups.map((group) => {
                const visibleProjects = group.projects.filter((candidate) =>
                  visibleProjectIds.has(candidate.id),
                )

                if (visibleProjects.length === 0) {
                  return null
                }

                return (
                  <div className="project-group" key={group.id}>
                    <div className="group-heading">
                      <div>
                        <h3>{group.name}</h3>
                        <p>{group.summary}</p>
                      </div>
                      <span>{visibleProjects.length}</span>
                    </div>

                    <div className="project-list">
                      {visibleProjects.map((candidate) => (
                        <button
                          type="button"
                          className={`project-row ${
                            selectedProjectId === candidate.id ? 'is-selected' : ''
                          }`}
                          key={candidate.id}
                          onClick={() => onSelectProject(candidate.id)}
                        >
                          <div className="project-main">
                            <StatusBadge status={candidate.manual.status} />
                            <div>
                              <strong>{candidate.name}</strong>
                              <span>{candidate.summary}</span>
                            </div>
                          </div>
                          <div className="project-meta">
                            <span>{candidate.kind}</span>
                            <span>{formatDateLabel(candidate.manual.lastVerified)}</span>
                          </div>
                          <div className="project-next">
                            <span>Next</span>
                            <strong>{candidate.manual.nextAction}</strong>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>
    </section>
  )
}
