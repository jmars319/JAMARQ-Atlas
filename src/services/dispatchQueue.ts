import type { ProjectRecord } from '../domain/atlas'
import type {
  DeploymentArtifact,
  DeploymentRecord,
  DispatchRecoveryPlanEvaluation,
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
  getRecoveryPlanForTarget,
  getLatestVerificationEvidenceRun,
  getTargetDeploySessions,
} from '../domain/dispatch'
import type { ReportsState } from '../domain/reports'
import {
  deriveDispatchCloseoutForTarget,
  type DispatchCloseoutSummary,
} from './dispatchCloseout'
import { formatHostEvidenceProbeLabel } from './dispatchEvidence'
import { evaluateRecoveryPlanReadiness } from './dispatchRecovery'

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

export interface DispatchArtifactInspectionSummary {
  totalRequired: number
  inspectedRequired: number
  warningCount: number
  lastInspectedAt: string
  lines: string[]
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
  recoveryStatus: DispatchQueueSignal
  activeSession?: DispatchDeploySession
  latestSession?: DispatchDeploySession
  latestManualDeploymentRecord?: DeploymentRecord
  closeout: DispatchCloseoutSummary
  state: DispatchQueueState
  stateDetail: string
  artifactSummary: DispatchArtifactInspectionSummary
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

export function summarizeArtifactInspectionDetails(
  artifacts: DeploymentArtifact[],
): DispatchArtifactInspectionSummary {
  const requiredArtifacts = artifacts.filter((artifact) => artifact.required)
  const inspectedRequired = requiredArtifacts.filter(
    (artifact) => artifact.checksum && artifact.inspectedAt,
  )
  const warningCount = requiredArtifacts.reduce(
    (total, artifact) => total + artifact.warnings.length,
    0,
  )
  const lastInspectedAt =
    inspectedRequired.map((artifact) => artifact.inspectedAt).sort().at(-1) ?? ''
  const lines = requiredArtifacts.map((artifact) => {
    const status = artifact.checksum && artifact.inspectedAt ? 'inspected' : 'not inspected'
    const warningSuffix =
      artifact.warnings.length > 0 ? `, ${artifact.warnings.length} warning(s)` : ''

    return `${artifact.role}: ${artifact.filename} -> ${artifact.targetPath} (${status}${warningSuffix})`
  })

  return {
    totalRequired: requiredArtifacts.length,
    inspectedRequired: inspectedRequired.length,
    warningCount,
    lastInspectedAt,
    lines,
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
    detail: `${formatHostEvidenceProbeLabel(run)}. ${run.summary}`,
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

function summarizeRecovery(
  evaluation: DispatchRecoveryPlanEvaluation,
): DispatchQueueSignal {
  return {
    status: evaluation.status === 'current' ? 'passing' : 'warning',
    label: evaluation.label,
    detail: evaluation.detail,
    checkedAt: evaluation.reviewedAt,
  }
}

function blockingEvidenceStatus(status: DispatchQueueSignalStatus) {
  return status === 'missing' || status === 'not-configured' || status === 'failed'
}

function blockingRecoveryStatus(status: DispatchQueueSignalStatus) {
  return status === 'missing' || status === 'warning' || status === 'failed'
}

function queueState({
  artifactStatus,
  preflightStatus,
  hostStatus,
  verificationStatus,
  recoveryStatus,
  activeSession,
  latestManualRecord,
}: {
  artifactStatus: DispatchQueueSignal
  preflightStatus: DispatchQueueSignal
  hostStatus: DispatchQueueSignal
  verificationStatus: DispatchQueueSignal
  recoveryStatus: DispatchQueueSignal
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

  if (blockingRecoveryStatus(recoveryStatus.status)) {
    return 'needs-evidence'
  }

  return 'ready-for-manual-upload'
}

export function explainDispatchQueueState({
  state,
  artifactStatus,
  preflightStatus,
  hostStatus,
  verificationStatus,
  recoveryStatus,
  activeSession,
  latestManualRecord,
}: {
  state: DispatchQueueState
  artifactStatus: DispatchQueueSignal
  preflightStatus: DispatchQueueSignal
  hostStatus: DispatchQueueSignal
  verificationStatus: DispatchQueueSignal
  recoveryStatus: DispatchQueueSignal
  activeSession?: DispatchDeploySession
  latestManualRecord?: DeploymentRecord
}) {
  if (state === 'recorded') {
    return `Manual deployment record ${latestManualRecord?.id ?? 'exists'} is present. Atlas did not perform the deploy.`
  }

  if (state === 'session-active') {
    return `Manual deploy session ${activeSession?.id ?? ''} is active; continue evidence capture before closeout.`
  }

  if (state === 'needs-artifacts') {
    return artifactStatus.detail
  }

  if (state === 'needs-evidence') {
    const missing = [
      preflightStatus,
      hostStatus,
      verificationStatus,
      recoveryStatus,
    ].filter((signal) =>
      signal === recoveryStatus
        ? blockingRecoveryStatus(signal.status)
        : blockingEvidenceStatus(signal.status),
    )

    return `${missing.length} evidence or recovery area(s) still need capture or review before Atlas can describe the row as ready for manual upload.`
  }

  return 'Required artifacts, read-only evidence, and recovery references have been captured. A human can decide whether to upload outside Atlas; no production action will run here.'
}

function warningLines(signals: DispatchQueueSignal[]) {
  return signals
    .filter((signal) => signal.status !== 'passing' && signal.status !== 'skipped')
    .map((signal) => `${signal.label}: ${signal.detail}`)
}

export function deriveDispatchQueueItems({
  dispatch,
  projectRecords,
  reports,
  groupId = CPANEL_QUEUE_GROUP_ID,
}: {
  dispatch: DispatchState
  projectRecords: ProjectRecord[]
  reports?: ReportsState
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
    const recoveryStatus = summarizeRecovery(
      evaluateRecoveryPlanReadiness({
        target,
        plan: getRecoveryPlanForTarget(dispatch, target.id),
      }),
    )
    const closeout = deriveDispatchCloseoutForTarget({
      dispatch,
      reports,
      target,
      runbook,
    })
    const state = queueState({
      artifactStatus,
      preflightStatus,
      hostStatus,
      verificationStatus,
      recoveryStatus,
      activeSession,
      latestManualRecord: manualRecord,
    })
    const artifactSummary = summarizeArtifactInspectionDetails(runbook.artifacts)
    const stateDetail = explainDispatchQueueState({
      state,
      artifactStatus,
      preflightStatus,
      hostStatus,
      verificationStatus,
      recoveryStatus,
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
        recoveryStatus,
        activeSession,
        latestSession: sessions[0],
        latestManualDeploymentRecord: manualRecord,
        closeout,
        state,
        stateDetail,
        artifactSummary,
        warnings: warningLines([
          artifactStatus,
          preflightStatus,
          hostStatus,
          verificationStatus,
          recoveryStatus,
        ]).concat(closeout.warnings.slice(0, 2)),
      },
    ]
  })
}

export function getDispatchQueueTargetIds(items: DispatchQueueItem[]) {
  return items.map((item) => item.target.id)
}
