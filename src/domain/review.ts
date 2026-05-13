import type { ProjectRecord } from './atlas'

export const ATLAS_REVIEW_SCHEMA_VERSION = 1

export type AtlasReviewSchemaVersion = typeof ATLAS_REVIEW_SCHEMA_VERSION

export type ReviewOutcome = 'noted' | 'needs-follow-up' | 'no-action' | 'planned'
export type ReviewCadence = 'daily' | 'weekly' | 'ad-hoc'
export type ReviewScope =
  | 'all'
  | 'section'
  | 'project'
  | 'dispatch'
  | 'github'
  | 'planning'
  | 'writing'
  | 'reports'
  | 'data-sync'

export type ReviewItemSource =
  | 'verification'
  | 'dispatch'
  | 'workspace'
  | 'github'
  | 'timeline'
  | 'planning'
  | 'writing'
  | 'reports'
  | 'data-sync'

export type ReviewSeverity = 'critical' | 'high' | 'medium' | 'low'

export type ReviewDueState =
  | 'overdue'
  | 'due'
  | 'upcoming'
  | 'attention'
  | 'blocked'
  | 'none'

export interface ReviewNote {
  id: string
  sessionId: string | null
  itemId: string | null
  projectId: string | null
  source: ReviewItemSource
  outcome: ReviewOutcome
  body: string
  createdAt: string
}

export interface ReviewSession {
  id: string
  title: string
  scope: ReviewScope
  cadence: ReviewCadence
  itemIds: string[]
  projectIds: string[]
  outcome: ReviewOutcome
  notes: string
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

export interface ReviewQueueItem {
  id: string
  source: ReviewItemSource
  severity: ReviewSeverity
  dueState: ReviewDueState
  title: string
  detail: string
  reason: string
  projectId: string | null
  sectionId: string | null
  sectionName: string | null
  groupName: string | null
  projectName: string | null
  repositoryKey?: string
  occurredAt?: string
  meta: string[]
}

export interface ReviewQueueSummary {
  total: number
  dueReview: number
  blocked: number
  deployFollowUp: number
  unboundRepos: number
  draftReportFollowUp: number
  backupSyncAttention: number
}

export interface ReviewState {
  schemaVersion: AtlasReviewSchemaVersion
  sessions: ReviewSession[]
  notes: ReviewNote[]
  updatedAt: string
}

export const emptyReviewState: ReviewState = {
  schemaVersion: ATLAS_REVIEW_SCHEMA_VERSION,
  sessions: [],
  notes: [],
  updatedAt: '',
}

export interface ReviewProjectContext {
  record: ProjectRecord | undefined
  projectId: string | null
}
