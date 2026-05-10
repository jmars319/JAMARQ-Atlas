import { useEffect, useState } from 'react'
import { seedDispatchState } from '../data/seedDispatch'
import type {
  DeploymentTarget,
  DispatchPreflightRun,
  DispatchReadiness,
  DispatchState,
} from '../domain/dispatch'
import { addDispatchPreflightRun, normalizeDispatchState } from '../services/dispatchStorage'

const STORAGE_KEY = 'jamarq-atlas.dispatch.v1'

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

  return {
    dispatch,
    setDispatch,
    resetDispatch,
    updateTarget,
    updateReadiness,
    addPreflightRun,
  }
}
