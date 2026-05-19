import type {
  ReviewDueState,
  ReviewItemSource,
  ReviewSeverity,
} from '../domain/review'

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
