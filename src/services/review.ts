import type { ProjectRecord } from '../domain/atlas'
import type { DispatchState } from '../domain/dispatch'
import type { AtlasPlanningState, PlanningItem } from '../domain/planning'
import {
  ATLAS_REVIEW_SCHEMA_VERSION,
  emptyReviewState,
  type ReviewCadence,
  type ReviewDueState,
  type ReviewItemSource,
  type ReviewNote,
  type ReviewOutcome,
  type ReviewQueueItem,
  type ReviewQueueSummary,
  type ReviewScope,
  type ReviewSession,
  type ReviewSeverity,
  type ReviewState,
} from '../domain/review'
import type { ReportsState } from '../domain/reports'
import type { AtlasSyncState } from '../domain/sync'
import type { TimelineEvent } from '../domain/timeline'
import type { WritingWorkbenchState } from '../domain/writing'
import type { RepoPlacementSuggestion } from './repoSuggestions'
import { deriveDispatchQueueItems } from './dispatchQueue'
import { evaluateVerification } from './verification'

const REVIEW_STALE_SNAPSHOT_DAYS = 14

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function safeDate(value: unknown, fallback: Date) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value
  }

  return fallback.toISOString()
}

function readOutcome(value: unknown): ReviewOutcome {
  return value === 'needs-follow-up' || value === 'no-action' || value === 'planned'
    ? value
    : 'noted'
}

function readCadence(value: unknown): ReviewCadence {
  return value === 'daily' || value === 'weekly' ? value : 'ad-hoc'
}

function readScope(value: unknown): ReviewScope {
  return [
    'all',
    'section',
    'project',
    'dispatch',
    'github',
    'planning',
    'writing',
    'reports',
    'data-sync',
  ].includes(readString(value))
    ? (value as ReviewScope)
    : 'all'
}

function readSource(value: unknown): ReviewItemSource {
  return [
    'verification',
    'dispatch',
    'workspace',
    'github',
    'timeline',
    'planning',
    'writing',
    'reports',
    'data-sync',
  ].includes(readString(value))
    ? (value as ReviewItemSource)
    : 'workspace'
}

function reviewId(prefix: string, now = new Date()) {
  return `${prefix}-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function projectFields(record: ProjectRecord | undefined, projectId: string | null) {
  return {
    projectId,
    sectionId: record?.section.id ?? null,
    sectionName: record?.section.name ?? null,
    groupName: record?.group.name ?? null,
    projectName: record?.project.name ?? null,
  }
}

function bySeverity(severity: ReviewSeverity) {
  const ranks: Record<ReviewSeverity, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  }

  return ranks[severity]
}

function dueRank(dueState: ReviewDueState) {
  const ranks: Record<ReviewDueState, number> = {
    overdue: 0,
    blocked: 1,
    due: 2,
    attention: 3,
    upcoming: 4,
    none: 5,
  }

  return ranks[dueState]
}

function daysBetween(first: Date, second: Date) {
  return Math.floor((second.getTime() - first.getTime()) / 86_400_000)
}

function parseDate(value: string) {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function emptyReviewStore(now = new Date()): ReviewState {
  return {
    ...emptyReviewState,
    updatedAt: now.toISOString(),
  }
}

function normalizeReviewSession(value: unknown, now = new Date()): ReviewSession | null {
  if (!isRecord(value)) {
    return null
  }

  const id = readString(value.id)

  if (!id) {
    return null
  }

  const createdAt = safeDate(value.createdAt, now)

  return {
    id,
    title: readString(value.title) || 'Operator review session',
    scope: readScope(value.scope),
    cadence: readCadence(value.cadence),
    itemIds: readStringArray(value.itemIds),
    projectIds: readStringArray(value.projectIds),
    outcome: readOutcome(value.outcome),
    notes: readString(value.notes),
    createdAt,
    updatedAt: safeDate(value.updatedAt, new Date(createdAt)),
    completedAt: readString(value.completedAt) || null,
  }
}

function normalizeReviewNote(value: unknown, now = new Date()): ReviewNote | null {
  if (!isRecord(value)) {
    return null
  }

  const id = readString(value.id)

  if (!id) {
    return null
  }

  return {
    id,
    sessionId: readString(value.sessionId) || null,
    itemId: readString(value.itemId) || null,
    projectId: readString(value.projectId) || null,
    source: readSource(value.source),
    outcome: readOutcome(value.outcome),
    body: readString(value.body),
    createdAt: safeDate(value.createdAt, now),
  }
}

export function normalizeReviewState(value: unknown, now = new Date()): ReviewState {
  const defaults = emptyReviewStore(now)

  if (!isRecord(value)) {
    return defaults
  }

  return {
    schemaVersion: ATLAS_REVIEW_SCHEMA_VERSION,
    sessions: Array.isArray(value.sessions)
      ? value.sessions
          .map((session) => normalizeReviewSession(session, now))
          .filter((session): session is ReviewSession => session !== null)
      : [],
    notes: Array.isArray(value.notes)
      ? value.notes
          .map((note) => normalizeReviewNote(note, now))
          .filter((note): note is ReviewNote => note !== null)
      : [],
    updatedAt: safeDate(value.updatedAt, now),
  }
}

export function createReviewSession({
  title,
  scope = 'all',
  cadence = 'ad-hoc',
  itemIds,
  projectIds,
  notes = '',
  outcome = 'noted',
  id,
  now = new Date(),
}: {
  title: string
  scope?: ReviewScope
  cadence?: ReviewCadence
  itemIds: string[]
  projectIds: string[]
  notes?: string
  outcome?: ReviewOutcome
  id?: string
  now?: Date
}): ReviewSession {
  const timestamp = now.toISOString()

  return {
    id: id || reviewId('review-session', now),
    title: title.trim() || 'Operator review session',
    scope,
    cadence,
    itemIds: [...new Set(itemIds)],
    projectIds: [...new Set(projectIds.filter(Boolean))],
    outcome,
    notes: notes.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
    completedAt: null,
  }
}

export function createReviewNote({
  sessionId = null,
  itemId = null,
  projectId = null,
  source,
  outcome = 'noted',
  body,
  id,
  now = new Date(),
}: {
  sessionId?: string | null
  itemId?: string | null
  projectId?: string | null
  source: ReviewItemSource
  outcome?: ReviewOutcome
  body: string
  id?: string
  now?: Date
}): ReviewNote {
  return {
    id: id || reviewId('review-note', now),
    sessionId,
    itemId,
    projectId,
    source,
    outcome,
    body: body.trim() || 'Review note captured.',
    createdAt: now.toISOString(),
  }
}

export function addReviewSession(state: ReviewState, session: ReviewSession): ReviewState {
  return {
    ...state,
    sessions: [session, ...state.sessions.filter((candidate) => candidate.id !== session.id)],
    updatedAt: session.updatedAt,
  }
}

export function addReviewNote(state: ReviewState, note: ReviewNote): ReviewState {
  return {
    ...state,
    notes: [note, ...state.notes.filter((candidate) => candidate.id !== note.id)],
    updatedAt: note.createdAt,
  }
}

export function getReviewForProject(state: ReviewState, projectId: string) {
  const sessions = state.sessions
    .filter((session) => session.projectIds.includes(projectId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  const notes = state.notes
    .filter((note) => note.projectId === projectId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))

  return { sessions, notes }
}

function verificationItems(projectRecords: ProjectRecord[], now: Date): ReviewQueueItem[] {
  return projectRecords.flatMap((record) => {
    const evaluation = evaluateVerification(record.project, now)

    if (!['overdue', 'due', 'unverified'].includes(evaluation.dueState)) {
      return []
    }

    const dueState: ReviewDueState =
      evaluation.dueState === 'due' ? 'due' : 'overdue'
    const severity: ReviewSeverity =
      evaluation.dueState === 'overdue' || evaluation.dueState === 'unverified'
        ? 'high'
        : 'medium'

    return [
      {
        id: `verification-${record.project.id}-${evaluation.dueState}`,
        source: 'verification',
        severity,
        dueState,
        title: `${record.project.name} needs verification review`,
        detail:
          evaluation.dueState === 'unverified'
            ? 'No last verified date is recorded.'
            : `Verification cadence is ${evaluation.cadence}; due date is ${
                evaluation.dueDate ?? 'not calculated'
              }.`,
        reason: 'Verification cadence places this project in the review queue.',
        ...projectFields(record, record.project.id),
        meta: [evaluation.cadence, evaluation.dueState, evaluation.dueDate ?? 'no due date'],
      },
    ]
  })
}

function workspaceItems(projectRecords: ProjectRecord[]): ReviewQueueItem[] {
  return projectRecords.flatMap((record) => {
    const items: ReviewQueueItem[] = []
    const manual = record.project.manual

    if (manual.blockers.length > 0 || manual.status === 'Waiting') {
      items.push({
        id: `workspace-blocked-${record.project.id}`,
        source: 'workspace',
        severity: 'high',
        dueState: 'blocked',
        title: `${record.project.name} has blocked or waiting work`,
        detail: manual.blockers[0] || manual.nextAction || 'Project status is Waiting.',
        reason: 'Manual Atlas status and blockers are human-authored source-of-truth fields.',
        ...projectFields(record, record.project.id),
        meta: [manual.status, `${manual.blockers.length} blockers`],
      })
    }

    if (manual.currentRisk.trim() && !['Stable', 'Archived', 'Not Doing'].includes(manual.status)) {
      items.push({
        id: `workspace-risk-${record.project.id}`,
        source: 'workspace',
        severity: 'medium',
        dueState: 'attention',
        title: `${record.project.name} has current risk noted`,
        detail: manual.currentRisk,
        reason: 'Manual current-risk text exists and should be reviewed during operator sweep.',
        ...projectFields(record, record.project.id),
        meta: [manual.status, 'current risk'],
      })
    }

    return items
  })
}

function dispatchItems({
  projectRecords,
  dispatch,
  reports,
}: {
  projectRecords: ProjectRecord[]
  dispatch: DispatchState
  reports: ReportsState
}): ReviewQueueItem[] {
  return deriveDispatchQueueItems({ dispatch, projectRecords, reports }).flatMap((item) => {
    if (item.closeout.state === 'closeout-ready' && item.state === 'recorded') {
      return []
    }

    const severity: ReviewSeverity =
      item.closeout.state === 'needs-manual-record' || item.closeout.state === 'needs-evidence'
        ? 'high'
        : item.closeout.state === 'needs-follow-up'
          ? 'medium'
          : 'low'
    const record = item.projectRecord ?? undefined

    return [
      {
        id: `dispatch-closeout-${item.target.id}`,
        source: 'dispatch',
        severity,
        dueState:
          item.closeout.state === 'session-active'
            ? 'attention'
            : item.closeout.state === 'needs-evidence' ||
                item.closeout.state === 'needs-manual-record'
              ? 'blocked'
              : 'attention',
        title: `${item.projectName} dispatch closeout needs review`,
        detail: item.closeout.detail,
        reason: `Queue state is ${item.state}; closeout state is ${item.closeout.label}.`,
        ...projectFields(record, item.target.projectId),
        meta: [
          item.state,
          item.closeout.state,
          item.hostStatus.status,
          item.verificationStatus.status,
        ],
      },
    ]
  })
}

function planningDate(item: PlanningItem) {
  if (item.kind === 'objective') {
    return item.targetDate
  }

  if (item.kind === 'milestone') {
    return item.dueDate
  }

  if (item.kind === 'work-session') {
    return item.scheduledFor
  }

  return ''
}

function planningItems(projectRecords: ProjectRecord[], planning: AtlasPlanningState, now: Date) {
  const recordsByProject = new Map(projectRecords.map((record) => [record.project.id, record]))
  const items: PlanningItem[] = [
    ...planning.objectives,
    ...planning.milestones,
    ...planning.workSessions,
  ]

  return items.flatMap((item): ReviewQueueItem[] => {
    if (item.status === 'done' || item.status === 'deferred') {
      return []
    }

    const date = planningDate(item)
    const parsed = parseDate(date)

    if (!parsed) {
      return []
    }

    const daysUntil = daysBetween(now, parsed)

    if (daysUntil > 14) {
      return []
    }

    const record = recordsByProject.get(item.projectId)
    const overdue = daysUntil < 0

    return [
      {
        id: `planning-${item.id}`,
        source: 'planning',
        severity: overdue ? 'high' : 'medium',
        dueState: overdue ? 'overdue' : 'upcoming',
        title: `${item.title} is ${overdue ? 'past due' : 'upcoming'}`,
        detail: item.detail || `${item.kind} scheduled for ${date}.`,
        reason: 'Planning record has a date close enough for operator review.',
        ...projectFields(record, item.projectId),
        meta: [item.kind, item.status, date],
      },
    ]
  })
}

function writingItems(projectRecords: ProjectRecord[], writing: WritingWorkbenchState) {
  const recordsByProject = new Map(projectRecords.map((record) => [record.project.id, record]))

  return writing.drafts.flatMap((draft): ReviewQueueItem[] => {
    if (draft.status === 'archived' || draft.status === 'exported') {
      return []
    }

    const record = recordsByProject.get(draft.projectId)
    const severity: ReviewSeverity = draft.status === 'draft' ? 'medium' : 'low'

    return [
      {
        id: `writing-${draft.id}`,
        source: 'writing',
        severity,
        dueState: 'attention',
        title: `${draft.title} needs Writing follow-up`,
        detail:
          draft.status === 'approved'
            ? 'Draft is approved but not exported.'
            : `Draft status is ${draft.status}.`,
        reason: 'Writing draft lifecycle still has a human review/export step open.',
        ...projectFields(record, draft.projectId),
        meta: [draft.templateId, draft.status],
      },
    ]
  })
}

function reportItems(projectRecords: ProjectRecord[], reports: ReportsState) {
  const recordsByProject = new Map(projectRecords.map((record) => [record.project.id, record]))

  return reports.packets.flatMap((packet): ReviewQueueItem[] => {
    if (packet.status !== 'draft') {
      return []
    }

    const projectId = packet.projectIds.length === 1 ? packet.projectIds[0] : null
    const record = projectId ? recordsByProject.get(projectId) : undefined

    return [
      {
        id: `report-${packet.id}`,
        source: 'reports',
        severity: 'low',
        dueState: 'attention',
        title: `${packet.title} is still a draft report`,
        detail: 'Report packet has not been exported or archived.',
        reason: 'Draft report packets often need human review before use.',
        ...projectFields(record, projectId),
        meta: [packet.type, packet.status, `${packet.projectIds.length} projects`],
      },
    ]
  })
}

function githubItems(suggestions: RepoPlacementSuggestion[]) {
  return suggestions.map((suggestion): ReviewQueueItem => ({
    id: `github-unbound-${suggestion.repositoryKey}`,
    source: 'github',
    severity: suggestion.confidence === 'high' ? 'medium' : 'low',
    dueState: 'attention',
    title: `${suggestion.repository.fullName} is unbound`,
    detail:
      suggestion.suggestedProjectName ??
      ([suggestion.suggestedSectionName, suggestion.suggestedGroupName]
        .filter(Boolean)
        .join(' / ') || 'No strong placement suggestion.'),
    reason: suggestion.reasons[0]?.detail || 'Repository is available but not bound to Atlas.',
    projectId: suggestion.suggestedProjectId,
    sectionId: suggestion.suggestedSectionId,
    sectionName: suggestion.suggestedSectionName,
    groupName: suggestion.suggestedGroupName,
    projectName: suggestion.suggestedProjectName,
    repositoryKey: suggestion.repositoryKey,
    meta: [suggestion.confidence, String(suggestion.score)],
  }))
}

function timelineItems(timelineEvents: TimelineEvent[], now: Date): ReviewQueueItem[] {
  const cutoff = new Date(now)
  cutoff.setUTCDate(cutoff.getUTCDate() - 7)

  return timelineEvents
    .filter((event) => ['warning', 'danger'].includes(event.tone))
    .filter((event) => new Date(event.occurredAt) >= cutoff)
    .slice(0, 5)
    .map((event): ReviewQueueItem => ({
      id: `timeline-review-${event.id}`,
      source: 'timeline',
      severity: event.tone === 'danger' ? 'high' : 'medium',
      dueState: 'attention',
      title: event.title,
      detail: event.detail,
      reason: 'Recent warning or danger evidence appeared in Timeline.',
      projectId: event.projectId,
      sectionId: event.sectionId,
      sectionName: event.sectionName,
      groupName: event.groupName,
      projectName: event.projectName,
      occurredAt: event.occurredAt,
      meta: [event.source, event.type, ...event.meta],
    }))
}

function syncItems(sync: AtlasSyncState, now: Date): ReviewQueueItem[] {
  const latest = sync.snapshots
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]

  if (!latest) {
    return [
      {
        id: 'data-sync-no-local-snapshot',
        source: 'data-sync',
        severity: 'medium',
        dueState: 'attention',
        title: 'No local Atlas snapshot exists',
        detail: 'Create a local snapshot before larger operational changes.',
        reason: 'Data Center and Sync are available, but no manual checkpoint is stored.',
        ...projectFields(undefined, null),
        meta: ['sync', 'no snapshot'],
      },
    ]
  }

  const parsed = parseDate(latest.createdAt)
  const age = parsed ? daysBetween(parsed, now) : 0

  if (age <= REVIEW_STALE_SNAPSHOT_DAYS) {
    return []
  }

  return [
    {
      id: 'data-sync-stale-local-snapshot',
      source: 'data-sync',
      severity: 'low',
      dueState: 'attention',
      title: 'Latest local snapshot is stale',
      detail: `${latest.label} is ${age} day(s) old.`,
      reason: 'Manual backups should stay current before major review/deploy work.',
      ...projectFields(undefined, null),
      meta: ['sync', latest.fingerprint],
    },
  ]
}

export function deriveReviewQueue({
  projectRecords,
  dispatch,
  planning,
  reports,
  writing,
  sync,
  timelineEvents,
  repoSuggestions = [],
  now = new Date(),
}: {
  projectRecords: ProjectRecord[]
  dispatch: DispatchState
  planning: AtlasPlanningState
  reports: ReportsState
  writing: WritingWorkbenchState
  sync: AtlasSyncState
  timelineEvents: TimelineEvent[]
  repoSuggestions?: RepoPlacementSuggestion[]
  now?: Date
}): ReviewQueueItem[] {
  return [
    ...verificationItems(projectRecords, now),
    ...workspaceItems(projectRecords),
    ...dispatchItems({ projectRecords, dispatch, reports }),
    ...planningItems(projectRecords, planning, now),
    ...writingItems(projectRecords, writing),
    ...reportItems(projectRecords, reports),
    ...githubItems(repoSuggestions),
    ...timelineItems(timelineEvents, now),
    ...syncItems(sync, now),
  ].sort((left, right) => {
    const severityDelta = bySeverity(left.severity) - bySeverity(right.severity)

    if (severityDelta !== 0) {
      return severityDelta
    }

    const dueDelta = dueRank(left.dueState) - dueRank(right.dueState)

    if (dueDelta !== 0) {
      return dueDelta
    }

    return (right.occurredAt ?? '').localeCompare(left.occurredAt ?? '')
  })
}

export function summarizeReviewQueue(items: ReviewQueueItem[]): ReviewQueueSummary {
  return {
    total: items.length,
    dueReview: items.filter((item) =>
      ['verification', 'planning'].includes(item.source) &&
      ['overdue', 'due', 'upcoming'].includes(item.dueState),
    ).length,
    blocked: items.filter((item) => item.dueState === 'blocked' || item.severity === 'high').length,
    deployFollowUp: items.filter((item) => item.source === 'dispatch').length,
    unboundRepos: items.filter((item) => item.source === 'github').length,
    draftReportFollowUp: items.filter((item) => item.source === 'writing' || item.source === 'reports')
      .length,
    backupSyncAttention: items.filter((item) => item.source === 'data-sync').length,
  }
}

export function summarizeReviewState(state: ReviewState) {
  return {
    sessions: state.sessions.length,
    notes: state.notes.length,
    followUps: state.notes.filter((note) => note.outcome === 'needs-follow-up').length,
    planned: state.notes.filter((note) => note.outcome === 'planned').length,
  }
}
