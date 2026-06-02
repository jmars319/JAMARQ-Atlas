import type { ProjectRecord, Workspace } from '../../domain/atlas'
import { flattenProjects } from '../../domain/atlas'
import type { DeploymentTarget, DispatchState } from '../../domain/dispatch'
import type { CalibrationCategory } from '../../domain/calibration'
import { splitListValue, valueLabel } from './shared'
import { isPlaceholderValue } from './validation'
import { CALIBRATION_CATEGORIES, type CalibrationEditableTargetField, type CalibrationIssue, type CalibrationIssueGroup } from './types'

export function calibrationCategoryLabel(category: CalibrationCategory) {
  return CALIBRATION_CATEGORIES.find((candidate) => candidate.id === category)?.label ?? category
}

function calibrationIssueGroupKey(issue: CalibrationIssue) {
  const scope = issue.targetId
    ? `target:${issue.targetId}`
    : issue.projectId
      ? `project:${issue.projectId}`
      : `source:${issue.source}`

  return `${scope}:${issue.category}`
}

export function groupCalibrationIssues(issues: CalibrationIssue[]): CalibrationIssueGroup[] {
  const groups = new Map<
    string,
    Omit<
      CalibrationIssueGroup,
      'issueCount' | 'needsRealValueCount' | 'warningCount' | 'editableCount'
    >
  >()

  for (const issue of issues) {
    const key = calibrationIssueGroupKey(issue)
    const existing = groups.get(key)

    if (existing) {
      existing.issues.push(issue)
      continue
    }

    groups.set(key, {
      id: key,
      label: issue.targetName || issue.projectName,
      detail: issue.targetName ? issue.projectName : 'Project-level calibration',
      category: issue.category,
      categoryLabel: calibrationCategoryLabel(issue.category),
      projectId: issue.projectId,
      targetId: issue.targetId,
      issues: [issue],
    })
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      issueCount: group.issues.length,
      needsRealValueCount: group.issues.filter(
        (issue) => issue.severity === 'needs-real-value',
      ).length,
      warningCount: group.issues.filter((issue) => issue.severity === 'warning').length,
      editableCount: group.issues.filter((issue) => issue.editable).length,
    }))
    .sort(
      (left, right) =>
        right.issueCount - left.issueCount ||
        left.label.localeCompare(right.label) ||
        left.categoryLabel.localeCompare(right.categoryLabel),
    )
}

function projectName(records: ProjectRecord[], projectId: string) {
  return records.find((record) => record.project.id === projectId)?.project.name ?? projectId
}

function dispatchIssue({
  records,
  target,
  category = 'dispatch-targets',
  field,
  label,
  value,
  message,
  editable = true,
}: {
  records: ProjectRecord[]
  target: DeploymentTarget
  category?: CalibrationCategory
  field: string
  label: string
  value: string | string[]
  message: string
  editable?: boolean
}): CalibrationIssue {
  return {
    id: `dispatch-${target.id}-${field}`,
    category,
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

export function calibrationValueToTargetUpdate(
  field: CalibrationEditableTargetField,
  value: string,
): Partial<DeploymentTarget> {
  if (field === 'healthCheckUrls') {
    return {
      healthCheckUrls: splitListValue(value),
    }
  }

  return { [field]: value } as Partial<DeploymentTarget>
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

function scanTarget(
  records: ProjectRecord[],
  dispatch: DispatchState,
  target: DeploymentTarget,
  configuredHostTargetIds?: Set<string>,
  credentialReferenceLabels?: Set<string>,
) {
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
      | 'credentialRef'
    >
    category: CalibrationCategory
    label: string
    value: string | string[]
    message: string
  }> = [
    {
      field: 'remoteHost',
      category: 'host-config',
      label: 'Remote host',
      value: target.remoteHost,
      message: 'Confirm the production host without storing passwords or tokens.',
    },
    {
      field: 'remoteUser',
      category: 'host-config',
      label: 'Remote user',
      value: target.remoteUser,
      message: 'Use a non-secret username or credential reference only.',
    },
    {
      field: 'remoteFrontendPath',
      category: 'host-config',
      label: 'Frontend path',
      value: target.remoteFrontendPath,
      message: 'Replace placeholder frontend/root paths with the actual cPanel path.',
    },
    {
      field: 'remoteBackendPath',
      category: 'host-config',
      label: 'Backend path',
      value: target.remoteBackendPath,
      message: 'Replace placeholder backend/API paths with the actual cPanel path.',
    },
    {
      field: 'publicUrl',
      category: 'dispatch-targets',
      label: 'Public URL',
      value: target.publicUrl,
      message: 'Use the real production URL so health checks and reports are meaningful.',
    },
    {
      field: 'healthCheckUrls',
      category: 'health-urls',
      label: 'Health check URLs',
      value: target.healthCheckUrls,
      message: 'Add real read-only URLs for homepage/API health checks.',
    },
    {
      field: 'databaseName',
      category: 'dispatch-targets',
      label: 'Database name',
      value: target.databaseName,
      message: 'Use the non-secret database name when a database exists.',
    },
    {
      field: 'credentialRef',
      category: 'host-config',
      label: 'Credential reference label',
      value: target.credentialRef,
      message:
        'Use a non-secret credential reference label such as godaddy-mmh-production; never store the credential value.',
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
        category: 'backup-rollback',
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
        category: 'backup-rollback',
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
        category: 'backup-rollback',
        field: 'automation-rollback-requirements',
        label: 'Automation rollback requirements',
        value: '',
        message: 'Future automation needs rollback requirements documented before write capability.',
        editable: false,
      }),
    )
  }

  if (
    configuredHostTargetIds &&
    !configuredHostTargetIds.has(target.id) &&
    !isPlaceholderValue(target.remoteHost) &&
    !isPlaceholderValue(target.remoteFrontendPath) &&
    !isPlaceholderValue(target.remoteBackendPath)
  ) {
    issues.push(
      dispatchIssue({
        records,
        target,
        category: 'host-config',
        field: 'host-preflight-config',
        label: 'Host preflight config',
        value: target.credentialRef,
        message:
          'Target has real host/path metadata but no matching server-side host inspector config entry.',
        editable: false,
      }),
    )
  }

  if (
    credentialReferenceLabels &&
    target.credentialRef &&
    !isPlaceholderValue(target.credentialRef) &&
    !credentialReferenceLabels.has(target.credentialRef.toLowerCase())
  ) {
    issues.push(
      dispatchIssue({
        records,
        target,
        category: 'host-config',
        field: 'credentialRef-registry',
        label: 'Credential reference registry',
        value: target.credentialRef,
        message:
          'Dispatch target uses a credential reference label that is not in the local non-secret registry.',
        editable: false,
      }),
    )
  }

  return issues
}

export function scanAtlasCalibration(
  workspace: Workspace,
  dispatch: DispatchState,
  configuredHostTargetIds?: string[],
  credentialReferenceLabels?: string[],
) {
  const records = flattenProjects(workspace)
  const issues: CalibrationIssue[] = []
  const configuredHostTargets = configuredHostTargetIds
    ? new Set(configuredHostTargetIds)
    : undefined
  const credentialLabels = credentialReferenceLabels
    ? new Set(credentialReferenceLabels.map((label) => label.toLowerCase()))
    : undefined

  for (const target of dispatch.targets) {
    issues.push(...scanTarget(records, dispatch, target, configuredHostTargets, credentialLabels))
  }

  for (const record of records) {
    if (record.section.id === 'client-systems') {
      if (isPlaceholderValue(record.project.summary)) {
        issues.push(
          workspaceIssue({
            record,
            category: 'client-labels',
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
            category: 'dispatch-targets',
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
