import type {
  DeploymentRecord,
  DeploymentRunbook,
  DeploymentTarget,
  DispatchDeploySession,
  DispatchEvidenceStatus,
  DispatchState,
} from '../domain/dispatch'
import {
  getActiveDeploySession,
  getLatestHostEvidenceRun,
  getLatestVerificationEvidenceRun,
  getRunbookForTarget,
  getTargetDeploySessions,
} from '../domain/dispatch'
import {
  emptyReportsState,
  type ReportPacket,
  type ReportPacketType,
  type ReportsState,
} from '../domain/reports'

export type DispatchCloseoutState =
  | 'not-started'
  | 'session-active'
  | 'needs-evidence'
  | 'needs-manual-record'
  | 'needs-follow-up'
  | 'closeout-ready'

export type DispatchCloseoutRequirementStatus = 'satisfied' | 'warning' | 'missing'

export type DispatchCloseoutSignalStatus =
  | DispatchCloseoutRequirementStatus
  | DispatchEvidenceStatus
  | 'none'

export interface DispatchCloseoutSignal {
  id: string
  label: string
  status: DispatchCloseoutSignalStatus
  detail: string
  checkedAt: string
}

export interface DispatchCloseoutRequirement {
  id: string
  label: string
  status: DispatchCloseoutRequirementStatus
  detail: string
}

export interface DispatchCloseoutSummary {
  projectId: string
  targetId: string
  runbookId: string | null
  state: DispatchCloseoutState
  label: string
  detail: string
  latestSessionId: string | null
  latestManualDeploymentRecordId: string | null
  latestReportPacketId: string | null
  latestHostEvidenceId: string | null
  latestVerificationEvidenceId: string | null
  requirements: DispatchCloseoutRequirement[]
  signals: DispatchCloseoutSignal[]
  warnings: string[]
}

export const deploymentReportPacketTypes: ReportPacketType[] = [
  'deployment-readiness-packet',
  'post-deploy-verification-packet',
  'client-site-update-packet',
  'internal-deploy-handoff-packet',
]

export const closeoutStateLabels: Record<DispatchCloseoutState, string> = {
  'not-started': 'Not started',
  'session-active': 'Session active',
  'needs-evidence': 'Needs evidence',
  'needs-manual-record': 'Needs manual record',
  'needs-follow-up': 'Needs follow-up',
  'closeout-ready': 'Closeout ready',
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

export function isDeploymentReportType(type: ReportPacketType) {
  return deploymentReportPacketTypes.includes(type)
}

function latestRelatedReport(reports: ReportsState, projectId: string) {
  return reports.packets
    .filter(
      (packet) =>
        packet.status !== 'archived' &&
        packet.projectIds.includes(projectId) &&
        isDeploymentReportType(packet.type),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0]
}

function requiredArtifacts(runbook: DeploymentRunbook | undefined) {
  return runbook?.artifacts.filter((artifact) => artifact.required) ?? []
}

function artifactRequirement(runbook: DeploymentRunbook | undefined): DispatchCloseoutRequirement {
  const artifacts = requiredArtifacts(runbook)

  if (!runbook) {
    return {
      id: 'artifacts',
      label: 'Artifact inspection',
      status: 'warning',
      detail: 'No cPanel runbook is configured for this target.',
    }
  }

  if (artifacts.length === 0) {
    return {
      id: 'artifacts',
      label: 'Artifact inspection',
      status: 'satisfied',
      detail: 'No required artifacts are recorded for this runbook.',
    }
  }

  const inspected = artifacts.filter((artifact) => artifact.checksum && artifact.inspectedAt)
  const warnings = artifacts.flatMap((artifact) => artifact.warnings)

  if (inspected.length < artifacts.length) {
    return {
      id: 'artifacts',
      label: 'Artifact inspection',
      status: 'missing',
      detail: `${inspected.length}/${artifacts.length} required artifacts have checksum evidence.`,
    }
  }

  if (warnings.length > 0) {
    return {
      id: 'artifacts',
      label: 'Artifact inspection',
      status: 'warning',
      detail: warnings.slice(0, 2).join(' '),
    }
  }

  return {
    id: 'artifacts',
    label: 'Artifact inspection',
    status: 'satisfied',
    detail: `${inspected.length}/${artifacts.length} required artifacts have checksum evidence.`,
  }
}

function sessionRequirement(
  latestSession: DispatchDeploySession | undefined,
): DispatchCloseoutRequirement {
  if (!latestSession) {
    return {
      id: 'deploy-session',
      label: 'Deploy session',
      status: 'missing',
      detail: 'No manual deploy session has been started for this target.',
    }
  }

  if (latestSession.status === 'blocked') {
    return {
      id: 'deploy-session',
      label: 'Deploy session',
      status: 'warning',
      detail: `Latest session ${latestSession.id} is blocked.`,
    }
  }

  return {
    id: 'deploy-session',
    label: 'Deploy session',
    status: 'satisfied',
    detail: `Latest session ${latestSession.id} is ${latestSession.status}.`,
  }
}

function sessionStepsRequirement(
  latestSession: DispatchDeploySession | undefined,
): DispatchCloseoutRequirement {
  if (!latestSession) {
    return {
      id: 'session-steps',
      label: 'Session steps',
      status: 'missing',
      detail: 'No session steps are available for closeout review.',
    }
  }

  const blocked = latestSession.steps.filter((step) => step.status === 'blocked')
  const unresolved = latestSession.steps.filter((step) =>
    ['pending', 'in-progress'].includes(step.status),
  )

  if (blocked.length > 0) {
    return {
      id: 'session-steps',
      label: 'Session steps',
      status: 'warning',
      detail: `${blocked.length} session step(s) are blocked.`,
    }
  }

  if (unresolved.length > 0) {
    return {
      id: 'session-steps',
      label: 'Session steps',
      status: 'missing',
      detail: `${unresolved.length} session step(s) still need confirmation or an explicit skip.`,
    }
  }

  return {
    id: 'session-steps',
    label: 'Session steps',
    status: 'satisfied',
    detail: 'All session steps are confirmed or explicitly skipped.',
  }
}

function evidenceRequirement({
  id,
  label,
  evidence,
  missingDetail,
}: {
  id: string
  label: string
  evidence?: { id: string; status: DispatchEvidenceStatus; summary: string }
  missingDetail: string
}): DispatchCloseoutRequirement {
  if (!evidence) {
    return {
      id,
      label,
      status: 'missing',
      detail: missingDetail,
    }
  }

  if (evidence.status === 'passing' || evidence.status === 'skipped') {
    return {
      id,
      label,
      status: 'satisfied',
      detail: `${evidence.id}: ${evidence.summary}`,
    }
  }

  return {
    id,
    label,
    status: evidence.status === 'failed' || evidence.status === 'not-configured' ? 'missing' : 'warning',
    detail: `${evidence.id}: ${evidence.summary}`,
  }
}

function manualRecordRequirement(
  record: DeploymentRecord | undefined,
): DispatchCloseoutRequirement {
  if (!record) {
    return {
      id: 'manual-deployment-record',
      label: 'Manual deployment record',
      status: 'missing',
      detail: 'No human-confirmed manual deployment record exists for this target.',
    }
  }

  return {
    id: 'manual-deployment-record',
    label: 'Manual deployment record',
    status: 'satisfied',
    detail: `${record.id}: ${record.status} at ${record.completedAt || record.startedAt}.`,
  }
}

function backupRequirement({
  target,
  session,
  record,
}: {
  target: DeploymentTarget
  session?: DispatchDeploySession
  record?: DeploymentRecord
}): DispatchCloseoutRequirement {
  if (!target.backupRequired) {
    return {
      id: 'backup-reference',
      label: 'Backup reference',
      status: 'satisfied',
      detail: 'Target does not currently require a database backup reference.',
    }
  }

  const backupRef = record?.databaseBackupRef || session?.databaseBackupRef

  if (!backupRef) {
    return {
      id: 'backup-reference',
      label: 'Backup reference',
      status: 'warning',
      detail: 'Backup is required, but no backup reference has been recorded.',
    }
  }

  return {
    id: 'backup-reference',
    label: 'Backup reference',
    status: 'satisfied',
    detail: backupRef,
  }
}

function rollbackRequirement({
  session,
  record,
}: {
  session?: DispatchDeploySession
  record?: DeploymentRecord
}): DispatchCloseoutRequirement {
  const rollbackRef = record?.rollbackRef || session?.rollbackRef

  if (!rollbackRef) {
    return {
      id: 'rollback-reference',
      label: 'Rollback reference',
      status: 'warning',
      detail: 'No rollback reference has been recorded for closeout context.',
    }
  }

  return {
    id: 'rollback-reference',
    label: 'Rollback reference',
    status: 'satisfied',
    detail: rollbackRef,
  }
}

function reportRequirement(packet: ReportPacket | undefined): DispatchCloseoutRequirement {
  if (!packet) {
    return {
      id: 'report-packet',
      label: 'Deployment report packet',
      status: 'warning',
      detail: 'No related deployment report packet is stored yet.',
    }
  }

  return {
    id: 'report-packet',
    label: 'Deployment report packet',
    status: 'satisfied',
    detail: `${packet.title} (${packet.status}).`,
  }
}

function requirementSignal(requirement: DispatchCloseoutRequirement): DispatchCloseoutSignal {
  return {
    id: requirement.id,
    label: requirement.label,
    status: requirement.status,
    detail: requirement.detail,
    checkedAt: '',
  }
}

function evidenceSignal({
  id,
  label,
  evidence,
}: {
  id: string
  label: string
  evidence?: { status: DispatchEvidenceStatus; summary: string; completedAt: string }
}): DispatchCloseoutSignal {
  if (!evidence) {
    return {
      id,
      label,
      status: 'none',
      detail: 'No evidence captured.',
      checkedAt: '',
    }
  }

  return {
    id,
    label,
    status: evidence.status,
    detail: evidence.summary,
    checkedAt: evidence.completedAt,
  }
}

function stateFromRequirements({
  requirements,
  latestSession,
  latestManualRecord,
  hasEvidenceAttempt,
}: {
  requirements: DispatchCloseoutRequirement[]
  latestSession?: DispatchDeploySession
  latestManualRecord?: DeploymentRecord
  hasEvidenceAttempt: boolean
}): DispatchCloseoutState {
  if (!latestSession && !latestManualRecord && !hasEvidenceAttempt) {
    return 'not-started'
  }

  if (latestSession && ['active', 'blocked'].includes(latestSession.status)) {
    return 'session-active'
  }

  if (
    requirements.some(
      (requirement) =>
        ['artifacts', 'host-evidence', 'verification-evidence'].includes(requirement.id) &&
        requirement.status === 'missing',
    )
  ) {
    return 'needs-evidence'
  }

  if (!latestManualRecord) {
    return 'needs-manual-record'
  }

  if (requirements.some((requirement) => requirement.status !== 'satisfied')) {
    return 'needs-follow-up'
  }

  return 'closeout-ready'
}

function summaryDetail(state: DispatchCloseoutState, requirements: DispatchCloseoutRequirement[]) {
  const missing = requirements.filter((requirement) => requirement.status === 'missing')
  const warnings = requirements.filter((requirement) => requirement.status === 'warning')

  if (state === 'closeout-ready') {
    return 'Core closeout evidence, manual record, and deployment report context are present.'
  }

  if (state === 'not-started') {
    return 'No deploy session, evidence attempt, or manual deployment record exists yet.'
  }

  if (missing.length > 0) {
    return `${missing.length} closeout requirement(s) still need evidence or human action.`
  }

  if (warnings.length > 0) {
    return `${warnings.length} closeout follow-up item(s) need review.`
  }

  return 'Closeout is advisory and awaiting human review.'
}

export function deriveDispatchCloseoutForTarget({
  dispatch,
  reports = emptyReportsState,
  target,
  runbook = getRunbookForTarget(dispatch, target.id),
}: {
  dispatch: DispatchState
  reports?: ReportsState
  target: DeploymentTarget
  runbook?: DeploymentRunbook
}): DispatchCloseoutSummary {
  const sessions = getTargetDeploySessions(dispatch, target.id)
  const latestSession = sessions[0]
  const activeSession = getActiveDeploySession(dispatch, target.id)
  const latestHostEvidence = getLatestHostEvidenceRun(dispatch, target.id)
  const latestVerificationEvidence = getLatestVerificationEvidenceRun(
    dispatch,
    target.id,
    runbook?.id,
  )
  const latestManualRecord = latestManualDeploymentRecord(dispatch, target.id)
  const latestReport = latestRelatedReport(reports, target.projectId)
  const artifactReq = artifactRequirement(runbook)
  const requirements = [
    artifactReq,
    sessionRequirement(latestSession),
    sessionStepsRequirement(latestSession),
    evidenceRequirement({
      id: 'host-evidence',
      label: 'Host evidence',
      evidence: latestHostEvidence,
      missingDetail: 'No read-only host evidence has been captured.',
    }),
    evidenceRequirement({
      id: 'verification-evidence',
      label: 'Runbook verification evidence',
      evidence: latestVerificationEvidence,
      missingDetail: 'No runbook verification evidence has been captured.',
    }),
    manualRecordRequirement(latestManualRecord),
    backupRequirement({ target, session: latestSession, record: latestManualRecord }),
    rollbackRequirement({ session: latestSession, record: latestManualRecord }),
    reportRequirement(latestReport),
  ]
  const hasArtifactAttempt = requiredArtifacts(runbook).some(
    (artifact) => artifact.checksum || artifact.inspectedAt,
  )
  const state = stateFromRequirements({
    requirements,
    latestSession: activeSession ?? latestSession,
    latestManualRecord,
    hasEvidenceAttempt: Boolean(
      latestHostEvidence || latestVerificationEvidence || hasArtifactAttempt,
    ),
  })
  const warnings = requirements
    .filter((requirement) => requirement.status !== 'satisfied')
    .map((requirement) => `${requirement.label}: ${requirement.detail}`)

  return {
    projectId: target.projectId,
    targetId: target.id,
    runbookId: runbook?.id ?? null,
    state,
    label: closeoutStateLabels[state],
    detail: summaryDetail(state, requirements),
    latestSessionId: latestSession?.id ?? null,
    latestManualDeploymentRecordId: latestManualRecord?.id ?? null,
    latestReportPacketId: latestReport?.id ?? null,
    latestHostEvidenceId: latestHostEvidence?.id ?? null,
    latestVerificationEvidenceId: latestVerificationEvidence?.id ?? null,
    requirements,
    signals: [
      evidenceSignal({
        id: 'host-evidence',
        label: 'Host evidence',
        evidence: latestHostEvidence,
      }),
      evidenceSignal({
        id: 'verification-evidence',
        label: 'Verification evidence',
        evidence: latestVerificationEvidence,
      }),
      requirementSignal(manualRecordRequirement(latestManualRecord)),
      requirementSignal(reportRequirement(latestReport)),
    ],
    warnings,
  }
}

export function deriveDispatchCloseoutSummaries({
  dispatch,
  reports = emptyReportsState,
}: {
  dispatch: DispatchState
  reports?: ReportsState
}) {
  return dispatch.targets.map((target) =>
    deriveDispatchCloseoutForTarget({
      dispatch,
      reports,
      target,
      runbook: getRunbookForTarget(dispatch, target.id),
    }),
  )
}
