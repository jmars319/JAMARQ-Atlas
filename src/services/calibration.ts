import type { ProjectRecord, Workspace } from '../domain/atlas'
import type { DeploymentTarget, DispatchState } from '../domain/dispatch'
import { flattenProjects } from '../domain/atlas'

export type CalibrationCategory =
  | 'client-systems'
  | 'dispatch-targets'
  | 'github-bindings'
  | 'verification-gaps'

export type CalibrationSeverity = 'needs-real-value' | 'warning'

export interface CalibrationIssue {
  id: string
  category: CalibrationCategory
  severity: CalibrationSeverity
  source: 'workspace' | 'dispatch'
  projectId: string | null
  projectName: string
  targetId: string | null
  targetName: string | null
  field: string
  label: string
  value: string
  message: string
  editable: boolean
}

export const CALIBRATION_CATEGORIES: Array<{
  id: CalibrationCategory | 'all'
  label: string
}> = [
  { id: 'all', label: 'All calibration gaps' },
  { id: 'client-systems', label: 'Client Systems' },
  { id: 'dispatch-targets', label: 'Dispatch targets' },
  { id: 'github-bindings', label: 'GitHub bindings' },
  { id: 'verification-gaps', label: 'Verification gaps' },
]

const PLACEHOLDER_PATTERN = /\b(placeholder|example|needs real|tbd|todo|unknown|not set)\b/i
const SECRET_SHAPED_PATTERN =
  /(password|passphrase|secret|token|api[_ -]?key|apikey|private[_ -]?key|credential)/i

function projectName(records: ProjectRecord[], projectId: string) {
  return records.find((record) => record.project.id === projectId)?.project.name ?? projectId
}

function isMissing(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) {
    return value.length === 0 || value.every((item) => item.trim() === '')
  }

  return !value || value.trim() === ''
}

export function isPlaceholderValue(value: string | string[] | null | undefined): boolean {
  if (isMissing(value)) {
    return true
  }

  if (Array.isArray(value)) {
    return value.some((item) => isPlaceholderValue(item))
  }

  return PLACEHOLDER_PATTERN.test(value ?? '')
}

export function isSecretLikeValue(value: string) {
  return SECRET_SHAPED_PATTERN.test(value)
}

function valueLabel(value: string | string[]) {
  return Array.isArray(value) ? value.join('\n') : value
}

function dispatchIssue({
  records,
  target,
  field,
  label,
  value,
  message,
  editable = true,
}: {
  records: ProjectRecord[]
  target: DeploymentTarget
  field: string
  label: string
  value: string | string[]
  message: string
  editable?: boolean
}): CalibrationIssue {
  return {
    id: `dispatch-${target.id}-${field}`,
    category: 'dispatch-targets',
    severity: 'needs-real-value',
    source: 'dispatch',
    projectId: target.projectId,
    projectName: projectName(records, target.projectId),
    targetId: target.id,
    targetName: target.name,
    field,
    label,
    value: valueLabel(value),
    message,
    editable,
  }
}

function workspaceIssue({
  record,
  category,
  field,
  label,
  value,
  message,
}: {
  record: ProjectRecord
  category: CalibrationCategory
  field: string
  label: string
  value: string
  message: string
}): CalibrationIssue {
  return {
    id: `workspace-${record.project.id}-${field}`,
    category,
    severity: 'needs-real-value',
    source: 'workspace',
    projectId: record.project.id,
    projectName: record.project.name,
    targetId: null,
    targetName: null,
    field,
    label,
    value,
    message,
    editable: false,
  }
}

function scanTarget(records: ProjectRecord[], dispatch: DispatchState, target: DeploymentTarget) {
  const issues: CalibrationIssue[] = []
  const latestRecord = dispatch.records
    .filter((record) => record.targetId === target.id)
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0]
  const automation = dispatch.automationReadiness.find(
    (readiness) => readiness.projectId === target.projectId && readiness.targetId === target.id,
  )

  const editableFields: Array<{
    field: keyof Pick<
      DeploymentTarget,
      | 'remoteHost'
      | 'remoteUser'
      | 'remoteFrontendPath'
      | 'remoteBackendPath'
      | 'publicUrl'
      | 'healthCheckUrls'
      | 'databaseName'
    >
    label: string
    value: string | string[]
    message: string
  }> = [
    {
      field: 'remoteHost',
      label: 'Remote host',
      value: target.remoteHost,
      message: 'Confirm the production host without storing passwords or tokens.',
    },
    {
      field: 'remoteUser',
      label: 'Remote user',
      value: target.remoteUser,
      message: 'Use a non-secret username or credential reference only.',
    },
    {
      field: 'remoteFrontendPath',
      label: 'Frontend path',
      value: target.remoteFrontendPath,
      message: 'Replace placeholder frontend/root paths with the actual cPanel path.',
    },
    {
      field: 'remoteBackendPath',
      label: 'Backend path',
      value: target.remoteBackendPath,
      message: 'Replace placeholder backend/API paths with the actual cPanel path.',
    },
    {
      field: 'publicUrl',
      label: 'Public URL',
      value: target.publicUrl,
      message: 'Use the real production URL so health checks and reports are meaningful.',
    },
    {
      field: 'healthCheckUrls',
      label: 'Health check URLs',
      value: target.healthCheckUrls,
      message: 'Add real read-only URLs for homepage/API health checks.',
    },
    {
      field: 'databaseName',
      label: 'Database name',
      value: target.databaseName,
      message: 'Use the non-secret database name when a database exists.',
    },
  ]

  for (const item of editableFields) {
    if (item.field === 'databaseName' && !target.hasDatabase) {
      continue
    }

    if (isPlaceholderValue(item.value)) {
      issues.push(dispatchIssue({ records, target, ...item }))
    }
  }

  if (target.backupRequired && target.deploymentNotes.every((note) => !/backup/i.test(note))) {
    issues.push(
      dispatchIssue({
        records,
        target,
        field: 'backup-notes',
        label: 'Backup notes',
        value: target.deploymentNotes,
        message: 'Backup requirements need explicit non-secret operational notes.',
        editable: false,
      }),
    )
  }

  if (!latestRecord?.rollbackRef || isPlaceholderValue(latestRecord.rollbackRef)) {
    issues.push(
      dispatchIssue({
        records,
        target,
        field: 'rollback-notes',
        label: 'Rollback reference',
        value: latestRecord?.rollbackRef ?? '',
        message: 'Rollback posture needs a real reference or manual rollback note.',
        editable: false,
      }),
    )
  }

  if (!automation || automation.rollbackRequirements.length === 0) {
    issues.push(
      dispatchIssue({
        records,
        target,
        field: 'automation-rollback-requirements',
        label: 'Automation rollback requirements',
        value: '',
        message: 'Future automation needs rollback requirements documented before write capability.',
        editable: false,
      }),
    )
  }

  return issues
}

export function scanAtlasCalibration(workspace: Workspace, dispatch: DispatchState) {
  const records = flattenProjects(workspace)
  const issues: CalibrationIssue[] = []

  for (const target of dispatch.targets) {
    issues.push(...scanTarget(records, dispatch, target))
  }

  for (const record of records) {
    if (record.section.id === 'client-systems') {
      if (isPlaceholderValue(record.project.summary)) {
        issues.push(
          workspaceIssue({
            record,
            category: 'client-systems',
            field: 'summary',
            label: 'Client/project label',
            value: record.project.summary,
            message: 'Client Systems project summary still reads like placeholder context.',
          }),
        )
      }

      const projectTargets = dispatch.targets.filter(
        (target) => target.projectId === record.project.id,
      )
      if (projectTargets.length === 0) {
        issues.push(
          workspaceIssue({
            record,
            category: 'client-systems',
            field: 'deployment-target',
            label: 'Deployment target',
            value: '',
            message: 'Client Systems project has no Dispatch target configured.',
          }),
        )
      }
    }

    if (record.project.repositories.length === 0) {
      issues.push(
        workspaceIssue({
          record,
          category: 'github-bindings',
          field: 'repositories',
          label: 'Repository binding',
          value: '',
          message: 'No GitHub repository is bound. Bind one manually when the source repo is known.',
        }),
      )
    }

    if (!record.project.manual.lastVerified) {
      issues.push(
        workspaceIssue({
          record,
          category: 'verification-gaps',
          field: 'lastVerified',
          label: 'Last verified',
          value: '',
          message: 'Last verified is missing. Verification Center can stamp this manually.',
        }),
      )
    }
  }

  return issues
}

export function canStoreCalibrationValue(value: string) {
  if (isSecretLikeValue(value)) {
    return {
      ok: false,
      message:
        'This looks credential-shaped. Store only non-secret host/path values or a credential reference label.',
    }
  }

  return {
    ok: true,
    message: '',
  }
}
