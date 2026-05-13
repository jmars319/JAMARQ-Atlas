import { CalendarDays, Filter, GitBranch, ListTree, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ProjectRecord } from '../domain/atlas'
import type { TimelineEvent, TimelineEventSource, TimelineEventType } from '../domain/timeline'
import { defaultTimelineFilters, filterTimelineEvents } from '../services/timeline'
import { TimelineEventList } from './TimelineEventList'

const sourceOptions: Array<TimelineEventSource | 'all'> = [
  'all',
  'workspace',
  'verification',
  'dispatch',
  'writing',
  'planning',
  'reports',
  'review',
  'calibration',
  'sync',
  'github',
]

const typeOptions: Array<TimelineEventType | 'all'> = [
  'all',
  'activity',
  'verification',
  'deployment',
  'preflight',
  'writing',
  'planning',
  'report',
  'review',
  'calibration',
  'sync',
  'github',
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

function countBy(events: TimelineEvent[], key: keyof Pick<TimelineEvent, 'source' | 'type'>) {
  return events.reduce<Record<string, number>>((counts, event) => {
    counts[event[key]] = (counts[event[key]] ?? 0) + 1
    return counts
  }, {})
}

export function TimelineDashboard({
  events,
  projectRecords,
  selectedProjectId,
  onSelectProject,
}: {
  events: TimelineEvent[]
  projectRecords: ProjectRecord[]
  selectedProjectId: string
  onSelectProject: (projectId: string) => void
}) {
  const [filters, setFilters] = useState(defaultTimelineFilters)
  const filteredEvents = useMemo(() => filterTimelineEvents(events, filters), [events, filters])
  const sourceCounts = useMemo(() => countBy(events, 'source'), [events])
  const typeCounts = useMemo(() => countBy(events, 'type'), [events])

  return (
    <section className="timeline-dashboard" aria-labelledby="timeline-title">
      <div className="dashboard-header">
        <div>
          <p className="section-label">Evidence Ledger</p>
          <h1 id="timeline-title">Timeline</h1>
          <p>
            Review derived evidence across Atlas stores. Timeline rows are advisory and do not
            change project status, readiness, verification, or writing state.
          </p>
        </div>
        <div className="dashboard-stats" aria-label="Timeline evidence counts">
          <div>
            <ListTree size={17} />
            <strong>{events.length}</strong>
            <span>Total rows</span>
          </div>
          <div>
            <GitBranch size={17} />
            <strong>{sourceCounts.github ?? 0}</strong>
            <span>GitHub</span>
          </div>
          <div>
            <CalendarDays size={17} />
            <strong>{typeCounts.verification ?? 0}</strong>
            <span>Verification</span>
          </div>
        </div>
      </div>

      <div className="timeline-controls">
        <label className="search-control">
          <Search size={16} />
          <span className="sr-only">Search timeline</span>
          <input
            type="search"
            placeholder="Search timeline"
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
          />
        </label>

        <label className="repo-selector">
          <Filter size={16} />
          <span className="sr-only">Filter timeline project</span>
          <select
            aria-label="Filter timeline project"
            value={filters.projectId}
            onChange={(event) => {
              const projectId = event.target.value
              setFilters((current) => ({ ...current, projectId }))
              if (projectId !== 'all') {
                onSelectProject(projectId)
              }
            }}
          >
            <option value="all">All projects</option>
            {projectRecords.map((record) => (
              <option key={record.project.id} value={record.project.id}>
                {record.project.name}
              </option>
            ))}
          </select>
        </label>

        <label className="repo-selector">
          <Filter size={16} />
          <span className="sr-only">Filter timeline section</span>
          <select
            aria-label="Filter timeline section"
            value={filters.sectionId}
            onChange={(event) =>
              setFilters((current) => ({ ...current, sectionId: event.target.value }))
            }
          >
            <option value="all">All sections</option>
            {Array.from(new Map(projectRecords.map((record) => [record.section.id, record.section])).values()).map(
              (section) => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ),
            )}
          </select>
        </label>

        <label className="repo-selector">
          <Filter size={16} />
          <span className="sr-only">Filter timeline source</span>
          <select
            aria-label="Filter timeline source"
            value={filters.source}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                source: event.target.value as TimelineEventSource | 'all',
              }))
            }
          >
            {sourceOptions.map((source) => (
              <option key={source} value={source}>
                {labelize(source)}
              </option>
            ))}
          </select>
        </label>

        <label className="repo-selector">
          <Filter size={16} />
          <span className="sr-only">Filter timeline type</span>
          <select
            aria-label="Filter timeline type"
            value={filters.type}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                type: event.target.value as TimelineEventType | 'all',
              }))
            }
          >
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {labelize(type)}
              </option>
            ))}
          </select>
        </label>

        <label className="repo-selector">
          <CalendarDays size={16} />
          <span className="sr-only">Filter timeline date range</span>
          <select
            aria-label="Filter timeline date range"
            value={filters.dateRange}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                dateRange: event.target.value as typeof filters.dateRange,
              }))
            }
          >
            <option value="all">All time</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
          </select>
        </label>
      </div>

      <section className="timeline-panel" aria-label="Timeline evidence rows">
        <div className="resource-panel-header">
          <div>
            <strong>Evidence Rows</strong>
            <span>
              {filteredEvents.length} shown
              {selectedProjectId ? ` / selected project ${selectedProjectId}` : ''}
            </span>
          </div>
        </div>
        <TimelineEventList events={filteredEvents} />
      </section>
    </section>
  )
}
