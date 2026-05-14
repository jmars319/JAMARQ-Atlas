import { seedDispatchState } from '../data/seedDispatch'
import type {
  DeploymentTarget,
  DeploymentArtifact,
  DeploymentPreservePath,
  DeploymentVerificationCheck,
  DispatchAutomationReadiness,
  DispatchDeploySessionStep,
  DispatchHostEvidenceRun,
  DispatchPreflightRun,
  DispatchReadiness,
  DispatchRecoveryPlan,
  DispatchState,
  DispatchVerificationEvidenceRun,
} from '../domain/dispatch'
import {
  addDispatchHostEvidenceRun,
  addDispatchPreflightRun,
  addDispatchVerificationEvidenceRun,
  normalizeDispatchState,
  replaceDeploymentArtifact,
  replaceDeploymentPreservePath,
  replaceDeploymentVerificationCheck,
  replaceDispatchAutomationReadiness,
} from '../services/dispatchStorage'
import { upsertRecoveryPlan } from '../services/dispatchRecovery'
import type { DispatchDeploySessionStepKind } from '../domain/dispatch'
import {
  applyDeploySessionChecklistPreset,
  attachEvidenceToDeploySession,
  type DeploySessionChecklistPresetId,
  recordManualDeploymentFromSession,
  startDeploySession,
  updateDeploySession,
  updateDeploySessionStep,
} from '../services/deploySessions'
import { useLocalStoreState } from './useLocalStore'

function cloneSeedDispatch(): DispatchState {
  return normalizeDispatchState(JSON.parse(JSON.stringify(seedDispatchState)))
}

export function useLocalDispatch() {
  const {
    state: dispatch,
    setState: setDispatch,
    resetState: resetDispatch,
  } = useLocalStoreState<DispatchState>({
    storeId: 'dispatch',
    fallback: cloneSeedDispatch,
    normalize: normalizeDispatchState,
  })

  function updateTarget(targetId: string, update: Partial<DeploymentTarget>) {
    setDispatch((current) => ({
      ...current,
      targets: current.targets.map((target) =>
        target.id === targetId ? { ...target, ...update } : target,
      ),
    }))
  }

  function addPreflightRun(run: DispatchPreflightRun) {
    setDispatch((current) => addDispatchPreflightRun(current, run))
  }

  function addHostEvidenceRun(run: DispatchHostEvidenceRun) {
    setDispatch((current) => addDispatchHostEvidenceRun(current, run))
  }

  function addVerificationEvidenceRun(run: DispatchVerificationEvidenceRun) {
    setDispatch((current) => addDispatchVerificationEvidenceRun(current, run))
  }

  function updateReadiness(
    targetId: string,
    projectId: string,
    update: Partial<DispatchReadiness>,
  ) {
    setDispatch((current) => {
      const existingReadiness = current.readiness.find(
        (readiness) => readiness.targetId === targetId && readiness.projectId === projectId,
      )
      const nextReadiness: DispatchReadiness = {
        projectId,
        targetId,
        repoCleanKnown: false,
        buildStatusKnown: false,
        artifactReady: false,
        backupReady: false,
        healthChecksDefined: false,
        ready: false,
        blocked: false,
        blockers: [],
        warnings: [],
        lastCheckedAt: new Date().toISOString(),
        ...existingReadiness,
        ...update,
      }

      return {
        ...current,
        readiness: existingReadiness
          ? current.readiness.map((readiness) =>
              readiness.targetId === targetId && readiness.projectId === projectId
                ? nextReadiness
                : readiness,
            )
          : [...current.readiness, nextReadiness],
      }
    })
  }

  function updateAutomationReadiness(
    targetId: string,
    projectId: string,
    update: Partial<DispatchAutomationReadiness>,
  ) {
    setDispatch((current) =>
      replaceDispatchAutomationReadiness(current, projectId, targetId, update),
    )
  }

  function updateDeploymentArtifact(
    runbookId: string,
    artifactId: string,
    update: Partial<DeploymentArtifact>,
  ) {
    setDispatch((current) => replaceDeploymentArtifact(current, runbookId, artifactId, update))
  }

  function updateDeploymentPreservePath(
    runbookId: string,
    preservePathId: string,
    update: Partial<DeploymentPreservePath>,
  ) {
    setDispatch((current) =>
      replaceDeploymentPreservePath(current, runbookId, preservePathId, update),
    )
  }

  function updateDeploymentVerificationCheck(
    runbookId: string,
    checkId: string,
    update: Partial<DeploymentVerificationCheck>,
  ) {
    setDispatch((current) =>
      replaceDeploymentVerificationCheck(current, runbookId, checkId, update),
    )
  }

  function updateRecoveryPlan(targetId: string, update: Partial<DispatchRecoveryPlan>) {
    setDispatch((current) => {
      const target = current.targets.find((candidate) => candidate.id === targetId)

      if (!target) {
        return current
      }

      return upsertRecoveryPlan(current, {
        projectId: target.projectId,
        targetId,
        ...update,
      }).state
    })
  }

  function createDeploySession(runbookId: string) {
    setDispatch((current) => startDeploySession(current, runbookId))
  }

  function updateDeploySessionFields(
    sessionId: string,
    update: Parameters<typeof updateDeploySession>[2],
  ) {
    setDispatch((current) => updateDeploySession(current, sessionId, update))
  }

  function updateDeploySessionStepFields(
    sessionId: string,
    stepId: string,
    update: Partial<Pick<DispatchDeploySessionStep, 'status' | 'notes' | 'evidence'>>,
  ) {
    setDispatch((current) => updateDeploySessionStep(current, sessionId, stepId, update))
  }

  function recordManualDeployment(sessionId: string, confirmation: string) {
    const result = recordManualDeploymentFromSession(dispatch, sessionId, confirmation)
    setDispatch(result.state)

    return {
      ok: result.ok,
      message: result.message,
      recordId: result.recordId,
    }
  }

  function attachDeploySessionEvidence(
    sessionId: string,
    stepKind: DispatchDeploySessionStepKind,
    label: string,
    detail: string,
  ) {
    setDispatch((current) =>
      attachEvidenceToDeploySession(current, sessionId, {
        stepKind,
        label,
        detail,
      }),
    )
  }

  function applyDeploySessionPreset(
    sessionId: string,
    presetId: DeploySessionChecklistPresetId,
  ) {
    setDispatch((current) => applyDeploySessionChecklistPreset(current, sessionId, presetId))
  }

  return {
    dispatch,
    setDispatch,
    resetDispatch,
    updateTarget,
    updateReadiness,
    updateAutomationReadiness,
    updateDeploymentArtifact,
    updateDeploymentPreservePath,
    updateDeploymentVerificationCheck,
    updateRecoveryPlan,
    createDeploySession,
    updateDeploySessionFields,
    updateDeploySessionStepFields,
    recordManualDeployment,
    attachDeploySessionEvidence,
    applyDeploySessionPreset,
    addHostEvidenceRun,
    addVerificationEvidenceRun,
    addPreflightRun,
  }
}
