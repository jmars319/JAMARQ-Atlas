import {
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  NotebookText,
  Rocket,
  ShieldCheck,
  Tag,
  Workflow,
} from 'lucide-react'
import type { ActivityEvent } from '../domain/atlas'
import { formatDateLabel } from '../domain/atlas'

const iconByType: Record<ActivityEvent['type'], typeof NotebookText> = {
  commit: GitCommitHorizontal,
  'pull-request': GitPullRequest,
  issue: GitBranch,
  release: Tag,
  workflow: Workflow,
  deployment: Rocket,
  note: NotebookText,
  decision: ShieldCheck,
}

interface ActivityFeedProps {
  events: ActivityEvent[]
}

export function ActivityFeed({ events }: ActivityFeedProps) {
  const sortedEvents = events
    .slice()
    .sort((first, second) => second.occurredAt.localeCompare(first.occurredAt))

  if (sortedEvents.length === 0) {
    return <p className="empty-state">No activity captured yet.</p>
  }

  return (
    <ol className="activity-feed">
      {sortedEvents.map((event) => {
        const Icon = iconByType[event.type]

        return (
          <li className="activity-event" key={event.id}>
            <div className="activity-icon" aria-hidden="true">
              <Icon size={16} />
            </div>
            <div>
              <div className="activity-line">
                <strong>{event.title}</strong>
                <span>{formatDateLabel(event.occurredAt)}</span>
              </div>
              <p>{event.detail}</p>
              <div className="activity-meta">
                <span>{event.source}</span>
                <span>{event.type}</span>
                {event.target ? <span>{event.target}</span> : null}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
