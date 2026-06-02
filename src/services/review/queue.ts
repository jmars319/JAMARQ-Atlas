import type { ProjectRecord } from '../../domain/atlas'
import type { DispatchState } from '../../domain/dispatch'
import type { AtlasPlanningState, PlanningItem } from '../../domain/planning'
import type { ReviewDueState, ReviewQueueItem, ReviewQueueSummary, ReviewSeverity, ReviewState } from '../../domain/review'
import type { ReportsState } from '../../domain/reports'
import type { AtlasSyncState } from '../../domain/sync'
import type { TimelineEvent } from '../../domain/timeline'
import type { WritingWorkbenchState } from '../../domain/writing'
import type { GithubRepoCommandSummary } from '../githubCommand'
import type { RepoOperationsRow } from '../repoOperations'
import type { RepoPlacementSuggestion } from '../repoSuggestions'
import type { VercelDeploymentCommandSummary } from '../vercelIntegration'
import { deriveAtlasActionIntents } from '../actionPlanner'
import { deriveDispatchQueueItems } from '../dispatchQueue'
import { evaluateVerification } from '../verification'
import { deriveVercelReadinessSignals } from '../vercelIntegration'

const REVIEW_STALE_SNAPSHOT_DAYS = 14

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

function vercelDeploymentItems({
  projectRecords,
  dispatch,
  summaries,
}: {
  projectRecords: ProjectRecord[]
  dispatch: DispatchState
  summaries: VercelDeploymentCommandSummary[]
}): ReviewQueueItem[] {
  const recordsByProject = new Map(projectRecords.map((record) => [record.project.id, record]))
  const targetById = new Map(dispatch.targets.map((target) => [target.id, target]))

  return summaries.flatMap((summary): ReviewQueueItem[] => {
    const target = targetById.get(summary.targetId)

    if (!target) {
      return []
    }

    const record = recordsByProject.get(target.projectId)
    const repositoryKeys =
      record?.project.repositories.map((repository) => `${repository.owner}/${repository.name}`) ??
      []
    const activeSignals = deriveVercelReadinessSignals({
      summary,
      target,
      repositoryKeys,
    }).filter((signal) => ['warning', 'danger'].includes(signal.severity))

    return activeSignals.slice(0, 5).map((signal): ReviewQueueItem => ({
      id: `dispatch-vercel-${target.id}-${signal.id}`,
      source: 'dispatch',
      severity: signal.severity === 'danger' ? 'high' : 'medium',
      dueState: signal.severity === 'danger' ? 'blocked' : 'attention',
      title: `${record?.project.name ?? target.name}: ${signal.title}`,
      detail: signal.detail,
      reason: 'Vercel deployment evidence is advisory and needs human review before any deploy decision.',
      ...projectFields(record, target.projectId),
      occurredAt: summary.fetchedAt,
      meta: [target.hostType, target.environment, signal.category, summary.projectIdOrName ?? 'unmapped'],
    }))
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
    title: `${suggestion.repository.fullName} is unconnected`,
    detail:
      suggestion.suggestedProjectName ??
      ([suggestion.suggestedSectionName, suggestion.suggestedGroupName]
        .filter(Boolean)
        .join(' / ') || 'No strong placement suggestion.'),
    reason: suggestion.reasons[0]?.detail || 'Repository is available but not connected to Atlas.',
    projectId: suggestion.suggestedProjectId,
    sectionId: suggestion.suggestedSectionId,
    sectionName: suggestion.suggestedSectionName,
    groupName: suggestion.suggestedGroupName,
    projectName: suggestion.suggestedProjectName,
    repositoryKey: suggestion.repositoryKey,
    meta: [suggestion.confidence, String(suggestion.score)],
  }))
}

function githubCommandItems(
  projectRecords: ProjectRecord[],
  summaries: GithubRepoCommandSummary[],
): ReviewQueueItem[] {
  return deriveAtlasActionIntents({ projectRecords, summaries })
    .slice(0, 20)
    .map((intent): ReviewQueueItem => {
      const record = projectRecords.find((candidate) => candidate.project.id === intent.target.projectId)
      const severity: ReviewSeverity =
        intent.risk === 'high' ? 'high' : intent.risk === 'medium' ? 'medium' : 'low'

      return {
        id: `github-action-${intent.id}`,
        source: 'github',
        severity,
        dueState: intent.status === 'blocked' || intent.risk === 'high' ? 'blocked' : 'attention',
        title: intent.title,
        detail: intent.detail,
        reason: `${intent.reason} Action execution remains locked; Review can only create explicit sessions or notes.`,
        ...projectFields(record, intent.target.projectId),
        repositoryKey: intent.target.repositoryKey,
        occurredAt: intent.occurredAt ?? undefined,
        meta: [intent.kind, intent.group, intent.source, 'planner-only'],
      }
    })
}

function repoOperationsItems(rows: RepoOperationsRow[]): ReviewQueueItem[] {
  return rows.flatMap((row): ReviewQueueItem[] => {
    const reviewableGaps = row.gaps.filter((gap) =>
      [
        'dirty-local-clone',
        'behind-upstream',
        'missing-local-clone',
        'missing-github-binding',
        'missing-verification-command',
        'missing-planning-follow-up',
      ].includes(gap),
    )

    if (reviewableGaps.length === 0) {
      return []
    }

    return [
      {
        id: `repo-ops-${row.repository.id}`,
        source: 'github',
        severity: reviewableGaps.some((gap) =>
          ['dirty-local-clone', 'behind-upstream'].includes(gap),
        )
          ? 'high'
          : 'medium',
        dueState: reviewableGaps.some((gap) =>
          ['dirty-local-clone', 'behind-upstream'].includes(gap),
        )
          ? 'blocked'
          : 'attention',
        title: `${row.repository.name} has repo workflow gaps`,
        detail: reviewableGaps.join(', '),
        reason:
          'Repo Operations snapshot or local Git evidence indicates workflow follow-up is needed.',
        ...projectFields(row.boundProject ?? undefined, row.boundProject?.project.id ?? null),
        repositoryKey: `${row.repository.githubOwner}/${row.repository.githubRepo}`,
        meta: [row.repository.lifecycle, row.repository.deployCategory, ...reviewableGaps],
      },
    ]
  })
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
  githubCommandSummaries = [],
  vercelCommandSummaries = [],
  repoOperationsRows = [],
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
  githubCommandSummaries?: GithubRepoCommandSummary[]
  vercelCommandSummaries?: VercelDeploymentCommandSummary[]
  repoOperationsRows?: RepoOperationsRow[]
  now?: Date
}): ReviewQueueItem[] {
  return [
    ...verificationItems(projectRecords, now),
    ...workspaceItems(projectRecords),
    ...dispatchItems({ projectRecords, dispatch, reports }),
    ...vercelDeploymentItems({ projectRecords, dispatch, summaries: vercelCommandSummaries }),
    ...planningItems(projectRecords, planning, now),
    ...writingItems(projectRecords, writing),
    ...reportItems(projectRecords, reports),
    ...githubItems(repoSuggestions),
    ...githubCommandItems(projectRecords, githubCommandSummaries),
    ...repoOperationsItems(repoOperationsRows),
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

export type ReviewQueueGroupId =
  | 'due-overdue'
  | 'blocked'
  | 'dispatch'
  | 'github-data'
  | 'planning-writing-reports'
  | 'data-sync'

export interface ReviewQueueGroup {
  id: ReviewQueueGroupId
  label: string
  detail: string
  items: ReviewQueueItem[]
}

const REVIEW_QUEUE_GROUPS: Array<Omit<ReviewQueueGroup, 'items'>> = [
  {
    id: 'due-overdue',
    label: 'Due / overdue',
    detail: 'Verification and planning items with dates that need attention.',
  },
  {
    id: 'blocked',
    label: 'Blocked',
    detail: 'Manual blockers, waiting work, and high-risk workspace items.',
  },
  {
    id: 'dispatch',
    label: 'Dispatch',
    detail: 'Deploy queue, closeout, and deployment evidence follow-up.',
  },
  {
    id: 'github-data',
    label: 'GitHub / data gaps',
    detail: 'Repository placement, command signals, permission gaps, and Timeline warnings.',
  },
  {
    id: 'planning-writing-reports',
    label: 'Planning / Writing / Reports',
    detail: 'Follow-up records and local packets waiting for human action.',
  },
  {
    id: 'data-sync',
    label: 'Data / Sync',
    detail: 'Backup and snapshot freshness checks.',
  },
]

export function reviewQueueGroupId(item: ReviewQueueItem): ReviewQueueGroupId {
  if (item.source === 'dispatch') {
    return 'dispatch'
  }

  if (item.source === 'github' || item.source === 'timeline') {
    return 'github-data'
  }

  if (['planning', 'writing', 'reports'].includes(item.source)) {
    return item.dueState === 'overdue' || item.dueState === 'due'
      ? 'due-overdue'
      : 'planning-writing-reports'
  }

  if (item.source === 'data-sync') {
    return 'data-sync'
  }

  if (item.dueState === 'overdue' || item.dueState === 'due') {
    return 'due-overdue'
  }

  return 'blocked'
}

export function groupReviewQueue(items: ReviewQueueItem[]): ReviewQueueGroup[] {
  return REVIEW_QUEUE_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => reviewQueueGroupId(item) === group.id),
  })).filter((group) => group.items.length > 0)
}

export function deriveTodaysReviewQueue(items: ReviewQueueItem[], limit = 12): ReviewQueueItem[] {
  return items
    .filter(
      (item) =>
        ['critical', 'high'].includes(item.severity) ||
        ['overdue', 'due', 'blocked', 'attention'].includes(item.dueState),
    )
    .slice(0, limit)
}

export function createReviewPlanningHandoff(item: ReviewQueueItem, noteDraft = '') {
  const detail =
    noteDraft.trim() ||
    `${item.title}\n\nReason: ${item.reason}\n\nDetail: ${item.detail}`

  return {
    title: `Review follow-up: ${item.title}`,
    detail,
    reviewNoteBody: `Created explicit Planning note from Review Center.\n\n${detail}`,
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

