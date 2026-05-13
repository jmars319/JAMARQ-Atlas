import { formatDateTimeLabel } from '../domain/atlas'
import type { TimelineEvent } from '../domain/timeline'

export function TimelineEventList({
  events,
  emptyLabel = 'No timeline evidence matches this view.',
  compact = false,
}: {
  events: TimelineEvent[]
  emptyLabel?: string
  compact?: boolean
}) {
  if (events.length === 0) {
    return <p className="empty-state">{emptyLabel}</p>
  }

  return (
    <ol className={compact ? 'timeline-list timeline-list-compact' : 'timeline-list'}>
      {events.map((event) => (
        <li key={event.id} className={`timeline-event timeline-tone-${event.tone}`}>
          <div className="timeline-marker" aria-hidden="true" />
          <div>
            <div className="timeline-event-heading">
              <strong>{event.title}</strong>
              <span>{formatDateTimeLabel(event.occurredAt)}</span>
            </div>
            <p>{event.detail}</p>
            <div className="activity-meta">
              <span>{event.source}</span>
              <span>{event.type}</span>
              {event.projectName ? <span>{event.projectName}</span> : null}
              {event.sectionName ? <span>{event.sectionName}</span> : null}
              {event.meta.slice(0, compact ? 1 : 3).map((item, index) => (
                <span key={`${event.id}-${item}-${index}`}>{item}</span>
              ))}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}
