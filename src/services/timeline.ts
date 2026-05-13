import type { ProjectRecord } from '../domain/atlas'
import type { AtlasCalibrationState } from '../domain/calibration'
import type { DispatchState } from '../domain/dispatch'
import type { AtlasPlanningState, PlanningItem } from '../domain/planning'
import type { ReportsState } from '../domain/reports'
import type { ReviewState } from '../domain/review'
import type { AtlasSyncState } from '../domain/sync'
import type { TimelineEvent, TimelineEventSource, TimelineEventType, TimelineFilters } from '../domain/timeline'
import type { WritingWorkbenchState } from '../domain/writing'

export const defaultTimelineFilters: TimelineFilters = {
  projectId: 'all',
  sectionId: 'all',
  source: 'all',
  type: 'all',
  dateRange: 'all',
  query: '',
}

function activitySourceToTimelineSource(source: string, type: string): TimelineEventSource {
  if (source === 'github') {
    return 'github'
  }

  if (source === 'deployment' || type === 'deployment') {
    return 'dispatch'
  }

  if (type === 'verification') {
    return 'verification'
  }

  return 'workspace'
}

function activityTypeToTimelineType(type: string): TimelineEventType {
  if (type === 'verification') {
    return 'verification'
  }

  if (type === 'deployment') {
    return 'deployment'
  }

  if (['commit', 'pull-request', 'issue', 'release', 'workflow'].includes(type)) {
    return 'github'
  }

  return 'activity'
}

function toneForDispatchStatus(status: string) {
  if (status === 'failed' || status === 'rollback-needed' || status === 'blocked') {
    return 'danger' as const
  }

  if (status === 'verification' || status === 'warning') {
    return 'warning' as const
  }

  if (status === 'stable' || status === 'passing') {
    return 'success' as const
  }

  return 'info' as const
}

function findRecord(projectRecords: ProjectRecord[], projectId: string) {
  return projectRecords.find((record) => record.project.id === projectId)
}

function withProject(
  projectRecords: ProjectRecord[],
  projectId: string | null,
  event: Omit<TimelineEvent, 'projectName' | 'sectionId' | 'sectionName' | 'groupName'>,
): TimelineEvent {
  const record = projectId ? findRecord(projectRecords, projectId) : undefined

  return {
    ...event,
    projectName: record?.project.name ?? null,
    sectionId: record?.section.id ?? null,
    sectionName: record?.section.name ?? null,
    groupName: record?.group.name ?? null,
  }
}

function planningOccurredAt(item: PlanningItem) {
  if (item.kind === 'work-session' && item.completedAt) {
    return item.completedAt
  }

  return item.updatedAt || item.createdAt
}

export function deriveTimelineEvents({
  projectRecords,
  dispatch,
  writing,
  planning,
  reports,
  review,
  calibration,
  sync,
}: {
  projectRecords: ProjectRecord[]
  dispatch: DispatchState
  writing: WritingWorkbenchState
  planning: AtlasPlanningState
  reports: ReportsState
  review: ReviewState
  calibration?: AtlasCalibrationState
  sync: AtlasSyncState
}): TimelineEvent[] {
  const workspaceEvents = projectRecords.flatMap((record) =>
    record.project.activity.map((event) =>
      withProject(projectRecords, record.project.id, {
        id: `workspace-${record.project.id}-${event.id}`,
        source: activitySourceToTimelineSource(event.source, event.type),
        type: activityTypeToTimelineType(event.type),
        tone: event.type === 'decision' ? 'success' : 'neutral',
        title: event.title,
        detail: event.detail,
        occurredAt: event.occurredAt,
        projectId: record.project.id,
        url: event.url,
        meta: [event.source, event.type, record.section.name, record.group.name].filter(Boolean),
      }),
    ),
  )

  const deploymentEvents = dispatch.records.map((record) =>
    withProject(projectRecords, record.projectId, {
      id: `dispatch-record-${record.id}`,
      source: 'dispatch',
      type: 'deployment',
      tone: toneForDispatchStatus(record.status),
      title: `Deployment record: ${record.versionLabel}`,
      detail: record.summary,
      occurredAt: record.completedAt || record.startedAt,
      projectId: record.projectId,
      meta: [record.environment, record.status, record.sourceRef, record.artifactName].filter(Boolean),
    }),
  )

  const preflightEvents = dispatch.preflightRuns.map((run) => {
    const target = dispatch.targets.find((candidate) => candidate.id === run.targetId)

    return withProject(projectRecords, run.projectId, {
      id: `dispatch-preflight-${run.id}`,
      source: 'dispatch',
      type: 'preflight',
      tone: toneForDispatchStatus(run.status),
      title: `Preflight: ${target?.name ?? run.targetId}`,
      detail: run.summary,
      occurredAt: run.completedAt || run.startedAt,
      projectId: run.projectId,
      meta: [run.status, `${run.checks.length} checks`],
    })
  })

  const hostEvidenceEvents = dispatch.hostEvidenceRuns.map((run) => {
    const target = dispatch.targets.find((candidate) => candidate.id === run.targetId)

    return withProject(projectRecords, run.projectId, {
      id: `dispatch-host-evidence-${run.id}`,
      source: 'dispatch',
      type: 'preflight',
      tone: toneForDispatchStatus(run.status),
      title: `Host evidence: ${target?.name ?? run.targetId}`,
      detail: run.summary,
      occurredAt: run.completedAt || run.startedAt,
      projectId: run.projectId,
      meta: [run.status, run.probeMode, run.authMethod, `${run.checks.length} checks`],
    })
  })

  const verificationEvidenceEvents = dispatch.verificationEvidenceRuns.map((run) => {
    const target = dispatch.targets.find((candidate) => candidate.id === run.targetId)

    return withProject(projectRecords, run.projectId, {
      id: `dispatch-verification-evidence-${run.id}`,
      source: 'dispatch',
      type: 'preflight',
      tone: toneForDispatchStatus(run.status),
      title: `Runbook verification: ${target?.name ?? run.targetId}`,
      detail: run.summary,
      occurredAt: run.completedAt || run.startedAt,
      projectId: run.projectId,
      meta: [run.status, `${run.checks.length} checks`],
    })
  })

  const writingEvents = writing.drafts.flatMap((draft) =>
    draft.reviewEvents.map((event) =>
      withProject(projectRecords, draft.projectId, {
        id: `writing-${draft.id}-${event.id}`,
        source: 'writing',
        type: 'writing',
        tone: event.type === 'approved' || event.type === 'markdown-exported' ? 'success' : 'info',
        title: `${draft.title}: ${event.type}`,
        detail: event.detail,
        occurredAt: event.occurredAt,
        projectId: draft.projectId,
        meta: [draft.status, draft.templateId],
      }),
    ),
  )

  const planningItems: PlanningItem[] = [
    ...planning.objectives,
    ...planning.milestones,
    ...planning.workSessions,
    ...planning.notes,
  ]
  const planningEvents = planningItems.map((item) =>
    withProject(projectRecords, item.projectId, {
      id: `planning-${item.id}`,
      source: 'planning',
      type: 'planning',
      tone: item.status === 'done' ? 'success' : item.status === 'waiting' ? 'warning' : 'info',
      title: `${item.kind}: ${item.title}`,
      detail: item.detail || ('body' in item ? item.body : ''),
      occurredAt: planningOccurredAt(item),
      projectId: item.projectId,
      meta: [item.kind, item.status],
    }),
  )

  const reportEvents = reports.packets.flatMap((packet) =>
    packet.auditEvents.map((event) =>
      withProject(projectRecords, packet.projectIds.length === 1 ? packet.projectIds[0] : null, {
        id: `report-${packet.id}-${event.id}`,
        source: 'reports',
        type: 'report',
        tone: event.type === 'markdown-exported' ? 'success' : 'info',
        title: `${packet.title}: ${event.type}`,
        detail: event.detail,
        occurredAt: event.occurredAt,
        projectId: packet.projectIds.length === 1 ? packet.projectIds[0] : null,
        meta: [packet.type, packet.status, `${packet.projectIds.length} projects`],
      }),
    ),
  )

  const reviewSessionEvents = review.sessions.map((session) =>
    withProject(projectRecords, session.projectIds.length === 1 ? session.projectIds[0] : null, {
      id: `review-session-${session.id}`,
      source: 'review',
      type: 'review',
      tone: session.outcome === 'needs-follow-up' ? 'warning' : 'info',
      title: session.title,
      detail: session.notes || `${session.itemIds.length} review item(s) captured.`,
      occurredAt: session.updatedAt,
      projectId: session.projectIds.length === 1 ? session.projectIds[0] : null,
      meta: [session.scope, session.cadence, session.outcome],
    }),
  )

  const reviewNoteEvents = review.notes.map((note) =>
    withProject(projectRecords, note.projectId, {
      id: `review-note-${note.id}`,
      source: 'review',
      type: 'review',
      tone: note.outcome === 'needs-follow-up' ? 'warning' : note.outcome === 'planned' ? 'success' : 'info',
      title: `Review note: ${note.outcome}`,
      detail: note.body,
      occurredAt: note.createdAt,
      projectId: note.projectId,
      meta: [note.source, note.outcome],
    }),
  )

  const calibrationEvents = (calibration?.auditEvents ?? []).map((event) =>
    withProject(projectRecords, event.projectId ?? null, {
      id: `calibration-${event.id}`,
      source: 'calibration',
      type: 'calibration',
      tone: event.type === 'import-apply' ? 'success' : 'info',
      title: `Calibration: ${event.type}`,
      detail: event.summary,
      occurredAt: event.occurredAt,
      projectId: event.projectId ?? null,
      meta: [event.type, event.field ?? '', event.operatorLabel].filter(Boolean),
    }),
  )

  const syncEvents: TimelineEvent[] = [
    ...sync.snapshots.map((snapshot) =>
      withProject(projectRecords, null, {
        id: `sync-local-${snapshot.id}`,
        source: 'sync',
        type: 'sync',
        tone: 'info',
        title: `Local snapshot: ${snapshot.label}`,
        detail: snapshot.note || `Fingerprint ${snapshot.fingerprint}`,
        occurredAt: snapshot.createdAt,
        projectId: null,
        meta: [snapshot.deviceLabel, snapshot.fingerprint],
      }),
    ),
    ...sync.provider.remoteSnapshots.map((snapshot) =>
      withProject(projectRecords, null, {
        id: `sync-remote-${snapshot.id}`,
        source: 'sync',
        type: 'sync',
        tone: 'info',
        title: `Remote snapshot: ${snapshot.label}`,
        detail: snapshot.note || `Fingerprint ${snapshot.fingerprint}`,
        occurredAt: snapshot.createdAt,
        projectId: null,
        meta: [snapshot.deviceLabel, snapshot.fingerprint],
      }),
    ),
  ]

  if (sync.provider.lastPushAt) {
    syncEvents.push(
      withProject(projectRecords, null, {
        id: `sync-provider-push-${sync.provider.lastPushAt}`,
        source: 'sync',
        type: 'sync',
        tone: 'info',
        title: 'Hosted sync push',
        detail: sync.provider.message,
        occurredAt: sync.provider.lastPushAt,
        projectId: null,
        meta: [sync.provider.status, sync.provider.workspaceId ?? 'local'],
      }),
    )
  }

  if (sync.provider.lastPullAt) {
    syncEvents.push(
      withProject(projectRecords, null, {
        id: `sync-provider-pull-${sync.provider.lastPullAt}`,
        source: 'sync',
        type: 'sync',
        tone: 'info',
        title: 'Hosted sync pull',
        detail: sync.provider.message,
        occurredAt: sync.provider.lastPullAt,
        projectId: null,
        meta: [sync.provider.status, sync.provider.workspaceId ?? 'local'],
      }),
    )
  }

  return [
    ...workspaceEvents,
    ...deploymentEvents,
    ...preflightEvents,
    ...hostEvidenceEvents,
    ...verificationEvidenceEvents,
    ...writingEvents,
    ...planningEvents,
    ...reportEvents,
    ...reviewSessionEvents,
    ...reviewNoteEvents,
    ...calibrationEvents,
    ...syncEvents,
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
}

function dateRangeCutoff(dateRange: TimelineFilters['dateRange'], now = new Date()) {
  if (dateRange === 'all') {
    return null
  }

  const days = Number.parseInt(dateRange, 10)
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - days)

  return cutoff
}

export function filterTimelineEvents(
  events: TimelineEvent[],
  filters: TimelineFilters,
  now = new Date(),
) {
  const query = filters.query.trim().toLowerCase()
  const cutoff = dateRangeCutoff(filters.dateRange, now)

  return events.filter((event) => {
    if (filters.projectId !== 'all' && event.projectId !== filters.projectId) {
      return false
    }

    if (filters.sectionId !== 'all' && event.sectionId !== filters.sectionId) {
      return false
    }

    if (filters.source !== 'all' && event.source !== filters.source) {
      return false
    }

    if (filters.type !== 'all' && event.type !== filters.type) {
      return false
    }

    if (cutoff && new Date(event.occurredAt) < cutoff) {
      return false
    }

    if (!query) {
      return true
    }

    return [
      event.title,
      event.detail,
      event.projectName,
      event.sectionName,
      event.groupName,
      event.source,
      event.type,
      ...event.meta,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query)
  })
}
