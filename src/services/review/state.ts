import {
  ATLAS_REVIEW_SCHEMA_VERSION,
  emptyReviewState,
  type ReviewCadence,
  type ReviewItemSource,
  type ReviewNote,
  type ReviewOutcome,
  type ReviewQueueItem,
  type ReviewSavedFilter,
  type ReviewScope,
  type ReviewSessionPreset,
  type ReviewSessionPresetId,
  type ReviewSession,
  type ReviewState,
} from '../../domain/review'

export const REVIEW_SESSION_PRESETS: ReviewSessionPreset[] = [
  {
    id: 'daily-sweep',
    label: 'Daily sweep',
    detail: 'Start a compact session for due, blocked, and high-severity review items.',
    scope: 'all',
    cadence: 'daily',
  },
  {
    id: 'weekly-ops-review',
    label: 'Weekly ops review',
    detail: 'Start a broad weekly session across the current review queue.',
    scope: 'all',
    cadence: 'weekly',
  },
  {
    id: 'deploy-follow-up',
    label: 'Deploy follow-up',
    detail: 'Start a Dispatch-focused review session for queue and closeout items.',
    scope: 'dispatch',
    cadence: 'ad-hoc',
  },
  {
    id: 'github-intake-review',
    label: 'GitHub repo review',
    detail: 'Start a GitHub-focused review session for unconnected repos and placement items.',
    scope: 'github',
    cadence: 'ad-hoc',
  },
]

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

function readFilterSource(value: unknown): ReviewSavedFilter['sourceFilter'] {
  return readString(value) === 'all' ? 'all' : readSource(value)
}

function readFilterSeverity(value: unknown): ReviewSavedFilter['severityFilter'] {
  return ['all', 'critical', 'high', 'medium', 'low'].includes(readString(value))
    ? (value as ReviewSavedFilter['severityFilter'])
    : 'all'
}

function readFilterDue(value: unknown): ReviewSavedFilter['dueFilter'] {
  return ['all', 'overdue', 'due', 'upcoming', 'attention', 'blocked', 'none'].includes(
    readString(value),
  )
    ? (value as ReviewSavedFilter['dueFilter'])
    : 'all'
}

function reviewId(prefix: string, now = new Date()) {
  return `${prefix}-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
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

function normalizeReviewSavedFilter(value: unknown, now = new Date()): ReviewSavedFilter | null {
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
    label: readString(value.label) || 'Saved Review filter',
    query: readString(value.query),
    sectionFilter: readString(value.sectionFilter) || 'all',
    sourceFilter: readFilterSource(value.sourceFilter),
    severityFilter: readFilterSeverity(value.severityFilter),
    dueFilter: readFilterDue(value.dueFilter),
    createdAt,
    updatedAt: safeDate(value.updatedAt, new Date(createdAt)),
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
    savedFilters: Array.isArray(value.savedFilters)
      ? value.savedFilters
          .map((filter) => normalizeReviewSavedFilter(filter, now))
          .filter((filter): filter is ReviewSavedFilter => filter !== null)
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

export interface GithubWritePilotReviewNoteDisplay {
  action: 'issue' | 'comment'
  title: string
  repositoryKey: string
  result: string
  resultNumber: number | null
  htmlUrl: string
  actor: string
  source: string
  broadWriteControlsEnabled: string
  bodyExcerpt: string
  rawBody: string
}

function labeledReviewLine(lines: string[], label: string) {
  const prefix = `${label}:`
  const line = lines.find((candidate) => candidate.startsWith(prefix))

  return line ? line.slice(prefix.length).trim() : ''
}

export function parseGithubWritePilotReviewNote(
  body: string,
): GithubWritePilotReviewNoteDisplay | null {
  const lines = body.split('\n').map((line) => line.trim())
  const headline = lines[0] ?? ''
  const action =
    headline === 'GitHub issue created by Atlas write pilot.'
      ? 'issue'
      : headline === 'GitHub comment posted by Atlas write pilot.'
        ? 'comment'
        : null

  if (!action) {
    return null
  }

  const result = labeledReviewLine(lines, 'Result')
  const issueMatch = result.match(/^#(\d+)/)
  const commentMatch = result.match(/^comment on #(\d+)/)

  return {
    action,
    title: action === 'issue' ? 'GitHub issue created' : 'GitHub comment posted',
    repositoryKey: labeledReviewLine(lines, 'Repository') || 'Unknown repository',
    result,
    resultNumber: Number(issueMatch?.[1] ?? commentMatch?.[1]) || null,
    htmlUrl: labeledReviewLine(lines, 'URL'),
    actor: labeledReviewLine(lines, 'Actor') || 'unknown',
    source: labeledReviewLine(lines, 'Source') || 'manual draft',
    broadWriteControlsEnabled: labeledReviewLine(lines, 'Broad writeControlsEnabled') || 'false',
    bodyExcerpt: labeledReviewLine(lines, 'Body excerpt'),
    rawBody: body,
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

export function createReviewSavedFilter({
  label,
  query = '',
  sectionFilter = 'all',
  sourceFilter = 'all',
  severityFilter = 'all',
  dueFilter = 'all',
  id,
  now = new Date(),
}: {
  label: string
  query?: string
  sectionFilter?: string
  sourceFilter?: ReviewSavedFilter['sourceFilter']
  severityFilter?: ReviewSavedFilter['severityFilter']
  dueFilter?: ReviewSavedFilter['dueFilter']
  id?: string
  now?: Date
}): ReviewSavedFilter {
  const timestamp = now.toISOString()

  return {
    id: id || reviewId('review-filter', now),
    label: label.trim() || 'Saved Review filter',
    query,
    sectionFilter,
    sourceFilter,
    severityFilter,
    dueFilter,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function saveReviewFilter(state: ReviewState, filter: ReviewSavedFilter): ReviewState {
  return {
    ...state,
    savedFilters: [
      filter,
      ...state.savedFilters.filter((candidate) => candidate.id !== filter.id),
    ],
    updatedAt: filter.updatedAt,
  }
}

export function deleteReviewFilter(
  state: ReviewState,
  filterId: string,
  now = new Date(),
): ReviewState {
  return {
    ...state,
    savedFilters: state.savedFilters.filter((filter) => filter.id !== filterId),
    updatedAt: now.toISOString(),
  }
}

export function itemsForReviewSessionPreset(
  queue: ReviewQueueItem[],
  presetId: ReviewSessionPresetId,
) {
  if (presetId === 'daily-sweep') {
    return queue
      .filter(
        (item) =>
          ['critical', 'high'].includes(item.severity) ||
          ['overdue', 'due', 'blocked', 'attention'].includes(item.dueState),
      )
      .slice(0, 20)
  }

  if (presetId === 'deploy-follow-up') {
    return queue.filter((item) => item.source === 'dispatch').slice(0, 20)
  }

  if (presetId === 'github-intake-review') {
    return queue.filter((item) => item.source === 'github').slice(0, 20)
  }

  return queue.slice(0, 30)
}

export function createReviewSessionFromPreset({
  presetId,
  queue,
  now = new Date(),
}: {
  presetId: ReviewSessionPresetId
  queue: ReviewQueueItem[]
  now?: Date
}) {
  const preset =
    REVIEW_SESSION_PRESETS.find((candidate) => candidate.id === presetId) ??
    REVIEW_SESSION_PRESETS[1]
  const items = itemsForReviewSessionPreset(queue, preset.id)

  if (items.length === 0) {
    return null
  }

  return createReviewSession({
    title: `${preset.label} - ${now.toISOString().slice(0, 10)}`,
    scope: preset.scope,
    cadence: preset.cadence,
    itemIds: items.map((item) => item.id),
    projectIds: items.flatMap((item) => (item.projectId ? [item.projectId] : [])),
    notes: `${preset.detail} Queue inputs are advisory only.`,
    now,
  })
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
