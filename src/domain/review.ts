import type { ProjectRecord } from './atlas'

export const ATLAS_REVIEW_SCHEMA_VERSION = 2

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

export type ReviewSessionPresetId =
  | 'daily-sweep'
  | 'weekly-ops-review'
  | 'deploy-follow-up'
  | 'github-intake-review'

export interface ReviewSessionPreset {
  id: ReviewSessionPresetId
  label: string
  detail: string
  scope: ReviewScope
  cadence: ReviewCadence
}

export interface ReviewSavedFilter {
  id: string
  label: string
  query: string
  sectionFilter: string
  sourceFilter: ReviewItemSource | 'all'
  severityFilter: ReviewSeverity | 'all'
  dueFilter: ReviewDueState | 'all'
  createdAt: string
  updatedAt: string
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
  savedFilters: ReviewSavedFilter[]
  updatedAt: string
}

export const emptyReviewState: ReviewState = {
  schemaVersion: ATLAS_REVIEW_SCHEMA_VERSION,
  sessions: [],
  notes: [],
  savedFilters: [],
  updatedAt: '',
}

export interface ReviewProjectContext {
  record: ProjectRecord | undefined
  projectId: string | null
}
