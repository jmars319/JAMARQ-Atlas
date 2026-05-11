import { CalendarDays, ClipboardList, Filter, NotebookPen, Search, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatDateLabel, type ProjectRecord } from '../domain/atlas'
import {
  PLANNING_ITEM_KINDS,
  PLANNING_STATUSES,
  type PlanningItem,
  type PlanningItemKind,
  type PlanningState,
  type PlanningStatus,
} from '../domain/planning'
import { summarizePlanningState, type PlanningItemUpdate } from '../services/planning'

type PlanningFilter = PlanningItemKind | 'all'
type PlanningStatusFilter = PlanningStatus | 'all'
type SectionFilter = string | 'all'

interface PlanningCenterProps {
  planning: PlanningState
  projectRecords: ProjectRecord[]
  selectedProjectId: string
  onSelectProject: (projectId: string) => void
  onCreateItem: (input: {
    kind: PlanningItemKind
    record: ProjectRecord
    title: string
    detail: string
    date?: string
    status?: PlanningStatus
  }) => void
  onUpdateItem: (kind: PlanningItemKind, itemId: string, update: PlanningItemUpdate) => void
  onDeleteItem: (kind: PlanningItemKind, itemId: string) => void
}

interface PlanningRecordRow {
  item: PlanningItem
  record: ProjectRecord | undefined
}

function kindLabel(kind: PlanningItemKind) {
  return PLANNING_ITEM_KINDS.find((itemKind) => itemKind.id === kind)?.label ?? kind
}

function statusLabel(status: PlanningStatus) {
  return PLANNING_STATUSES.find((definition) => definition.id === status)?.label ?? status
}

function getItemDateLabel(item: PlanningItem) {
  if (item.kind === 'objective') {
    return 'Target date'
  }

  if (item.kind === 'milestone') {
    return 'Due date'
  }

  if (item.kind === 'work-session') {
    return 'Scheduled for'
  }

  return 'Updated'
}

function getItemDateValue(item: PlanningItem) {
  if (item.kind === 'objective') {
    return item.targetDate
  }

  if (item.kind === 'milestone') {
    return item.dueDate
  }

  if (item.kind === 'work-session') {
    return item.scheduledFor
  }

  return item.updatedAt
}

function getDateUpdate(kind: PlanningItemKind, value: string): PlanningItemUpdate {
  if (kind === 'objective') {
    return { targetDate: value }
  }

  if (kind === 'milestone') {
    return { dueDate: value }
  }

  if (kind === 'work-session') {
    return { scheduledFor: value }
  }

  return {}
}

function itemMatchesQuery(row: PlanningRecordRow, query: string) {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return true
  }

  return [
    row.record?.section.name,
    row.record?.group.name,
    row.record?.project.name,
    row.item.title,
    row.item.detail,
    row.item.kind === 'note' ? row.item.body : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(normalizedQuery)
}

function buildPlanningRows(
  planning: PlanningState,
  projectRecords: ProjectRecord[],
): PlanningRecordRow[] {
  const recordsByProject = new Map(
    projectRecords.map((record) => [record.project.id, record] as const),
  )

  return [
    ...planning.objectives,
    ...planning.milestones,
    ...planning.workSessions,
    ...planning.notes,
  ]
    .map((item) => ({ item, record: recordsByProject.get(item.projectId) }))
    .sort((left, right) => right.item.updatedAt.localeCompare(left.item.updatedAt))
}

function PlanningItemCard({
  row,
  onUpdateItem,
  onDeleteItem,
}: {
  row: PlanningRecordRow
  onUpdateItem: PlanningCenterProps['onUpdateItem']
  onDeleteItem: PlanningCenterProps['onDeleteItem']
}) {
  const { item, record } = row
  const dateValue = getItemDateValue(item)

  return (
    <article className={`planning-card planning-status-${item.status}`}>
      <div className="planning-card-heading">
        <div>
          <span className="section-label">
            {kindLabel(item.kind)} / {record?.section.name ?? 'Unknown section'} /{' '}
            {record?.group.name ?? 'Unknown group'}
          </span>
          <strong>{item.title}</strong>
          <span>{record?.project.name ?? item.projectId}</span>
        </div>
        <button
          type="button"
          className="icon-action"
          aria-label={`Delete planning item ${item.title}`}
          onClick={() => onDeleteItem(item.kind, item.id)}
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="field-grid planning-card-fields">
        <label className="field">
          <span>Planning title</span>
          <input
            value={item.title}
            onChange={(event) =>
              onUpdateItem(item.kind, item.id, { title: event.target.value })
            }
          />
        </label>

        <label className="field">
          <span>Planning status</span>
          <select
            value={item.status}
            onChange={(event) =>
              onUpdateItem(item.kind, item.id, {
                status: event.target.value as PlanningStatus,
              })
            }
          >
            {PLANNING_STATUSES.map((status) => (
              <option key={status.id} value={status.id}>
                {status.label}
              </option>
            ))}
          </select>
        </label>

        {item.kind !== 'note' ? (
          <label className="field">
            <span>{getItemDateLabel(item)}</span>
            <input
              type="date"
              value={dateValue}
              onChange={(event) =>
                onUpdateItem(item.kind, item.id, getDateUpdate(item.kind, event.target.value))
              }
            />
          </label>
        ) : null}

        {item.kind === 'work-session' ? (
          <label className="field">
            <span>Completed date</span>
            <input
              type="date"
              value={item.completedAt}
              onChange={(event) =>
                onUpdateItem(item.kind, item.id, { completedAt: event.target.value })
              }
            />
          </label>
        ) : null}

        <label className="field field-full">
          <span>{item.kind === 'note' ? 'Planning note' : 'Planning detail'}</span>
          <textarea
            rows={3}
            value={item.kind === 'note' ? item.body : item.detail}
            onChange={(event) =>
              onUpdateItem(item.kind, item.id, {
                detail: event.target.value,
                body: item.kind === 'note' ? event.target.value : undefined,
              })
            }
          />
        </label>
      </div>

      <div className="planning-card-meta">
        <span>{statusLabel(item.status)}</span>
        <span>
          {getItemDateLabel(item)}: {formatDateLabel(dateValue)}
        </span>
      </div>
    </article>
  )
}

export function PlanningCenter({
  planning,
  projectRecords,
  selectedProjectId,
  onSelectProject,
  onCreateItem,
  onUpdateItem,
  onDeleteItem,
}: PlanningCenterProps) {
  const [query, setQuery] = useState('')
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('all')
  const [kindFilter, setKindFilter] = useState<PlanningFilter>('all')
  const [statusFilter, setStatusFilter] = useState<PlanningStatusFilter>('all')
  const [draftKind, setDraftKind] = useState<PlanningItemKind>('objective')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDetail, setDraftDetail] = useState('')
  const [draftDate, setDraftDate] = useState('')
  const [draftStatus, setDraftStatus] = useState<PlanningStatus>('planned')
  const selectedRecord =
    projectRecords.find((record) => record.project.id === selectedProjectId) ?? projectRecords[0]
  const summary = useMemo(() => summarizePlanningState(planning), [planning])
  const rows = useMemo(() => buildPlanningRows(planning, projectRecords), [planning, projectRecords])
  const filteredRows = rows
    .filter((row) => kindFilter === 'all' || row.item.kind === kindFilter)
    .filter((row) => statusFilter === 'all' || row.item.status === statusFilter)
    .filter((row) => sectionFilter === 'all' || row.record?.section.id === sectionFilter)
    .filter((row) => itemMatchesQuery(row, query))

  function handleCreate() {
    if (!selectedRecord || !draftTitle.trim()) {
      return
    }

    onCreateItem({
      kind: draftKind,
      record: selectedRecord,
      title: draftTitle,
      detail: draftDetail,
      date: draftDate,
      status: draftStatus,
    })
    setDraftTitle('')
    setDraftDetail('')
    setDraftDate('')
  }

  return (
    <section className="planning-center" aria-labelledby="planning-center-title">
      <div className="dashboard-header">
        <div>
          <p className="section-label">Planning Center</p>
          <h1 id="planning-center-title">Planning Center</h1>
          <p>
            Track human-authored objectives, milestones, work sessions, and planning notes without
            letting GitHub, Dispatch, Verification, or AI make planning decisions.
          </p>
        </div>
        <div className="dashboard-stats" aria-label="Planning counts">
          <div>
            <ClipboardList size={17} />
            <strong>{summary.objectives}</strong>
            <span>Objectives</span>
          </div>
          <div>
            <CalendarDays size={17} />
            <strong>{summary.milestones}</strong>
            <span>Milestones</span>
          </div>
          <div>
            <NotebookPen size={17} />
            <strong>{summary.workSessions}</strong>
            <span>Work sessions</span>
          </div>
          <div>
            <NotebookPen size={17} />
            <strong>{summary.notes}</strong>
            <span>Notes</span>
          </div>
        </div>
      </div>

      <div className="planning-layout">
        <aside className="planning-panel" aria-label="Create planning item">
          <div className="panel-heading">
            <ClipboardList size={17} />
            <h2>Create planning record</h2>
          </div>

          <div className="field-grid">
            <label className="field field-full">
              <span>Planning project</span>
              <select
                aria-label="Planning project"
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

            <label className="field">
              <span>Planning kind</span>
              <select
                aria-label="Planning kind"
                value={draftKind}
                onChange={(event) => setDraftKind(event.target.value as PlanningItemKind)}
              >
                {PLANNING_ITEM_KINDS.map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Planning status</span>
              <select
                aria-label="New planning status"
                value={draftStatus}
                onChange={(event) => setDraftStatus(event.target.value as PlanningStatus)}
              >
                {PLANNING_STATUSES.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field-full">
              <span>Planning title</span>
              <input
                aria-label="Planning title"
                value={draftTitle}
                onChange={(event) => setDraftTitle(event.target.value)}
                placeholder="Short human-authored planning item"
              />
            </label>

            <label className="field">
              <span>{draftKind === 'note' ? 'Optional date' : 'Target date'}</span>
              <input
                aria-label="Planning date"
                type="date"
                value={draftDate}
                onChange={(event) => setDraftDate(event.target.value)}
              />
            </label>

            <label className="field field-full">
              <span>{draftKind === 'note' ? 'Planning note' : 'Planning detail'}</span>
              <textarea
                aria-label="Planning detail"
                rows={4}
                value={draftDetail}
                onChange={(event) => setDraftDetail(event.target.value)}
              />
            </label>
          </div>

          <button
            type="button"
            className="primary-action"
            onClick={handleCreate}
            disabled={!selectedRecord || !draftTitle.trim()}
          >
            <ClipboardList size={15} />
            Add planning record
          </button>

          <p className="empty-state">
            Planning is manual-only. These records never update Atlas project status, Dispatch
            readiness, GitHub bindings, verification state, or Writing drafts by themselves.
          </p>
        </aside>

        <div className="planning-main">
          <div className="planning-controls">
            <label className="search-control">
              <Search size={16} />
              <span className="sr-only">Search planning records</span>
              <input
                type="search"
                placeholder="Search planning"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <label className="select-control">
              <Filter size={16} />
              <span className="sr-only">Filter planning section</span>
              <select
                value={sectionFilter}
                onChange={(event) => setSectionFilter(event.target.value as SectionFilter)}
              >
                <option value="all">All sections</option>
                {[
                  ...new Map(
                    projectRecords.map((record) => [record.section.id, record.section]),
                  ).values(),
                ].map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="select-control">
              <Filter size={16} />
              <span className="sr-only">Filter planning kind</span>
              <select
                value={kindFilter}
                onChange={(event) => setKindFilter(event.target.value as PlanningFilter)}
              >
                <option value="all">All kinds</option>
                {PLANNING_ITEM_KINDS.map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="select-control">
              <Filter size={16} />
              <span className="sr-only">Filter planning status</span>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as PlanningStatusFilter)
                }
              >
                <option value="all">All statuses</option>
                {PLANNING_STATUSES.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="planning-summary">
            <span>{filteredRows.length} planning records shown</span>
            <span>
              Active {summary.active} / Planned {summary.planned} / Waiting {summary.waiting}
            </span>
          </div>

          <div className="planning-records" aria-label="Planning records">
            {filteredRows.length === 0 ? (
              <p className="empty-state">No planning records match this view.</p>
            ) : null}

            {filteredRows.map((row) => (
              <PlanningItemCard
                key={row.item.id}
                row={row}
                onUpdateItem={onUpdateItem}
                onDeleteItem={onDeleteItem}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
