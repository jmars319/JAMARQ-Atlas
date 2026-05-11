export type TimelineEventSource =
  | 'workspace'
  | 'verification'
  | 'dispatch'
  | 'writing'
  | 'sync'
  | 'github'

export type TimelineEventType =
  | 'activity'
  | 'verification'
  | 'deployment'
  | 'preflight'
  | 'writing'
  | 'sync'
  | 'github'

export type TimelineEventTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger'

export interface TimelineEvent {
  id: string
  source: TimelineEventSource
  type: TimelineEventType
  tone: TimelineEventTone
  title: string
  detail: string
  occurredAt: string
  projectId: string | null
  projectName: string | null
  sectionId: string | null
  sectionName: string | null
  groupName: string | null
  url?: string
  meta: string[]
}

export interface TimelineFilters {
  projectId: string
  sectionId: string
  source: TimelineEventSource | 'all'
  type: TimelineEventType | 'all'
  dateRange: 'all' | '7d' | '30d' | '90d'
  query: string
}
