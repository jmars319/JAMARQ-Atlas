import type {
  DeploymentRecord,
  DeploymentRunbook,
  DeploymentTarget,
  DeploymentOrderGroup,
  DispatchPreflightRun,
  DispatchReadiness,
  DispatchState,
  DispatchAutomationReadiness,
} from '../domain/dispatch'
import {
  findReadiness,
  getLatestDeploymentRecord,
  getTargetPreflightRuns,
  getTargetRecords,
} from '../domain/dispatch'
import { normalizeAutomationReadiness } from './dispatchAutomation'

const PREFLIGHT_HISTORY_LIMIT = 50

export function normalizeDispatchState(value: unknown, now = new Date()): DispatchState {
  const candidate = typeof value === 'object' && value !== null ? (value as Partial<DispatchState>) : {}
  const targets = Array.isArray(candidate.targets) ? candidate.targets : []
  const automationReadiness = Array.isArray(candidate.automationReadiness)
    ? targets.map((target) =>
        normalizeAutomationReadiness(
          candidate.automationReadiness?.find(
            (readiness) =>
              readiness.projectId === target.projectId && readiness.targetId === target.id,
          ),
          target,
          now,
        ),
      )
    : targets.map((target) => normalizeAutomationReadiness(null, target, now))

  return {
    targets,
    records: Array.isArray(candidate.records) ? candidate.records : [],
    readiness: Array.isArray(candidate.readiness) ? candidate.readiness : [],
    preflightRuns: Array.isArray(candidate.preflightRuns) ? candidate.preflightRuns : [],
    automationReadiness,
    runbooks: Array.isArray(candidate.runbooks)
      ? (candidate.runbooks as DeploymentRunbook[])
      : [],
    orderGroups: Array.isArray(candidate.orderGroups)
      ? (candidate.orderGroups as DeploymentOrderGroup[])
      : [],
  }
}

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

export function getDispatchPreflightRuns(state: DispatchState, targetId: string) {
  return getTargetPreflightRuns(state, targetId)
}

export function addDispatchPreflightRun(
  state: DispatchState,
  run: DispatchPreflightRun,
): DispatchState {
  return {
    ...state,
    preflightRuns: [
      run,
      ...state.preflightRuns.filter((existingRun) => existingRun.id !== run.id),
    ].slice(0, PREFLIGHT_HISTORY_LIMIT),
  }
}

export function replaceDispatchAutomationReadiness(
  state: DispatchState,
  projectId: string,
  targetId: string,
  update: Partial<DispatchAutomationReadiness>,
): DispatchState {
  const target = state.targets.find(
    (candidate) => candidate.projectId === projectId && candidate.id === targetId,
  )

  if (!target) {
    return state
  }

  const existing =
    state.automationReadiness.find(
      (candidate) => candidate.projectId === projectId && candidate.targetId === targetId,
    ) ?? normalizeAutomationReadiness(null, target)
  const next: DispatchAutomationReadiness = {
    ...existing,
    ...update,
    projectId,
    targetId,
    lastReviewedAt: new Date().toISOString(),
  }

  return {
    ...state,
    automationReadiness: state.automationReadiness.some(
      (candidate) => candidate.projectId === projectId && candidate.targetId === targetId,
    )
      ? state.automationReadiness.map((candidate) =>
          candidate.projectId === projectId && candidate.targetId === targetId ? next : candidate,
        )
      : [...state.automationReadiness, next],
  }
}
