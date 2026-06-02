import { type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { ProjectRecord } from '../../domain/atlas'
import type { CalibrationCredentialReference } from '../../domain/calibration'
import type { ReportsState } from '../../domain/reports'
import type { DispatchAutomationEvaluation } from '../../services/dispatchAutomation'
import type { DispatchReadinessEvaluation } from '../../services/dispatchReadiness'
import type { DispatchCloseoutSummary } from '../../services/dispatchCloseout'
import type { DeploymentVerificationEvidence } from '../../services/deployPreflight'
import type { DispatchEvidenceComparison } from '../../services/dispatchEvidence'
import type { getHealthCheckSummary } from '../../domain/dispatch'
import type {
  DispatchAutomationDryRunPlan,
  DispatchAutomationReadiness,
  DispatchDeploySession,
  DispatchDeploySessionStep,
  DispatchDeploySessionStepKind,
  DispatchHostEvidenceRun,
  DispatchReadiness,
  DispatchRecoveryPlan,
  DispatchState,
  DispatchVerificationEvidenceRun,
  DispatchWriteAutomationGateEvaluation,
  DeploymentArtifact,
  DeploymentPreservePath,
  DeploymentRecord,
  DeploymentRunbook,
  DeploymentTarget,
  DeploymentVerificationCheck,
  HostConnectionCheck,
  HostConnectionAuthMethod,
  HostConnectionPreflightResult,
  HostConnectionProbeMode,
  DispatchRecoveryPlanEvaluation,
} from '../../domain/dispatch'
import { DispatchTargetContext } from './DispatchTargetContextState'

export interface DispatchPanelProps {
  record: ProjectRecord
  dispatch: DispatchState
  reports: ReportsState
  credentialReferences?: CalibrationCredentialReference[]
  onTargetChange: (targetId: string, update: Partial<DeploymentTarget>) => void
  onReadinessChange: (targetId: string, projectId: string, update: Partial<DispatchReadiness>) => void
  onAutomationReadinessChange: (targetId: string, projectId: string, update: Partial<DispatchAutomationReadiness>) => void
  onDeploymentArtifactChange: (runbookId: string, artifactId: string, update: Partial<DeploymentArtifact>) => void
  onDeploymentPreservePathChange: (runbookId: string, preservePathId: string, update: Partial<DeploymentPreservePath>) => void
  onDeploymentVerificationCheckChange: (runbookId: string, checkId: string, update: Partial<DeploymentVerificationCheck>) => void
  onRecoveryPlanChange: (targetId: string, update: Partial<DispatchRecoveryPlan>) => void
  onStartDeploySession: (runbookId: string) => void
  onDeploySessionChange: (sessionId: string, update: Partial<Pick<DispatchDeploySession, 'versionLabel' | 'sourceRef' | 'commitSha' | 'artifactName' | 'deployedBy' | 'summary' | 'recordStatus' | 'rollbackRef' | 'databaseBackupRef'>>) => void
  onDeploySessionStepChange: (sessionId: string, stepId: string, update: Partial<Pick<DispatchDeploySessionStep, 'status' | 'notes' | 'evidence'>>) => void
  onRecordManualDeployment: (sessionId: string, confirmation: string) => { ok: boolean; message: string; recordId: string | null }
  onAttachDeploySessionEvidence: (sessionId: string, stepKind: DispatchDeploySessionStepKind, label: string, detail: string) => void
  onApplyDeploySessionPreset: (sessionId: string, presetId: import('../../services/deploySessions').DeploySessionChecklistPresetId) => void
  onHostEvidenceRunAdd: (run: DispatchHostEvidenceRun) => void
  onVerificationEvidenceRunAdd: (run: DispatchVerificationEvidenceRun) => void
  onRunPreflight: (targetId: string) => Promise<void>
  preflightRunningTargetId: string
}

export interface DispatchTargetContextValue extends Required<Pick<DispatchPanelProps, 'credentialReferences'>> {
  record: ProjectRecord
  dispatch: DispatchState
  reports: ReportsState
  target: DeploymentTarget
  readiness: DispatchReadiness | undefined
  latestDeployment: DeploymentRecord | undefined
  deploymentRecords: DeploymentRecord[]
  latestPreflight: DispatchState['preflightRuns'][number] | undefined
  runbook: DeploymentRunbook | undefined
  recoveryPlan: DispatchRecoveryPlan | undefined
  recoveryEvaluation: DispatchRecoveryPlanEvaluation
  closeout: DispatchCloseoutSummary
  latestHostEvidence: DispatchHostEvidenceRun | undefined
  hostEvidenceRuns: DispatchHostEvidenceRun[]
  hostEvidenceComparison: DispatchEvidenceComparison
  latestVerificationEvidence: DispatchVerificationEvidenceRun | undefined
  verificationEvidenceRuns: DispatchVerificationEvidenceRun[]
  verificationEvidenceComparison: DispatchEvidenceComparison
  targetDeploySessions: DispatchDeploySession[]
  latestDeploySession: DispatchDeploySession | undefined
  activeDeploySession: DispatchDeploySession | undefined
  preflightRuns: DispatchState['preflightRuns']
  visibleHostEvidenceRuns: DispatchHostEvidenceRun[]
  visibleVerificationEvidenceRuns: DispatchVerificationEvidenceRun[]
  visiblePreflightRuns: DispatchState['preflightRuns']
  preflightRunning: boolean
  health: ReturnType<typeof getHealthCheckSummary>
  automationReadiness: DispatchAutomationReadiness
  automationEvaluation: DispatchAutomationEvaluation
  dryRunPlan: DispatchAutomationDryRunPlan | undefined
  targetVerificationEvidence: DeploymentVerificationEvidence[]
  advisoryRepository: ProjectRecord['project']['repositories'][number] | null
  hostPreflightResult: HostConnectionPreflightResult | undefined
  hostEvidenceStatus: HostConnectionPreflightResult['status'] | DispatchHostEvidenceRun['status'] | undefined
  hostEvidenceCheckedAt: string
  hostEvidenceChecks: HostConnectionCheck[]
  hostEvidenceSummary: string
  hostEvidenceCredentialRef: string
  hostEvidenceProbeMode: HostConnectionProbeMode
  hostEvidenceAuthMethod: HostConnectionAuthMethod
  sessionMessage: string
  writeGateEvaluation: DispatchWriteAutomationGateEvaluation
  evaluation: DispatchReadinessEvaluation
  artifactMessages: Record<string, string>
  setArtifactMessages: Dispatch<SetStateAction<Record<string, string>>>
  verificationEvidence: Record<string, DeploymentVerificationEvidence[]>
  setVerificationEvidence: Dispatch<SetStateAction<Record<string, DeploymentVerificationEvidence[]>>>
  verificationRunningTargetId: string
  setVerificationRunningTargetId: Dispatch<SetStateAction<string>>
  hostPreflightResults: Record<string, HostConnectionPreflightResult>
  setHostPreflightResults: Dispatch<SetStateAction<Record<string, HostConnectionPreflightResult>>>
  hostPreflightRunningTargetId: string
  setHostPreflightRunningTargetId: Dispatch<SetStateAction<string>>
  deploymentRecordConfirmations: Record<string, string>
  setDeploymentRecordConfirmations: Dispatch<SetStateAction<Record<string, string>>>
  deploySessionMessages: Record<string, string>
  setDeploySessionMessages: Dispatch<SetStateAction<Record<string, string>>>
  credentialMessages: Record<string, string>
  setCredentialMessages: Dispatch<SetStateAction<Record<string, string>>>
  evidenceHistoryLimit: number
  setEvidenceHistoryLimit: Dispatch<SetStateAction<number>>
  setDryRunPlans: Dispatch<SetStateAction<Record<string, DispatchAutomationDryRunPlan>>>
  onTargetChange: DispatchPanelProps['onTargetChange']
  onReadinessChange: DispatchPanelProps['onReadinessChange']
  onAutomationReadinessChange: DispatchPanelProps['onAutomationReadinessChange']
  onDeploymentArtifactChange: DispatchPanelProps['onDeploymentArtifactChange']
  onDeploymentPreservePathChange: DispatchPanelProps['onDeploymentPreservePathChange']
  onDeploymentVerificationCheckChange: DispatchPanelProps['onDeploymentVerificationCheckChange']
  onRecoveryPlanChange: DispatchPanelProps['onRecoveryPlanChange']
  onStartDeploySession: DispatchPanelProps['onStartDeploySession']
  onDeploySessionChange: DispatchPanelProps['onDeploySessionChange']
  onDeploySessionStepChange: DispatchPanelProps['onDeploySessionStepChange']
  onRecordManualDeployment: DispatchPanelProps['onRecordManualDeployment']
  onAttachDeploySessionEvidence: DispatchPanelProps['onAttachDeploySessionEvidence']
  onApplyDeploySessionPreset: DispatchPanelProps['onApplyDeploySessionPreset']
  onHostEvidenceRunAdd: DispatchPanelProps['onHostEvidenceRunAdd']
  onVerificationEvidenceRunAdd: DispatchPanelProps['onVerificationEvidenceRunAdd']
  onRunPreflight: DispatchPanelProps['onRunPreflight']
  dateInputValue: (value: string) => string
  reviewedDateValue: (value: string) => string
  statusesToText: (statuses: number[]) => string
  textToStatuses: (value: string) => number[]
  handleCredentialRefChange: (targetId: string, value: string) => void
}

export function DispatchTargetProvider({ value, children }: { value: DispatchTargetContextValue; children: ReactNode }) {
  return <DispatchTargetContext.Provider value={value}>{children}</DispatchTargetContext.Provider>
}
