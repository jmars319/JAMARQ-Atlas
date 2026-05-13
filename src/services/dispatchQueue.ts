import type { ProjectRecord } from '../domain/atlas'
import type {
  DeploymentArtifact,
  DeploymentRecord,
  DeploymentRunbook,
  DeploymentTarget,
  DispatchDeploySession,
  DispatchEvidenceStatus,
  DispatchPreflightRun,
  DispatchPreflightStatus,
  DispatchState,
} from '../domain/dispatch'
import {
  getActiveDeploySession,
  getLatestHostEvidenceRun,
  getLatestPreflightRun,
  getLatestVerificationEvidenceRun,
  getTargetDeploySessions,
} from '../domain/dispatch'

export const CPANEL_QUEUE_GROUP_ID = 'current-cpanel-sites'

export type DispatchQueueState =
  | 'needs-artifacts'
  | 'needs-evidence'
  | 'session-active'
  | 'ready-for-manual-upload'
  | 'recorded'

export type DispatchQueueSignalStatus =
  | DispatchEvidenceStatus
  | DispatchPreflightStatus
  | 'missing'

export interface DispatchQueueSignal {
  status: DispatchQueueSignalStatus
  label: string
  detail: string
  checkedAt: string
}

export interface DispatchQueueItem {
  id: string
  order: number
  projectRecord: ProjectRecord | null
  projectName: string
  target: DeploymentTarget
  runbook: DeploymentRunbook
  artifactStatus: DispatchQueueSignal
  preflightStatus: DispatchQueueSignal
  hostStatus: DispatchQueueSignal
  verificationStatus: DispatchQueueSignal
  activeSession?: DispatchDeploySession
  latestSession?: DispatchDeploySession
  latestManualDeploymentRecord?: DeploymentRecord
  state: DispatchQueueState
  warnings: string[]
}

function statusLabel(status: DispatchQueueSignalStatus) {
  return status
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

function latestManualDeploymentRecord(state: DispatchState, targetId: string) {
  return state.records
    .filter(
      (record) =>
        record.targetId === targetId &&
        (record.id.startsWith('manual-deployment-') || record.sourceRef === 'manual-outside-atlas'),
    )
    .sort((left, right) =>
      (right.completedAt || right.startedAt).localeCompare(left.completedAt || left.startedAt),
    )[0]
}

function summarizeArtifacts(artifacts: DeploymentArtifact[]): DispatchQueueSignal {
  const requiredArtifacts = artifacts.filter((artifact) => artifact.required)

  if (requiredArtifacts.length === 0) {
    return {
      status: 'skipped',
      label: 'No required artifacts',
      detail: 'No required artifact files are recorded for this runbook.',
      checkedAt: '',
    }
  }

  const inspected = requiredArtifacts.filter((artifact) => artifact.checksum && artifact.inspectedAt)
  const warnings = requiredArtifacts.flatMap((artifact) => artifact.warnings)

  if (inspected.length < requiredArtifacts.length) {
    return {
      status: 'missing',
      label: `${inspected.length}/${requiredArtifacts.length} inspected`,
      detail: 'One or more required artifacts still need local ZIP inspection.',
      checkedAt: inspected.map((artifact) => artifact.inspectedAt).sort().at(-1) ?? '',
    }
  }

  if (warnings.length > 0) {
    return {
      status: 'warning',
      label: 'Artifact warnings',
      detail: warnings.slice(0, 2).join(' '),
      checkedAt: inspected.map((artifact) => artifact.inspectedAt).sort().at(-1) ?? '',
    }
  }

  return {
    status: 'passing',
    label: 'Artifacts inspected',
    detail: `${inspected.length}/${requiredArtifacts.length} required artifacts have checksum evidence.`,
    checkedAt: inspected.map((artifact) => artifact.inspectedAt).sort().at(-1) ?? '',
  }
}

function summarizePreflight(run: DispatchPreflightRun | undefined): DispatchQueueSignal {
  if (!run) {
    return {
      status: 'missing',
      label: 'Not run',
      detail: 'Read-only Dispatch preflight has not been captured.',
      checkedAt: '',
    }
  }

  return {
    status: run.status,
    label: statusLabel(run.status),
    detail: run.summary,
    checkedAt: run.completedAt,
  }
}

function summarizeHost(
  run: ReturnType<typeof getLatestHostEvidenceRun>,
): DispatchQueueSignal {
  if (!run) {
    return {
      status: 'missing',
      label: 'Not run',
      detail: 'Read-only host inspection evidence has not been captured.',
      checkedAt: '',
    }
  }

  return {
    status: run.status,
    label: `${statusLabel(run.status)} / ${run.probeMode}`,
    detail: run.summary,
    checkedAt: run.completedAt,
  }
}

function summarizeVerification(
  run: ReturnType<typeof getLatestVerificationEvidenceRun>,
): DispatchQueueSignal {
  if (!run) {
    return {
      status: 'missing',
      label: 'Not run',
      detail: 'Runbook verification checks have not been captured.',
      checkedAt: '',
    }
  }

  return {
    status: run.status,
    label: statusLabel(run.status),
    detail: run.summary,
    checkedAt: run.completedAt,
  }
}

function blockingEvidenceStatus(status: DispatchQueueSignalStatus) {
  return status === 'missing' || status === 'not-configured' || status === 'failed'
}

function queueState({
  artifactStatus,
  preflightStatus,
  hostStatus,
  verificationStatus,
  activeSession,
  latestManualRecord,
}: {
  artifactStatus: DispatchQueueSignal
  preflightStatus: DispatchQueueSignal
  hostStatus: DispatchQueueSignal
  verificationStatus: DispatchQueueSignal
  activeSession?: DispatchDeploySession
  latestManualRecord?: DeploymentRecord
}): DispatchQueueState {
  if (latestManualRecord) {
    return 'recorded'
  }

  if (activeSession) {
    return 'session-active'
  }

  if (artifactStatus.status === 'missing' || artifactStatus.status === 'warning') {
    return 'needs-artifacts'
  }

  if (
    [preflightStatus, hostStatus, verificationStatus].some((signal) =>
      blockingEvidenceStatus(signal.status),
    )
  ) {
    return 'needs-evidence'
  }

  return 'ready-for-manual-upload'
}

function warningLines(signals: DispatchQueueSignal[]) {
  return signals
    .filter((signal) => signal.status !== 'passing' && signal.status !== 'skipped')
    .map((signal) => `${signal.label}: ${signal.detail}`)
}

export function deriveDispatchQueueItems({
  dispatch,
  projectRecords,
  groupId = CPANEL_QUEUE_GROUP_ID,
}: {
  dispatch: DispatchState
  projectRecords: ProjectRecord[]
  groupId?: string
}): DispatchQueueItem[] {
  const group = dispatch.orderGroups.find((candidate) => candidate.id === groupId)
  const runbookIds = group?.runbookIds ?? []

  return runbookIds.flatMap((runbookId, index): DispatchQueueItem[] => {
    const runbook = dispatch.runbooks.find((candidate) => candidate.id === runbookId)
    const target = runbook
      ? dispatch.targets.find((candidate) => candidate.id === runbook.targetId)
      : undefined

    if (!runbook || !target) {
      return []
    }

    const projectRecord =
      projectRecords.find((record) => record.project.id === runbook.projectId) ?? null
    const latestPreflight = getLatestPreflightRun(dispatch, target.id)
    const latestHostEvidence = getLatestHostEvidenceRun(dispatch, target.id)
    const latestVerificationEvidence = getLatestVerificationEvidenceRun(
      dispatch,
      target.id,
      runbook.id,
    )
    const sessions = getTargetDeploySessions(dispatch, target.id)
    const activeSession = getActiveDeploySession(dispatch, target.id)
    const manualRecord = latestManualDeploymentRecord(dispatch, target.id)
    const artifactStatus = summarizeArtifacts(runbook.artifacts)
    const preflightStatus = summarizePreflight(latestPreflight)
    const hostStatus = summarizeHost(latestHostEvidence)
    const verificationStatus = summarizeVerification(latestVerificationEvidence)
    const state = queueState({
      artifactStatus,
      preflightStatus,
      hostStatus,
      verificationStatus,
      activeSession,
      latestManualRecord: manualRecord,
    })

    return [
      {
        id: `${groupId}-${runbook.id}`,
        order: index + 1,
        projectRecord,
        projectName: projectRecord?.project.name ?? runbook.siteName,
        target,
        runbook,
        artifactStatus,
        preflightStatus,
        hostStatus,
        verificationStatus,
        activeSession,
        latestSession: sessions[0],
        latestManualDeploymentRecord: manualRecord,
        state,
        warnings: warningLines([
          artifactStatus,
          preflightStatus,
          hostStatus,
          verificationStatus,
        ]),
      },
    ]
  })
}

export function getDispatchQueueTargetIds(items: DispatchQueueItem[]) {
  return items.map((item) => item.target.id)
}
