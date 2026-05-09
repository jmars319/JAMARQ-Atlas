import type {
  DeploymentRecord,
  DeploymentTarget,
  DispatchReadiness,
  DispatchState,
} from '../domain/dispatch'
import { findReadiness, getLatestDeploymentRecord, getTargetRecords } from '../domain/dispatch'

export function getProjectDeploymentTargets(state: DispatchState, projectId: string) {
  return state.targets.filter((target) => target.projectId === projectId)
}

export function getDeploymentTarget(state: DispatchState, targetId: string) {
  return state.targets.find((target) => target.id === targetId)
}

export function getDeploymentRecords(state: DispatchState, targetId: string) {
  return getTargetRecords(state, targetId)
}

export function getLatestDeployment(state: DispatchState, targetId: string) {
  return getLatestDeploymentRecord(state, targetId)
}

export function getDispatchReadiness(
  state: DispatchState,
  projectId: string,
  targetId: string,
) {
  return findReadiness(state, projectId, targetId)
}

export function replaceDeploymentTarget(
  state: DispatchState,
  targetId: string,
  update: Partial<DeploymentTarget>,
): DispatchState {
  return {
    ...state,
    targets: state.targets.map((target) =>
      target.id === targetId ? { ...target, ...update } : target,
    ),
  }
}

export function replaceDispatchReadiness(
  state: DispatchState,
  projectId: string,
  targetId: string,
  update: Partial<DispatchReadiness>,
): DispatchState {
  const existing = findReadiness(state, projectId, targetId)
  const next: DispatchReadiness = {
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
    ...existing,
    ...update,
  }

  return {
    ...state,
    readiness: existing
      ? state.readiness.map((readiness) =>
          readiness.projectId === projectId && readiness.targetId === targetId ? next : readiness,
        )
      : [...state.readiness, next],
  }
}

export function addDeploymentRecord(
  state: DispatchState,
  record: DeploymentRecord,
): DispatchState {
  return {
    ...state,
    records: [record, ...state.records],
  }
}
