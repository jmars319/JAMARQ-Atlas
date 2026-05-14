import { flattenProjects, type ProjectRecord, type Workspace } from '../domain/atlas'
import type { AtlasCalibrationState } from '../domain/calibration'
import type { DataIntegrityDiagnostic } from '../domain/dataIntegrity'
import type {
  OperationsAction,
  OperationsCockpitSummary,
  OperationsQueueItem,
  OperationsQueueReason,
  OperationsReadinessGrade,
} from '../domain/operations'
import type { DispatchQueueItem } from './dispatchQueue'
import type { DispatchState } from '../domain/dispatch'
import type { ReportsState } from '../domain/reports'
import type { AtlasSyncState } from '../domain/sync'
import { createCalibrationWorkflow } from './calibrationWorkflow'
import type { CalibrationIssue } from './calibration'
import { deriveDispatchQueueItems } from './dispatchQueue'
import { evaluateVerification } from './verification'

export const DEFAULT_OPERATIONS_STALE_EVIDENCE_DAYS = 7
export const DEFAULT_OPERATIONS_STALE_SNAPSHOT_DAYS = 7

type QueueReasonInput = Omit<OperationsQueueReason, 'priority'> & { priority: number }

export interface CreateOperationsCockpitSummaryInput {
  workspace: Workspace
  dispatch: DispatchState
  reports: ReportsState
  sync: AtlasSyncState
  calibration: AtlasCalibrationState
  calibrationIssues: CalibrationIssue[]
  dataIntegrityDiagnostics: DataIntegrityDiagnostic[]
  now?: Date
  staleEvidenceDays?: number
  staleSnapshotDays?: number
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) {
    return null
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function daysSince(value: string | null | undefined, now: Date): number | null {
  const parsed = parseDate(value)

  if (!parsed) {
    return null
  }

  return Math.floor((now.getTime() - parsed.getTime()) / 86_400_000)
}

function gradeRank(grade: OperationsReadinessGrade) {
  if (grade === 'blocked') {
    return 3
  }

  if (grade === 'attention') {
    return 2
  }

  return 1
}

function worstGrade(grades: OperationsReadinessGrade[]): OperationsReadinessGrade {
  if (grades.some((grade) => grade === 'blocked')) {
    return 'blocked'
  }

  if (grades.some((grade) => grade === 'attention')) {
    return 'attention'
  }

  return 'ready'
}

function reason(input: QueueReasonInput): OperationsQueueReason {
  return input
}

function queueItem({
  id,
  label,
  projectId,
  projectName,
  targetId,
  targetName,
  reasons,
  actions,
  updatedAt,
}: Omit<OperationsQueueItem, 'grade' | 'score' | 'summary'> & {
  reasons: OperationsQueueReason[]
}): OperationsQueueItem {
  const grade = worstGrade(reasons.map((item) => item.grade))
  const score = reasons.reduce((highest, item) => Math.max(highest, item.priority), 0)

  return {
    id,
    label,
    grade,
    score,
    projectId,
    projectName,
    targetId,
    targetName,
    summary: reasons[0]?.detail ?? '',
    reasons,
    actions,
    updatedAt,
  }
}

function projectActions(record: ProjectRecord | undefined): OperationsAction[] {
  if (!record) {
    return []
  }

  return [
    {
      id: 'open-project',
      label: 'Open project',
      projectId: record.project.id,
    },
    {
      id: 'create-planning-follow-up',
      label: 'Create planning follow-up',
      projectId: record.project.id,
    },
  ]
}

function targetActions(item: DispatchQueueItem): OperationsAction[] {
  return [
    {
      id: 'open-dispatch-target',
      label: 'Open target',
      projectId: item.target.projectId,
      targetId: item.target.id,
    },
    {
      id: 'run-read-only-evidence-sweep',
      label: 'Run read-only evidence sweep',
      projectId: item.target.projectId,
      targetId: item.target.id,
    },
    {
      id: 'start-manual-deploy-session',
      label: 'Start manual deploy session',
      projectId: item.target.projectId,
      targetId: item.target.id,
    },
    {
      id: 'create-report-packet',
      label: 'Create report packet',
      projectId: item.target.projectId,
      targetId: item.target.id,
      reportType: 'operations-readiness-packet',
    },
    {
      id: 'create-planning-follow-up',
      label: 'Create planning follow-up',
      projectId: item.target.projectId,
      targetId: item.target.id,
    },
  ]
}

function checkedAtValues(item: DispatchQueueItem) {
  return [
    item.preflightStatus.checkedAt,
    item.hostStatus.checkedAt,
    item.verificationStatus.checkedAt,
  ].filter(Boolean)
}

function latest(values: string[]) {
  return values.sort((left, right) => right.localeCompare(left))[0] ?? ''
}

function staleEvidenceReason(
  item: DispatchQueueItem,
  now: Date,
  staleEvidenceDays: number,
): OperationsQueueReason | null {
  const staleSignals = [
    { label: 'Preflight', signal: item.preflightStatus },
    { label: 'Host', signal: item.hostStatus },
    { label: 'Verification', signal: item.verificationStatus },
  ].filter(({ signal }) => {
    const age = daysSince(signal.checkedAt, now)
    return age !== null && age > staleEvidenceDays
  })

  if (staleSignals.length === 0) {
    return null
  }

  return reason({
    id: 'stale-evidence',
    label: 'Stale evidence',
    grade: 'attention',
    priority: 600,
    affectedCount: staleSignals.length,
    detail: `${staleSignals.map((signal) => signal.label).join(', ')} evidence is older than ${staleEvidenceDays} day(s).`,
  })
}

function missingEvidenceReason(item: DispatchQueueItem): OperationsQueueReason | null {
  const missing = [
    { label: 'Preflight', signal: item.preflightStatus },
    { label: 'Host', signal: item.hostStatus },
    { label: 'Verification', signal: item.verificationStatus },
  ].filter(({ signal }) => signal.status === 'missing' || signal.status === 'not-configured')

  if (missing.length === 0) {
    return null
  }

  return reason({
    id: 'missing-evidence',
    label: 'Missing evidence',
    grade: 'blocked',
    priority: 620,
    affectedCount: missing.length,
    detail: `${missing.map((signal) => signal.label).join(', ')} evidence has not been captured.`,
  })
}

function targetArtifactReason(item: DispatchQueueItem): OperationsQueueReason | null {
  if (item.state !== 'needs-artifacts') {
    return null
  }

  return reason({
    id: 'artifacts',
    label: 'Artifact inspection',
    grade: 'blocked',
    priority: 560,
    detail: item.artifactStatus.detail,
  })
}

function targetSessionReason(item: DispatchQueueItem): OperationsQueueReason | null {
  if (!item.activeSession) {
    return null
  }

  return reason({
    id: 'active-session',
    label: 'Active manual session',
    grade: 'attention',
    priority: 400,
    detail: `Manual deploy session ${item.activeSession.id} is ${item.activeSession.status}.`,
  })
}

function targetCloseoutReason(item: DispatchQueueItem): OperationsQueueReason | null {
  if (
    item.closeout.state === 'closeout-ready' ||
    (item.closeout.state === 'not-started' && !item.latestSession && !item.latestManualDeploymentRecord)
  ) {
    return null
  }

  return reason({
    id: 'closeout',
    label: 'Closeout gap',
    grade: 'attention',
    priority: 300,
    detail: item.closeout.detail,
  })
}

function targetRecoveryReason(item: DispatchQueueItem): OperationsQueueReason | null {
  if (item.recoveryStatus.status === 'passing') {
    return null
  }

  return reason({
    id: 'recovery',
    label: 'Recovery readiness',
    grade: item.recoveryStatus.label.includes('missing') ? 'blocked' : 'attention',
    priority: 700,
    detail: item.recoveryStatus.detail,
  })
}

function targetVerificationReason(
  item: DispatchQueueItem,
  now: Date,
): OperationsQueueReason | null {
  if (!item.projectRecord) {
    return null
  }

  const evaluation = evaluateVerification(item.projectRecord.project, now)

  if (evaluation.dueState !== 'overdue' && evaluation.dueState !== 'due' && evaluation.dueState !== 'unverified') {
    return null
  }

  return reason({
    id: 'verification',
    label: 'Verification cadence',
    grade: 'attention',
    priority: evaluation.dueState === 'overdue' || evaluation.dueState === 'unverified' ? 500 : 460,
    detail:
      evaluation.dueState === 'unverified'
        ? 'Project has no verification date recorded.'
        : `Project verification is ${evaluation.dueState}; due date ${evaluation.dueDate ?? 'not set'}.`,
  })
}

function buildTargetQueueItems({
  dispatchItems,
  now,
  staleEvidenceDays,
}: {
  dispatchItems: DispatchQueueItem[]
  now: Date
  staleEvidenceDays: number
}): OperationsQueueItem[] {
  return dispatchItems.flatMap((item) => {
    const reasons = [
      missingEvidenceReason(item),
      staleEvidenceReason(item, now, staleEvidenceDays),
      targetVerificationReason(item, now),
      targetRecoveryReason(item),
      targetSessionReason(item),
      targetCloseoutReason(item),
      targetArtifactReason(item),
    ].filter((candidate): candidate is OperationsQueueReason => candidate !== null)

    if (reasons.length === 0) {
      return []
    }

    return [
      queueItem({
        id: `target:${item.target.id}`,
        label: item.projectName,
        projectId: item.target.projectId,
        projectName: item.projectName,
        targetId: item.target.id,
        targetName: item.target.name,
        reasons,
        actions: targetActions(item),
        updatedAt: latest(checkedAtValues(item)) || item.latestSession?.updatedAt || '',
      }),
    ]
  })
}

function buildProjectVerificationItems({
  projectRecords,
  dispatchItems,
  now,
}: {
  projectRecords: ProjectRecord[]
  dispatchItems: DispatchQueueItem[]
  now: Date
}): OperationsQueueItem[] {
  const projectsWithQueueTargets = new Set(dispatchItems.map((item) => item.target.projectId))

  return projectRecords.flatMap((record) => {
    if (projectsWithQueueTargets.has(record.project.id)) {
      return []
    }

    const evaluation = evaluateVerification(record.project, now)

    if (evaluation.dueState !== 'overdue' && evaluation.dueState !== 'due' && evaluation.dueState !== 'unverified') {
      return []
    }

    return [
      queueItem({
        id: `project-verification:${record.project.id}`,
        label: record.project.name,
        projectId: record.project.id,
        projectName: record.project.name,
        reasons: [
          reason({
            id: 'verification',
            label: 'Verification cadence',
            grade: 'attention',
            priority:
              evaluation.dueState === 'overdue' || evaluation.dueState === 'unverified' ? 500 : 460,
            detail:
              evaluation.dueState === 'unverified'
                ? 'Project has no verification date recorded.'
                : `Project verification is ${evaluation.dueState}; due date ${evaluation.dueDate ?? 'not set'}.`,
          }),
        ],
        actions: projectActions(record),
        updatedAt: record.project.manual.lastVerified,
      }),
    ]
  })
}

function buildDataIntegrityItems(
  diagnostics: DataIntegrityDiagnostic[],
  generatedAt: string,
): OperationsQueueItem[] {
  const danger = diagnostics.filter((diagnostic) => diagnostic.severity === 'danger')
  const warnings = diagnostics.filter((diagnostic) => diagnostic.severity === 'warning')
  const items: OperationsQueueItem[] = []

  if (danger.length > 0) {
    items.push(
      queueItem({
        id: 'data-integrity:danger',
        label: 'Data integrity danger',
        reasons: [
          reason({
            id: 'data-integrity',
            label: 'Broken references',
            grade: 'blocked',
            priority: 900,
            affectedCount: danger.reduce((total, diagnostic) => total + diagnostic.affectedCount, 0),
            sourceSeverity: 'danger',
            detail: `${danger.length} dangerous data integrity diagnostic(s) require review before daily operations.`,
          }),
        ],
        actions: [{ id: 'open-data-center', label: 'Open Data Center' }],
        updatedAt: generatedAt,
      }),
    )
  }

  if (warnings.length > 0) {
    items.push(
      queueItem({
        id: 'data-integrity:warning',
        label: 'Data integrity warnings',
        reasons: [
          reason({
            id: 'data-integrity',
            label: 'Reference warnings',
            grade: 'attention',
            priority: 350,
            affectedCount: warnings.reduce(
              (total, diagnostic) => total + diagnostic.affectedCount,
              0,
            ),
            sourceSeverity: 'warning',
            detail: `${warnings.length} data integrity warning(s) should be reviewed.`,
          }),
        ],
        actions: [{ id: 'open-data-center', label: 'Open Data Center' }],
        updatedAt: generatedAt,
      }),
    )
  }

  return items
}

function buildCalibrationItem({
  workspace,
  dispatch,
  calibration,
  sync,
  calibrationIssues,
  generatedAt,
}: Pick<
  CreateOperationsCockpitSummaryInput,
  'workspace' | 'dispatch' | 'calibration' | 'sync' | 'calibrationIssues'
> & {
  generatedAt: string
}): OperationsQueueItem | null {
  const workflow = createCalibrationWorkflow({
    workspace,
    dispatch,
    calibration,
    sync,
    issues: calibrationIssues,
  })
  const steps = workflow.flatMap((group) => group.steps)
  const blocked = steps.filter((step) => step.status === 'blocked')
  const attention = steps.filter((step) => step.status === 'attention')

  if (blocked.length === 0 && attention.length === 0) {
    return null
  }

  return queueItem({
    id: 'calibration:workflow',
    label: 'Calibration workflow',
    reasons: [
      reason({
        id: 'calibration',
        label: blocked.length > 0 ? 'Blocked calibration' : 'Unresolved calibration',
        grade: blocked.length > 0 ? 'blocked' : 'attention',
        priority: blocked.length > 0 ? 800 : 650,
        affectedCount: blocked.length + attention.length,
        detail:
          blocked.length > 0
            ? `${blocked.length} calibration setup step(s) are blocked.`
            : `${attention.length} calibration setup step(s) need review.`,
      }),
    ],
    actions: [{ id: 'open-calibration', label: 'Open Calibration' }],
    updatedAt: generatedAt,
  })
}

function buildSnapshotItem({
  sync,
  now,
  generatedAt,
  staleSnapshotDays,
}: {
  sync: AtlasSyncState
  now: Date
  generatedAt: string
  staleSnapshotDays: number
}): OperationsQueueItem | null {
  const latestSnapshotAt = sync.snapshots.map((snapshot) => snapshot.createdAt).sort().at(-1) ?? ''
  const age = daysSince(latestSnapshotAt, now)

  if (!latestSnapshotAt) {
    return queueItem({
      id: 'sync:snapshot-missing',
      label: 'Local snapshot missing',
      reasons: [
        reason({
          id: 'snapshot',
          label: 'Missing local snapshot',
          grade: 'attention',
          priority: 700,
          detail: 'Create a local Atlas snapshot before daily operational changes.',
        }),
      ],
      actions: [{ id: 'create-local-snapshot', label: 'Create local snapshot' }],
      updatedAt: generatedAt,
    })
  }

  if (age !== null && age > staleSnapshotDays) {
    return queueItem({
      id: 'sync:snapshot-stale',
      label: 'Local snapshot stale',
      reasons: [
        reason({
          id: 'snapshot',
          label: 'Stale local snapshot',
          grade: 'attention',
          priority: 700,
          detail: `Latest local snapshot is ${age} day(s) old.`,
        }),
      ],
      actions: [{ id: 'create-local-snapshot', label: 'Create local snapshot' }],
      updatedAt: latestSnapshotAt,
    })
  }

  return null
}

function sortQueue(items: OperationsQueueItem[]) {
  return [...items].sort((left, right) => {
    const scoreDiff = right.score - left.score

    if (scoreDiff !== 0) {
      return scoreDiff
    }

    const gradeDiff = gradeRank(right.grade) - gradeRank(left.grade)

    if (gradeDiff !== 0) {
      return gradeDiff
    }

    return left.label.localeCompare(right.label)
  })
}

function countTargetGrades(dispatchItems: DispatchQueueItem[], queue: OperationsQueueItem[]) {
  const byTarget = new Map(queue.filter((item) => item.targetId).map((item) => [item.targetId, item]))
  const attentionTargets = dispatchItems.filter(
    (item) => byTarget.get(item.target.id)?.grade === 'attention',
  ).length
  const blockedTargets = dispatchItems.filter(
    (item) => byTarget.get(item.target.id)?.grade === 'blocked',
  ).length

  return {
    readyTargets: Math.max(0, dispatchItems.length - attentionTargets - blockedTargets),
    attentionTargets,
    blockedTargets,
  }
}

function countReasons(queue: OperationsQueueItem[], id: OperationsQueueReason['id']) {
  return queue.filter((item) => item.reasons.some((reasonItem) => reasonItem.id === id)).length
}

function latestSnapshotAt(sync: AtlasSyncState) {
  return sync.snapshots.map((snapshot) => snapshot.createdAt).sort().at(-1) ?? null
}

export function createOperationsCockpitSummary({
  workspace,
  dispatch,
  reports,
  sync,
  calibration,
  calibrationIssues,
  dataIntegrityDiagnostics,
  now = new Date(),
  staleEvidenceDays = DEFAULT_OPERATIONS_STALE_EVIDENCE_DAYS,
  staleSnapshotDays = DEFAULT_OPERATIONS_STALE_SNAPSHOT_DAYS,
}: CreateOperationsCockpitSummaryInput): OperationsCockpitSummary {
  const generatedAt = now.toISOString()
  const projectRecords = flattenProjects(workspace)
  const dispatchItems = deriveDispatchQueueItems({
    dispatch,
    projectRecords,
    reports,
  })
  const targetItems = buildTargetQueueItems({
    dispatchItems,
    now,
    staleEvidenceDays,
  })
  const projectVerificationItems = buildProjectVerificationItems({
    projectRecords,
    dispatchItems,
    now,
  })
  const calibrationItem = buildCalibrationItem({
    workspace,
    dispatch,
    calibration,
    sync,
    calibrationIssues,
    generatedAt,
  })
  const snapshotItem = buildSnapshotItem({
    sync,
    now,
    generatedAt,
    staleSnapshotDays,
  })
  const queue = sortQueue([
    ...buildDataIntegrityItems(dataIntegrityDiagnostics, generatedAt),
    ...(calibrationItem ? [calibrationItem] : []),
    ...(snapshotItem ? [snapshotItem] : []),
    ...targetItems,
    ...projectVerificationItems,
  ])
  const targetGrades = countTargetGrades(dispatchItems, queue)
  const warnings =
    sync.provider.status === 'configured'
      ? []
      : ['Hosted sync is optional and not configured; local snapshots remain the daily safety requirement.']
  const grade = worstGrade([
    ...queue.map((item) => item.grade),
    ...(warnings.length > 0 ? (['attention'] as OperationsReadinessGrade[]) : []),
  ])

  return {
    generatedAt,
    grade,
    staleEvidenceDays,
    staleSnapshotDays,
    latestSnapshotAt: latestSnapshotAt(sync),
    counts: {
      projects: projectRecords.length,
      dispatchTargets: dispatch.targets.length,
      ...targetGrades,
      dataIntegrityDanger: dataIntegrityDiagnostics.filter(
        (diagnostic) => diagnostic.severity === 'danger',
      ).length,
      dataIntegrityWarnings: dataIntegrityDiagnostics.filter(
        (diagnostic) => diagnostic.severity === 'warning',
      ).length,
      calibrationBlocked: calibrationItem?.grade === 'blocked' ? 1 : 0,
      calibrationAttention: calibrationItem?.grade === 'attention' ? 1 : 0,
      missingEvidence: countReasons(queue, 'missing-evidence'),
      staleEvidence: countReasons(queue, 'stale-evidence'),
      overdueVerification: queue.filter((item) =>
        item.reasons.some(
          (reasonItem) =>
            reasonItem.id === 'verification' &&
            (reasonItem.detail.includes('overdue') ||
              reasonItem.detail.includes('no verification date')),
        ),
      ).length,
      activeSessions: countReasons(queue, 'active-session'),
      closeoutGaps: countReasons(queue, 'closeout'),
      recoveryGaps: countReasons(queue, 'recovery'),
      currentRecoveryPlans: dispatch.targets.length - countReasons(queue, 'recovery'),
      missingSnapshots: snapshotItem?.id === 'sync:snapshot-missing' ? 1 : 0,
      staleSnapshots: snapshotItem?.id === 'sync:snapshot-stale' ? 1 : 0,
      syncWarnings: warnings.length,
    },
    queue,
    warnings,
  }
}
