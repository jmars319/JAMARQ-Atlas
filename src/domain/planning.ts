export const ATLAS_PLANNING_SCHEMA_VERSION = 2

export type AtlasPlanningSchemaVersion = typeof ATLAS_PLANNING_SCHEMA_VERSION
export type PlanningStatus = 'idea' | 'planned' | 'active' | 'waiting' | 'done' | 'deferred'
export type PlanningItemKind = 'objective' | 'milestone' | 'work-session' | 'note'
export type PlanningSourceLinkType =
  | 'review-note'
  | 'review-session'
  | 'dispatch-session'
  | 'report-packet'
  | 'timeline-event'

export interface PlanningSourceLink {
  type: PlanningSourceLinkType
  id: string
  label: string
}

export interface PlanningItemBase {
  id: string
  projectId: string
  sectionId?: string
  groupId?: string
  title: string
  detail: string
  status: PlanningStatus
  createdAt: string
  updatedAt: string
  sourceLinks: PlanningSourceLink[]
}

export interface PlanningObjective extends PlanningItemBase {
  kind: 'objective'
  targetDate: string
  outcome: string
}

export interface PlanningMilestone extends PlanningItemBase {
  kind: 'milestone'
  dueDate: string
}

export interface PlanningWorkSession extends PlanningItemBase {
  kind: 'work-session'
  scheduledFor: string
  completedAt: string
}

export interface PlanningNote extends PlanningItemBase {
  kind: 'note'
  body: string
}

export interface PlanningState {
  schemaVersion: AtlasPlanningSchemaVersion
  objectives: PlanningObjective[]
  milestones: PlanningMilestone[]
  workSessions: PlanningWorkSession[]
  notes: PlanningNote[]
  updatedAt: string
}

export type AtlasPlanningState = PlanningState

export type PlanningItem =
  | PlanningObjective
  | PlanningMilestone
  | PlanningWorkSession
  | PlanningNote

export const PLANNING_STATUSES: Array<{ id: PlanningStatus; label: string }> = [
  { id: 'idea', label: 'Idea' },
  { id: 'planned', label: 'Planned' },
  { id: 'active', label: 'Active' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'done', label: 'Done' },
  { id: 'deferred', label: 'Deferred' },
]

export const PLANNING_ITEM_KINDS: Array<{ id: PlanningItemKind; label: string }> = [
  { id: 'objective', label: 'Objective' },
  { id: 'milestone', label: 'Milestone' },
  { id: 'work-session', label: 'Work session' },
  { id: 'note', label: 'Planning note' },
]

export const emptyPlanningState: PlanningState = {
  schemaVersion: ATLAS_PLANNING_SCHEMA_VERSION,
  objectives: [],
  milestones: [],
  workSessions: [],
  notes: [],
  updatedAt: '',
}
