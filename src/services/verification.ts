import type {
  ActivityEvent,
  AtlasProject,
  ProjectRecord,
  VerificationCadence,
  Workspace,
} from '../domain/atlas'
import { VERIFICATION_CADENCES, updateProject } from '../domain/atlas'

export type VerificationDueState =
  | 'overdue'
  | 'due'
  | 'upcoming'
  | 'recent'
  | 'ad-hoc'
  | 'unverified'

export interface VerificationEvaluation {
  cadence: VerificationCadence
  dueState: VerificationDueState
  dueDate: string | null
  daysSinceVerified: number | null
  daysUntilDue: number | null
}

export interface VerificationQueueItem {
  record: ProjectRecord
  evaluation: VerificationEvaluation
}

const RECENT_WINDOW_DAYS = 7
const UPCOMING_WINDOW_DAYS = 14

function parseDate(value: string): Date | null {
  if (!value) {
    return null
  }

  const parsed = new Date(value.includes('T') ? value : `${value}T12:00:00`)

  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function dayDiff(first: Date, second: Date) {
  const firstUtc = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate())
  const secondUtc = Date.UTC(second.getUTCFullYear(), second.getUTCMonth(), second.getUTCDate())

  return Math.floor((secondUtc - firstUtc) / 86_400_000)
}

export function getVerificationCadenceDefinition(cadence: VerificationCadence) {
  return (
    VERIFICATION_CADENCES.find((definition) => definition.id === cadence) ??
    VERIFICATION_CADENCES.find((definition) => definition.id === 'monthly')!
  )
}

export function addCadenceDays(lastVerified: string, cadence: VerificationCadence) {
  const definition = getVerificationCadenceDefinition(cadence)
  const parsed = parseDate(lastVerified)

  if (!parsed || definition.days === null) {
    return null
  }

  const due = new Date(parsed)
  due.setUTCDate(due.getUTCDate() + definition.days)

  return toIsoDate(due)
}

export function evaluateVerification(
  project: AtlasProject,
  now = new Date(),
): VerificationEvaluation {
  const cadence = project.manual.verificationCadence ?? 'monthly'
  const definition = getVerificationCadenceDefinition(cadence)

  if (definition.days === null) {
    return {
      cadence,
      dueState: 'ad-hoc',
      dueDate: null,
      daysSinceVerified: null,
      daysUntilDue: null,
    }
  }

  const lastVerified = parseDate(project.manual.lastVerified)

  if (!lastVerified) {
    return {
      cadence,
      dueState: 'unverified',
      dueDate: null,
      daysSinceVerified: null,
      daysUntilDue: null,
    }
  }

  const daysSinceVerified = dayDiff(lastVerified, now)
  const dueDate = addCadenceDays(project.manual.lastVerified, cadence)
  const due = dueDate ? parseDate(dueDate) : null
  const daysUntilDue = due ? dayDiff(now, due) : null
  let dueState: VerificationDueState = 'upcoming'

  if (daysUntilDue !== null && daysUntilDue < 0) {
    dueState = 'overdue'
  } else if (daysUntilDue === 0) {
    dueState = 'due'
  } else if (daysSinceVerified <= RECENT_WINDOW_DAYS) {
    dueState = 'recent'
  } else if (daysUntilDue !== null && daysUntilDue <= UPCOMING_WINDOW_DAYS) {
    dueState = 'upcoming'
  }

  return {
    cadence,
    dueState,
    dueDate,
    daysSinceVerified,
    daysUntilDue,
  }
}

const stateRank: Record<VerificationDueState, number> = {
  overdue: 0,
  unverified: 1,
  due: 2,
  upcoming: 3,
  recent: 4,
  'ad-hoc': 5,
}

export function buildVerificationQueue(
  projectRecords: ProjectRecord[],
  now = new Date(),
): VerificationQueueItem[] {
  return projectRecords
    .map((record) => ({
      record,
      evaluation: evaluateVerification(record.project, now),
    }))
    .sort((first, second) => {
      const rankDiff = stateRank[first.evaluation.dueState] - stateRank[second.evaluation.dueState]

      if (rankDiff !== 0) {
        return rankDiff
      }

      return (first.evaluation.dueDate ?? '9999-12-31').localeCompare(
        second.evaluation.dueDate ?? '9999-12-31',
      )
    })
}

export function normalizeWorkspaceVerificationCadence(workspace: Workspace): Workspace {
  return {
    ...workspace,
    sections: workspace.sections.map((section) => ({
      ...section,
      groups: section.groups.map((group) => ({
        ...group,
        projects: group.projects.map((project) => ({
          ...project,
          manual: {
            ...project.manual,
            verificationCadence: project.manual.verificationCadence ?? 'monthly',
          },
        })),
      })),
    })),
  }
}

export function updateProjectVerificationCadence(
  workspace: Workspace,
  projectId: string,
  verificationCadence: VerificationCadence,
) {
  return updateProject(workspace, projectId, (project) => ({
    ...project,
    manual: {
      ...project.manual,
      verificationCadence,
    },
  }))
}

function verificationActivityId(projectId: string, verifiedAt: string) {
  return `${projectId}-verification-${verifiedAt}`
}

export function markProjectVerified(
  workspace: Workspace,
  projectId: string,
  note: string,
  verifiedAt = new Date().toISOString().slice(0, 10),
) {
  return updateProject(workspace, projectId, (project) => {
    const activity: ActivityEvent = {
      id: verificationActivityId(project.id, verifiedAt),
      source: 'manual',
      type: 'verification',
      title: 'Manual verification recorded',
      detail: note.trim() || 'Operator marked this project verified in Atlas.',
      occurredAt: verifiedAt,
    }
    const existingActivityIndex = project.activity.findIndex((event) => event.id === activity.id)
    const activityEvents =
      existingActivityIndex >= 0
        ? project.activity.map((event, index) => (index === existingActivityIndex ? activity : event))
        : [activity, ...project.activity]

    return {
      ...project,
      manual: {
        ...project.manual,
        lastVerified: verifiedAt,
      },
      activity: activityEvents,
    }
  })
}
