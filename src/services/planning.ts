import type { ProjectRecord } from '../domain/atlas'
import {
  ATLAS_PLANNING_SCHEMA_VERSION,
  PLANNING_STATUSES,
  emptyPlanningState,
  type PlanningItem,
  type PlanningItemBase,
  type PlanningItemKind,
  type PlanningMilestone,
  type PlanningNote,
  type PlanningObjective,
  type PlanningState,
  type PlanningStatus,
  type PlanningSourceLink,
  type PlanningSourceLinkType,
  type PlanningWorkSession,
} from '../domain/planning'

type PlanningCollectionKey = 'objectives' | 'milestones' | 'workSessions' | 'notes'

export interface PlanningItemUpdate {
  title?: string
  detail?: string
  status?: PlanningStatus
  targetDate?: string
  outcome?: string
  dueDate?: string
  scheduledFor?: string
  completedAt?: string
  body?: string
  sourceLinks?: PlanningSourceLink[]
}

export interface PlanningSummary {
  objectives: number
  milestones: number
  workSessions: number
  notes: number
  active: number
  planned: number
  waiting: number
}

export interface ProjectPlanningRecords {
  objectives: PlanningObjective[]
  milestones: PlanningMilestone[]
  workSessions: PlanningWorkSession[]
  notes: PlanningNote[]
  all: PlanningItem[]
}

const KIND_TO_COLLECTION: Record<PlanningItemKind, PlanningCollectionKey> = {
  objective: 'objectives',
  milestone: 'milestones',
  'work-session': 'workSessions',
  note: 'notes',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readSourceLinkType(value: unknown): PlanningSourceLinkType {
  return [
    'review-note',
    'review-session',
    'dispatch-session',
    'report-packet',
    'timeline-event',
  ].includes(readString(value))
    ? (value as PlanningSourceLinkType)
    : 'timeline-event'
}

function normalizeSourceLinks(value: unknown): PlanningSourceLink[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item): PlanningSourceLink[] => {
    if (!isRecord(item)) {
      return []
    }

    const id = readString(item.id)

    if (!id) {
      return []
    }

    return [
      {
        type: readSourceLinkType(item.type),
        id,
        label: readString(item.label) || id,
      },
    ]
  })
}

function readStatus(value: unknown): PlanningStatus {
  return PLANNING_STATUSES.some((status) => status.id === value)
    ? (value as PlanningStatus)
    : 'planned'
}

function safeDate(value: unknown, fallback: Date) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value
  }

  return fallback.toISOString()
}

function createPlanningId(kind: PlanningItemKind, now = new Date()) {
  return `planning-${kind}-${now.getTime().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`
}

export function emptyPlanningStore(now = new Date()): PlanningState {
  return {
    ...emptyPlanningState,
    updatedAt: now.toISOString(),
  }
}

function normalizeBase(
  value: Record<string, unknown>,
  kind: PlanningItemKind,
  now: Date,
): PlanningItemBase {
  const createdAt = safeDate(value.createdAt, now)

  return {
    id: readString(value.id) || createPlanningId(kind, now),
    projectId: readString(value.projectId),
    sectionId: readString(value.sectionId) || undefined,
    groupId: readString(value.groupId) || undefined,
    title: readString(value.title) || 'Untitled planning item',
    detail: readString(value.detail),
    status: readStatus(value.status),
    createdAt,
    updatedAt: safeDate(value.updatedAt, new Date(createdAt)),
    sourceLinks: normalizeSourceLinks(value.sourceLinks),
  }
}

function normalizeObjective(value: unknown, now: Date): PlanningObjective | null {
  if (!isRecord(value)) {
    return null
  }

  const base = normalizeBase(value, 'objective', now)

  if (!base.projectId) {
    return null
  }

  return {
    ...base,
    kind: 'objective',
    targetDate: readString(value.targetDate),
    outcome: readString(value.outcome),
  }
}

function normalizeMilestone(value: unknown, now: Date): PlanningMilestone | null {
  if (!isRecord(value)) {
    return null
  }

  const base = normalizeBase(value, 'milestone', now)

  if (!base.projectId) {
    return null
  }

  return {
    ...base,
    kind: 'milestone',
    dueDate: readString(value.dueDate),
  }
}

function normalizeWorkSession(value: unknown, now: Date): PlanningWorkSession | null {
  if (!isRecord(value)) {
    return null
  }

  const base = normalizeBase(value, 'work-session', now)

  if (!base.projectId) {
    return null
  }

  return {
    ...base,
    kind: 'work-session',
    scheduledFor: readString(value.scheduledFor),
    completedAt: readString(value.completedAt),
  }
}

function normalizeNote(value: unknown, now: Date): PlanningNote | null {
  if (!isRecord(value)) {
    return null
  }

  const base = normalizeBase(value, 'note', now)

  if (!base.projectId) {
    return null
  }

  return {
    ...base,
    kind: 'note',
    body: readString(value.body) || base.detail,
  }
}

function byUpdatedAt(left: PlanningItem, right: PlanningItem) {
  return right.updatedAt.localeCompare(left.updatedAt)
}

function byDateThenUpdatedAt<T extends PlanningItem>(
  getDate: (item: T) => string,
): (left: T, right: T) => number {
  return (left, right) => {
    const leftDate = getDate(left)
    const rightDate = getDate(right)

    if (leftDate && rightDate && leftDate !== rightDate) {
      return leftDate.localeCompare(rightDate)
    }

    if (leftDate && !rightDate) {
      return -1
    }

    if (!leftDate && rightDate) {
      return 1
    }

    return byUpdatedAt(left, right)
  }
}

export function normalizePlanningState(value: unknown, now = new Date()): PlanningState {
  const defaults = emptyPlanningStore(now)

  if (!isRecord(value)) {
    return defaults
  }

  return {
    schemaVersion: ATLAS_PLANNING_SCHEMA_VERSION,
    objectives: Array.isArray(value.objectives)
      ? value.objectives
          .map((objective) => normalizeObjective(objective, now))
          .filter((objective): objective is PlanningObjective => objective !== null)
      : [],
    milestones: Array.isArray(value.milestones)
      ? value.milestones
          .map((milestone) => normalizeMilestone(milestone, now))
          .filter((milestone): milestone is PlanningMilestone => milestone !== null)
      : [],
    workSessions: Array.isArray(value.workSessions)
      ? value.workSessions
          .map((session) => normalizeWorkSession(session, now))
          .filter((session): session is PlanningWorkSession => session !== null)
      : [],
    notes: Array.isArray(value.notes)
      ? value.notes
          .map((note) => normalizeNote(note, now))
          .filter((note): note is PlanningNote => note !== null)
      : [],
    updatedAt: safeDate(value.updatedAt, now),
  }
}

export function createPlanningItem({
  kind,
  projectId,
  sectionId,
  groupId,
  title,
  detail = '',
  status = 'planned',
  sourceLinks = [],
  date = '',
  id,
  now = new Date(),
}: {
  kind: PlanningItemKind
  projectId: string
  sectionId?: string
  groupId?: string
  title: string
  detail?: string
  status?: PlanningStatus
  sourceLinks?: PlanningSourceLink[]
  date?: string
  id?: string
  now?: Date
}): PlanningItem {
  const timestamp = now.toISOString()
  const base = {
    id: id || createPlanningId(kind, now),
    projectId,
    sectionId,
    groupId,
    title: title.trim() || 'Untitled planning item',
    detail: detail.trim(),
    status,
    sourceLinks,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  if (kind === 'objective') {
    return {
      ...base,
      kind,
      targetDate: date,
      outcome: '',
    }
  }

  if (kind === 'milestone') {
    return {
      ...base,
      kind,
      dueDate: date,
    }
  }

  if (kind === 'work-session') {
    return {
      ...base,
      kind,
      scheduledFor: date,
      completedAt: '',
    }
  }

  return {
    ...base,
    kind,
    body: detail.trim(),
  }
}

export function addPlanningItem(
  state: PlanningState,
  item: PlanningItem,
  now = new Date(),
): PlanningState {
  const collection = KIND_TO_COLLECTION[item.kind]

  return {
    ...state,
    [collection]: [
      item,
      ...(state[collection] as PlanningItem[]).filter((candidate) => candidate.id !== item.id),
    ],
    updatedAt: now.toISOString(),
  } as PlanningState
}

function applyUpdate<T extends PlanningItem>(
  item: T,
  update: PlanningItemUpdate,
  now: Date,
): T {
  const next = {
    ...item,
    ...update,
    updatedAt: now.toISOString(),
  }

  if (next.kind === 'note') {
    next.body = typeof update.body === 'string' ? update.body : next.detail
  }

  return next
}

export function updatePlanningItem(
  state: PlanningState,
  kind: PlanningItemKind,
  itemId: string,
  update: PlanningItemUpdate,
  now = new Date(),
): PlanningState {
  const collection = KIND_TO_COLLECTION[kind]

  return {
    ...state,
    [collection]: (state[collection] as PlanningItem[]).map((item) =>
      item.id === itemId ? applyUpdate(item, update, now) : item,
    ),
    updatedAt: now.toISOString(),
  } as PlanningState
}

export function deletePlanningItem(
  state: PlanningState,
  kind: PlanningItemKind,
  itemId: string,
  now = new Date(),
): PlanningState {
  const collection = KIND_TO_COLLECTION[kind]

  return {
    ...state,
    [collection]: (state[collection] as PlanningItem[]).filter((item) => item.id !== itemId),
    updatedAt: now.toISOString(),
  } as PlanningState
}

export function getPlanningForProject(
  state: PlanningState,
  projectId: string,
): ProjectPlanningRecords {
  const objectives = state.objectives
    .filter((item) => item.projectId === projectId)
    .sort(byDateThenUpdatedAt((item) => item.targetDate))
  const milestones = state.milestones
    .filter((item) => item.projectId === projectId)
    .sort(byDateThenUpdatedAt((item) => item.dueDate))
  const workSessions = state.workSessions
    .filter((item) => item.projectId === projectId)
    .sort(byDateThenUpdatedAt((item) => item.scheduledFor))
  const notes = state.notes.filter((item) => item.projectId === projectId).sort(byUpdatedAt)

  return {
    objectives,
    milestones,
    workSessions,
    notes,
    all: [...objectives, ...milestones, ...workSessions, ...notes].sort(byUpdatedAt),
  }
}

export function summarizePlanningState(state: PlanningState): PlanningSummary {
  const all = [
    ...state.objectives,
    ...state.milestones,
    ...state.workSessions,
    ...state.notes,
  ]

  return {
    objectives: state.objectives.length,
    milestones: state.milestones.length,
    workSessions: state.workSessions.length,
    notes: state.notes.length,
    active: all.filter((item) => item.status === 'active').length,
    planned: all.filter((item) => item.status === 'planned').length,
    waiting: all.filter((item) => item.status === 'waiting').length,
  }
}

export function annotatePlanningItemFromRecord<T extends PlanningItem>(
  item: T,
  record: ProjectRecord | undefined,
): T {
  if (!record) {
    return item
  }

  return {
    ...item,
    sectionId: record.section.id,
    groupId: record.group.id,
  }
}
