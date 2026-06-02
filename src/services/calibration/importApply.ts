import type { Workspace, VerificationCadence, WorkStatus } from '../../domain/atlas'
import { updateProject } from '../../domain/atlas'
import type { DeploymentArtifact, DeploymentPreservePath, DeploymentRunbook, DeploymentTarget, DeploymentVerificationCheck, DispatchState } from '../../domain/dispatch'
import type { AtlasCalibrationState } from '../../domain/calibration'
import { bindRepositoryToProject, parseRepositoryFullName } from '../repoBinding'
import { upsertRecoveryPlan } from '../dispatchRecovery'
import { splitListValue } from './shared'
import { calibrationValueToTargetUpdate } from './scan'
import { recordCalibrationAuditEvent, upsertCredentialReference } from './state'
import { DISPATCH_IMPORT_FIELDS, findImportRunbook, getArtifactRole, getVerificationMethod, hasImportValue, parseExpectedStatuses, readBooleanImport, rowValue, runbookEntityId } from './importShared'
import type { CalibrationImportPreview } from './types'

function applyProjectManualImport(workspace: Workspace, row: Record<string, string>) {
  return updateProject(workspace, row.projectId, (project) => ({
    ...project,
    ...(hasImportValue(row, 'summary') ? { summary: row.summary } : {}),
    manual: {
      ...project.manual,
      ...(hasImportValue(row, 'status') ? { status: row.status as WorkStatus } : {}),
      ...(hasImportValue(row, 'verificationCadence')
        ? { verificationCadence: row.verificationCadence as VerificationCadence }
        : {}),
      ...(hasImportValue(row, 'nextAction') ? { nextAction: row.nextAction } : {}),
      ...(hasImportValue(row, 'lastMeaningfulChange')
        ? { lastMeaningfulChange: row.lastMeaningfulChange }
        : {}),
      ...(hasImportValue(row, 'lastVerified') ? { lastVerified: row.lastVerified } : {}),
      ...(hasImportValue(row, 'currentRisk') ? { currentRisk: row.currentRisk } : {}),
      ...(hasImportValue(row, 'blockers') ? { blockers: splitListValue(row.blockers) } : {}),
      ...(hasImportValue(row, 'deferredItems')
        ? { deferredItems: splitListValue(row.deferredItems) }
        : {}),
      ...(hasImportValue(row, 'notDoingItems')
        ? { notDoingItems: splitListValue(row.notDoingItems) }
        : {}),
      ...(hasImportValue(row, 'notes') ? { notes: splitListValue(row.notes) } : {}),
      ...(hasImportValue(row, 'decisions') ? { decisions: splitListValue(row.decisions) } : {}),
    },
  }))
}

function applyRecoveryPlanImport(
  state: DispatchState,
  row: Record<string, string>,
  now: Date,
) {
  const target = state.targets.find((candidate) => candidate.id === row.targetId)

  if (!target) {
    return state
  }

  const existing = state.recoveryPlans.find((plan) => plan.targetId === target.id)
  const result = upsertRecoveryPlan(
    state,
    {
      id: existing?.id,
      projectId: row.projectId || target.projectId,
      targetId: target.id,
      ...(hasImportValue(row, 'backupCadence') ? { backupCadence: row.backupCadence } : {}),
      ...(hasImportValue(row, 'backupLocationRef')
        ? { backupLocationRef: row.backupLocationRef }
        : {}),
      ...(hasImportValue(row, 'rollbackReference')
        ? { rollbackReference: row.rollbackReference }
        : {}),
      ...(hasImportValue(row, 'rollbackSteps')
        ? { rollbackSteps: splitListValue(row.rollbackSteps) }
        : {}),
      ...(hasImportValue(row, 'maintenanceWindow')
        ? { maintenanceWindow: row.maintenanceWindow }
        : {}),
      ...(hasImportValue(row, 'escalationContactRef')
        ? { escalationContactRef: row.escalationContactRef }
        : {}),
      ...(hasImportValue(row, 'lastReviewedAt') ? { lastReviewedAt: row.lastReviewedAt } : {}),
      ...(hasImportValue(row, 'notes') ? { notes: splitListValue(row.notes) } : {}),
    },
    now,
  )

  return result.ok ? result.state : state
}

function applyArtifactImport(runbook: DeploymentRunbook, row: Record<string, string>) {
  const artifactId =
    rowValue(row, 'artifactId') || runbookEntityId('artifact', runbook, rowValue(row, 'filename'))
  const existing = runbook.artifacts.find((artifact) => artifact.id === artifactId)
  const fallback: DeploymentArtifact = {
    id: artifactId,
    projectId: runbook.projectId,
    targetId: runbook.targetId,
    filename: rowValue(row, 'filename'),
    role: getArtifactRole(rowValue(row, 'role'), 'frontend'),
    sourceRepo: '',
    targetPath: '',
    required: true,
    onlyWhenFullAppReady: false,
    checksum: '',
    inspectedAt: '',
    warnings: [],
    notes: [],
  }
  const artifact: DeploymentArtifact = {
    ...(existing ?? fallback),
    ...(hasImportValue(row, 'filename') ? { filename: row.filename } : {}),
    ...(hasImportValue(row, 'role')
      ? { role: getArtifactRole(row.role, existing?.role ?? fallback.role) }
      : {}),
    ...(hasImportValue(row, 'sourceRepo') ? { sourceRepo: row.sourceRepo } : {}),
    ...(hasImportValue(row, 'targetPath') ? { targetPath: row.targetPath } : {}),
    ...(hasImportValue(row, 'required')
      ? { required: readBooleanImport(row.required, existing?.required ?? true) }
      : {}),
    ...(hasImportValue(row, 'onlyWhenFullAppReady')
      ? {
          onlyWhenFullAppReady: readBooleanImport(
            row.onlyWhenFullAppReady,
            existing?.onlyWhenFullAppReady ?? false,
          ),
        }
      : {}),
    ...(hasImportValue(row, 'checksum') ? { checksum: row.checksum } : {}),
    ...(hasImportValue(row, 'inspectedAt') ? { inspectedAt: row.inspectedAt } : {}),
    ...(hasImportValue(row, 'warnings') ? { warnings: splitListValue(row.warnings) } : {}),
    ...(hasImportValue(row, 'notes') ? { notes: splitListValue(row.notes) } : {}),
  }

  return {
    ...runbook,
    artifacts: existing
      ? runbook.artifacts.map((candidate) => (candidate.id === artifact.id ? artifact : candidate))
      : [...runbook.artifacts, artifact],
  }
}

function applyPreservePathImport(runbook: DeploymentRunbook, row: Record<string, string>) {
  const preservePathId =
    rowValue(row, 'preservePathId') || runbookEntityId('preserve', runbook, rowValue(row, 'path'))
  const existing =
    runbook.preservePaths.find((preservePath) => preservePath.id === preservePathId) ??
    runbook.preservePaths.find((preservePath) => preservePath.path === rowValue(row, 'path'))
  const fallback: DeploymentPreservePath = {
    id: preservePathId,
    projectId: runbook.projectId,
    targetId: runbook.targetId,
    path: rowValue(row, 'path'),
    reason: '',
    required: true,
    temporary: false,
    notes: [],
  }
  const preservePath: DeploymentPreservePath = {
    ...(existing ?? fallback),
    ...(hasImportValue(row, 'path') ? { path: row.path } : {}),
    ...(hasImportValue(row, 'reason') ? { reason: row.reason } : {}),
    ...(hasImportValue(row, 'required')
      ? { required: readBooleanImport(row.required, existing?.required ?? true) }
      : {}),
    ...(hasImportValue(row, 'temporary')
      ? { temporary: readBooleanImport(row.temporary, existing?.temporary ?? false) }
      : {}),
    ...(hasImportValue(row, 'notes') ? { notes: splitListValue(row.notes) } : {}),
  }

  return {
    ...runbook,
    preservePaths: existing
      ? runbook.preservePaths.map((candidate) =>
          candidate.id === existing.id ? preservePath : candidate,
        )
      : [...runbook.preservePaths, preservePath],
  }
}

function applyVerificationCheckImport(runbook: DeploymentRunbook, row: Record<string, string>) {
  const checkId =
    rowValue(row, 'verificationCheckId') ||
    runbookEntityId('verify', runbook, rowValue(row, 'urlPath') || rowValue(row, 'label'))
  const existing =
    runbook.verificationChecks.find((check) => check.id === checkId) ??
    runbook.verificationChecks.find((check) => check.urlPath === rowValue(row, 'urlPath'))
  const fallback: DeploymentVerificationCheck = {
    id: checkId,
    projectId: runbook.projectId,
    targetId: runbook.targetId,
    label: rowValue(row, 'label'),
    method: getVerificationMethod(rowValue(row, 'method'), 'HEAD'),
    urlPath: rowValue(row, 'urlPath'),
    expectedStatuses: parseExpectedStatuses(rowValue(row, 'expectedStatuses')),
    protectedResource: false,
    notes: [],
  }
  const check: DeploymentVerificationCheck = {
    ...(existing ?? fallback),
    ...(hasImportValue(row, 'label') ? { label: row.label } : {}),
    ...(hasImportValue(row, 'method')
      ? { method: getVerificationMethod(row.method, existing?.method ?? fallback.method) }
      : {}),
    ...(hasImportValue(row, 'urlPath') ? { urlPath: row.urlPath } : {}),
    ...(hasImportValue(row, 'expectedStatuses')
      ? { expectedStatuses: parseExpectedStatuses(row.expectedStatuses) }
      : {}),
    ...(hasImportValue(row, 'protectedResource')
      ? {
          protectedResource: readBooleanImport(
            row.protectedResource,
            existing?.protectedResource ?? false,
          ),
        }
      : {}),
    ...(hasImportValue(row, 'notes') ? { notes: splitListValue(row.notes) } : {}),
  }

  return {
    ...runbook,
    verificationChecks: existing
      ? runbook.verificationChecks.map((candidate) =>
          candidate.id === existing.id ? check : candidate,
        )
      : [...runbook.verificationChecks, check],
  }
}

function updateImportRunbook(
  state: DispatchState,
  row: Record<string, string>,
  update: (runbook: DeploymentRunbook) => DeploymentRunbook,
) {
  const runbook = findImportRunbook(state, row)

  if (!runbook) {
    return state
  }

  return {
    ...state,
    runbooks: state.runbooks.map((candidate) =>
      candidate.id === runbook.id ? update(candidate) : candidate,
    ),
  }
}

export function applyCalibrationImportPreview({
  workspace,
  dispatch,
  calibration,
  preview,
  operatorLabel = '',
  now = new Date(),
}: {
  workspace: Workspace
  dispatch: DispatchState
  calibration: AtlasCalibrationState
  preview: CalibrationImportPreview
  operatorLabel?: string
  now?: Date
}) {
  let nextWorkspace = workspace
  let nextDispatch = dispatch
  let nextCalibration = calibration

  for (const row of preview.acceptedRows) {
    if (row.kind === 'dispatch-target') {
      const update = DISPATCH_IMPORT_FIELDS.reduce<Partial<DeploymentTarget>>((current, field) => {
        const value = row.data[field]
        if (!value?.trim()) {
          return current
        }

        return {
          ...current,
          ...calibrationValueToTargetUpdate(field, value),
        }
      }, {})

      nextDispatch = {
        ...nextDispatch,
        targets: nextDispatch.targets.map((target) =>
          target.id === row.data.targetId ? { ...target, ...update } : target,
        ),
      }
    }

    if (row.kind === 'repo-binding') {
      const repository = parseRepositoryFullName(
        row.data.repository || row.data.repo || row.data.fullName || '',
      )

      if (repository && row.data.projectId) {
        nextWorkspace = bindRepositoryToProject(nextWorkspace, row.data.projectId, repository)
      }
    }

    if (row.kind === 'credential-reference') {
      const result = upsertCredentialReference(nextCalibration, {
        label: row.data.label,
        provider: row.data.provider,
        purpose: row.data.purpose,
        notes: row.data.notes,
        targetIds: splitListValue(row.data.targetIds || ''),
        projectIds: splitListValue(row.data.projectIds || ''),
        operatorLabel,
        now,
      })

      if (result.ok) {
        nextCalibration = result.state
      }
    }

    if (row.kind === 'project-manual') {
      nextWorkspace = applyProjectManualImport(nextWorkspace, row.data)
    }

    if (row.kind === 'recovery-plan') {
      nextDispatch = applyRecoveryPlanImport(nextDispatch, row.data, now)
    }

    if (row.kind === 'runbook-artifact') {
      nextDispatch = updateImportRunbook(nextDispatch, row.data, (runbook) =>
        applyArtifactImport(runbook, row.data),
      )
    }

    if (row.kind === 'runbook-preserve-path') {
      nextDispatch = updateImportRunbook(nextDispatch, row.data, (runbook) =>
        applyPreservePathImport(runbook, row.data),
      )
    }

    if (row.kind === 'runbook-verification-check') {
      nextDispatch = updateImportRunbook(nextDispatch, row.data, (runbook) =>
        applyVerificationCheckImport(runbook, row.data),
      )
    }

    nextCalibration = recordCalibrationAuditEvent(nextCalibration, {
      type: 'import-apply',
      summary: `Applied calibration import row ${row.index}: ${row.changes.join('; ')}`,
      operatorLabel,
      now,
    })
  }

  return {
    workspace: nextWorkspace,
    dispatch: nextDispatch,
    calibration: nextCalibration,
  }
}
