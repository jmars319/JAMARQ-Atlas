import { useEffect, useState } from 'react'
import { seedDispatchState } from '../data/seedDispatch'
import type {
  DeploymentTarget,
  DeploymentArtifact,
  DispatchAutomationReadiness,
  DispatchDeploySessionStep,
  DispatchHostEvidenceRun,
  DispatchPreflightRun,
  DispatchReadiness,
  DispatchState,
  DispatchVerificationEvidenceRun,
} from '../domain/dispatch'
import { ATLAS_STORE_DEFINITIONS_BY_ID } from '../domain/storeRegistry'
import {
  addDispatchHostEvidenceRun,
  addDispatchPreflightRun,
  addDispatchVerificationEvidenceRun,
  normalizeDispatchState,
  replaceDeploymentArtifact,
  replaceDispatchAutomationReadiness,
} from '../services/dispatchStorage'
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

const STORAGE_KEY = ATLAS_STORE_DEFINITIONS_BY_ID.dispatch.localStorageKey

function cloneSeedDispatch(): DispatchState {
  return normalizeDispatchState(JSON.parse(JSON.stringify(seedDispatchState)))
}

function readDispatch(): DispatchState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)

    if (!stored) {
      return cloneSeedDispatch()
    }

    return normalizeDispatchState(JSON.parse(stored))
  } catch {
    return cloneSeedDispatch()
  }
}

export function useLocalDispatch() {
  const [dispatch, setDispatch] = useState<DispatchState>(() => readDispatch())

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(dispatch))
  }, [dispatch])

  function resetDispatch() {
    const freshDispatch = cloneSeedDispatch()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(freshDispatch))
    setDispatch(freshDispatch)
  }

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
