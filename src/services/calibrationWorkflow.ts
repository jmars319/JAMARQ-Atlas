import { flattenProjects, type Workspace } from '../domain/atlas'
import type { AtlasCalibrationState } from '../domain/calibration'
import type { DispatchState } from '../domain/dispatch'
import type { AtlasSyncState } from '../domain/sync'
import type { CalibrationIssue } from './calibration'

export type CalibrationWorkflowStatus = 'complete' | 'attention' | 'blocked'

export interface CalibrationWorkflowStep {
  id: string
  label: string
  status: CalibrationWorkflowStatus
  detail: string
  count: number
}

export interface CalibrationWorkflowGroup {
  id: string
  label: string
  status: CalibrationWorkflowStatus
  steps: CalibrationWorkflowStep[]
}

function worstStatus(statuses: CalibrationWorkflowStatus[]): CalibrationWorkflowStatus {
  if (statuses.includes('blocked')) {
    return 'blocked'
  }

  if (statuses.includes('attention')) {
    return 'attention'
  }

  return 'complete'
}

function step({
  id,
  label,
  count,
  unresolved,
  emptyDetail,
  completeDetail,
}: {
  id: string
  label: string
  count: number
  unresolved?: number
  emptyDetail: string
  completeDetail: string
}): CalibrationWorkflowStep {
  const status: CalibrationWorkflowStatus =
    count === 0 ? 'blocked' : unresolved && unresolved > 0 ? 'attention' : 'complete'

  return {
    id,
    label,
    status,
    count,
    detail:
      count === 0
        ? emptyDetail
        : unresolved && unresolved > 0
          ? `${unresolved} item(s) still need review.`
          : completeDetail,
  }
}

export function createCalibrationWorkflow({
  workspace,
  dispatch,
  calibration,
  sync,
  issues,
}: {
  workspace: Workspace
  dispatch: DispatchState
  calibration: AtlasCalibrationState
  sync: AtlasSyncState
  issues: CalibrationIssue[]
}): CalibrationWorkflowGroup[] {
  const projectRecords = flattenProjects(workspace)
  const repositoryBindings = projectRecords.reduce(
    (total, record) => total + record.project.repositories.length,
    0,
  )
  const healthUrlCount = dispatch.targets.reduce(
    (total, target) => total + target.healthCheckUrls.length,
    0,
  )
  const cadenceCount = projectRecords.filter(
    (record) => record.project.manual.verificationCadence !== 'ad-hoc',
  ).length
  const backupTargets = dispatch.targets.filter((target) => target.backupRequired)
  const rollbackReferences = dispatch.records.filter((record) => record.rollbackRef).length
  const unresolvedByField = new Map<string, number>()

  for (const issue of issues) {
    unresolvedByField.set(issue.field, (unresolvedByField.get(issue.field) ?? 0) + 1)
  }

  const groups: CalibrationWorkflowGroup[] = [
    {
      id: 'scope',
      label: 'Scope and bindings',
      status: 'complete',
      steps: [
        step({
          id: 'projects',
          label: 'Projects',
          count: projectRecords.length,
          emptyDetail: 'Add at least one Workspace project before calibration.',
          completeDetail: `${projectRecords.length} project(s) are available for calibration.`,
        }),
        step({
          id: 'repositories',
          label: 'Domains / repo bindings',
          count: repositoryBindings,
          unresolved: unresolvedByField.get('repositoryBindings'),
          emptyDetail: 'Bind repositories or domains through GitHub Intake or project details.',
          completeDetail: `${repositoryBindings} repository binding(s) are present.`,
        }),
      ],
    },
    {
      id: 'dispatch',
      label: 'Dispatch setup',
      status: 'complete',
      steps: [
        step({
          id: 'targets',
          label: 'Dispatch targets',
          count: dispatch.targets.length,
          unresolved: unresolvedByField.get('dispatchTarget'),
          emptyDetail: 'Configure Dispatch targets before deployment readiness can be reviewed.',
          completeDetail: `${dispatch.targets.length} Dispatch target(s) are configured.`,
        }),
        step({
          id: 'credentials',
          label: 'Credential reference labels',
          count: calibration.credentialReferences.length,
          unresolved: unresolvedByField.get('credentialRef'),
          emptyDetail: 'Register non-secret credential labels before host calibration.',
          completeDetail: `${calibration.credentialReferences.length} credential reference label(s) are registered.`,
        }),
        step({
          id: 'health',
          label: 'Health URLs',
          count: healthUrlCount,
          unresolved: unresolvedByField.get('healthCheckUrls'),
          emptyDetail: 'Add health URLs to Dispatch targets for verification cadence checks.',
          completeDetail: `${healthUrlCount} health URL(s) are configured.`,
        }),
      ],
    },
    {
      id: 'verification',
      label: 'Verification and recovery',
      status: 'complete',
      steps: [
        step({
          id: 'cadence',
          label: 'Verification cadence',
          count: cadenceCount,
          emptyDetail: 'Set explicit verification cadence for at least one project.',
          completeDetail: `${cadenceCount} project(s) have scheduled verification cadence.`,
        }),
        step({
          id: 'backup',
          label: 'Backup / rollback notes',
          count: backupTargets.length + rollbackReferences,
          unresolved:
            (unresolvedByField.get('backupReady') ?? 0) +
            (unresolvedByField.get('rollbackRef') ?? 0),
          emptyDetail: 'Record backup requirements and rollback references before deployment.',
          completeDetail: 'Backup-required targets or rollback records are present.',
        }),
        step({
          id: 'snapshots',
          label: 'Export / snapshot readiness',
          count: sync.snapshots.length,
          emptyDetail: 'Create a local sync snapshot before high-risk restore or calibration work.',
          completeDetail: `${sync.snapshots.length} local sync snapshot(s) are available.`,
        }),
      ],
    },
  ]

  return groups.map((group) => ({
    ...group,
    status: worstStatus(group.steps.map((item) => item.status)),
  }))
}
