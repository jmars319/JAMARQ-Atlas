import { CalendarDays, ClipboardList } from 'lucide-react'
import { formatDateLabel } from '../domain/atlas'
import type { PlanningItem, PlanningState } from '../domain/planning'
import { getPlanningForProject } from '../services/planning'

interface PlanningPanelProps {
  planning: PlanningState
  projectId: string
  onOpenPlanning: (projectId: string) => void
}

function itemDate(item: PlanningItem) {
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

function itemKindLabel(item: PlanningItem) {
  if (item.kind === 'work-session') {
    return 'Work session'
  }

  return `${item.kind.charAt(0).toUpperCase()}${item.kind.slice(1)}`
}

export function PlanningPanel({ planning, projectId, onOpenPlanning }: PlanningPanelProps) {
  const projectPlanning = getPlanningForProject(planning, projectId)
  const visibleItems = projectPlanning.all.slice(0, 4)

  return (
    <div className="planning-mini" aria-label="Project planning">
      <div className="planning-mini-summary">
        <div>
          <span>Objectives</span>
          <strong>{projectPlanning.objectives.length}</strong>
        </div>
        <div>
          <span>Milestones</span>
          <strong>{projectPlanning.milestones.length}</strong>
        </div>
        <div>
          <span>Sessions</span>
          <strong>{projectPlanning.workSessions.length}</strong>
        </div>
        <div>
          <span>Notes</span>
          <strong>{projectPlanning.notes.length}</strong>
        </div>
      </div>

      {visibleItems.length > 0 ? (
        <div className="planning-mini-list">
          {visibleItems.map((item) => (
            <article key={item.id}>
              <div>
                <ClipboardList size={15} />
                <span>
                  {itemKindLabel(item)} / {item.status}
                </span>
              </div>
              <strong>{item.title}</strong>
              <p>{item.kind === 'note' ? item.body : item.detail || 'No detail recorded.'}</p>
              <small>
                <CalendarDays size={13} />
                {formatDateLabel(itemDate(item))}
              </small>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state">No planning records for this project yet.</p>
      )}

      <button type="button" className="primary-action" onClick={() => onOpenPlanning(projectId)}>
        <ClipboardList size={15} />
        Open Planning
      </button>
    </div>
  )
}
