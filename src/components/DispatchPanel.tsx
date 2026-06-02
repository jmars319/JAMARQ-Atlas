import { useState } from 'react'
import type { CalibrationCredentialReference } from '../domain/calibration'
import {
  getActiveDeploySession,
  getHealthCheckSummary,
  getLatestDeploymentRecord,
  getLatestHostEvidenceRun,
  getLatestPreflightRun,
  getLatestVerificationEvidenceRun,
  getRecoveryPlanForTarget,
  getRunbookForTarget,
  getTargetDeploySessions,
  getTargetHostEvidenceRuns,
  getTargetPreflightRuns,
  getTargetRecords,
  getTargetVerificationEvidenceRuns,
  type DispatchAutomationDryRunPlan,
  type HostConnectionPreflightResult,
} from '../domain/dispatch'
import {
  evaluateDispatchWriteAutomationGate,
  evaluateAutomationReadiness,
  findAutomationReadiness,
} from '../services/dispatchAutomation'
import { evaluateDispatchReadiness } from '../services/dispatchReadiness'
import { deriveDispatchCloseoutForTarget } from '../services/dispatchCloseout'
import { compareHostEvidenceRuns, compareVerificationEvidenceRuns } from '../services/dispatchEvidence'
import type { DeploymentVerificationEvidence } from '../services/deployPreflight'
import { canStoreCalibrationValue } from '../services/calibration'
import { evaluateRecoveryPlanReadiness } from '../services/dispatchRecovery'
import { DispatchTargetDetail } from './dispatchPanel/DispatchTargetDetail'
import {
  DispatchTargetProvider,
  type DispatchPanelProps,
  type DispatchTargetContextValue,
} from './dispatchPanel/DispatchTargetContext'

export function DispatchPanel({
  record,
  dispatch,
  reports,
  credentialReferences = [],
  onTargetChange,
  onReadinessChange,
  onAutomationReadinessChange,
  onDeploymentArtifactChange,
  onDeploymentPreservePathChange,
  onDeploymentVerificationCheckChange,
  onRecoveryPlanChange,
  onStartDeploySession,
  onDeploySessionChange,
  onDeploySessionStepChange,
  onRecordManualDeployment,
  onAttachDeploySessionEvidence,
  onApplyDeploySessionPreset,
  onHostEvidenceRunAdd,
  onVerificationEvidenceRunAdd,
  onRunPreflight,
  preflightRunningTargetId,
}: DispatchPanelProps) {
  const [dryRunPlans, setDryRunPlans] = useState<Record<string, DispatchAutomationDryRunPlan>>({})
  const [artifactMessages, setArtifactMessages] = useState<Record<string, string>>({})
  const [verificationEvidence, setVerificationEvidence] = useState<
    Record<string, DeploymentVerificationEvidence[]>
  >({})
  const [verificationRunningTargetId, setVerificationRunningTargetId] = useState('')
  const [hostPreflightResults, setHostPreflightResults] = useState<
    Record<string, HostConnectionPreflightResult>
  >({})
  const [hostPreflightRunningTargetId, setHostPreflightRunningTargetId] = useState('')
  const [deploymentRecordConfirmations, setDeploymentRecordConfirmations] = useState<
    Record<string, string>
  >({})
  const [deploySessionMessages, setDeploySessionMessages] = useState<Record<string, string>>({})
  const [credentialMessages, setCredentialMessages] = useState<Record<string, string>>({})
  const [evidenceHistoryLimit, setEvidenceHistoryLimit] = useState(5)
  const targets = dispatch.targets.filter((target) => target.projectId === record.project.id)

  function dateInputValue(value: string) {
    return value ? value.slice(0, 10) : ''
  }

  function reviewedDateValue(value: string) {
    return value ? value + 'T12:00:00Z' : ''
  }

  function statusesToText(statuses: number[]) {
    return statuses.join('|')
  }

  function textToStatuses(value: string) {
    return value
      .split(/\||\n/)
      .map((item) => Number(item.trim()))
      .filter((item) => Number.isInteger(item) && item >= 100 && item <= 599)
  }

  function handleCredentialRefChange(targetId: string, value: string) {
    const check = canStoreCalibrationValue(value)

    if (!check.ok) {
      setCredentialMessages((current) => ({ ...current, [targetId]: check.message }))
      return
    }

    setCredentialMessages((current) => ({ ...current, [targetId]: '' }))
    onTargetChange(targetId, { credentialRef: value })
  }

  if (targets.length === 0) {
    return (
      <div className="dispatch-panel">
        <p className="empty-state">
          No deployment target configured for this project. Dispatch can track readiness once a
          target exists.
        </p>
      </div>
    )
  }

  return (
    <div className="dispatch-panel">
      {targets.map((target) => {
        const readiness = dispatch.readiness.find(
          (candidate) =>
            candidate.projectId === target.projectId && candidate.targetId === target.id,
        )
        const latestDeployment = getLatestDeploymentRecord(dispatch, target.id)
        const deploymentRecords = getTargetRecords(dispatch, target.id)
        const latestPreflight = getLatestPreflightRun(dispatch, target.id)
        const runbook = getRunbookForTarget(dispatch, target.id)
        const recoveryPlan = getRecoveryPlanForTarget(dispatch, target.id)
        const recoveryEvaluation = evaluateRecoveryPlanReadiness({ target, plan: recoveryPlan })
        const closeout = deriveDispatchCloseoutForTarget({ dispatch, reports, target, runbook })
        const latestHostEvidence = getLatestHostEvidenceRun(dispatch, target.id)
        const hostEvidenceRuns = getTargetHostEvidenceRuns(dispatch, target.id)
        const hostEvidenceComparison = compareHostEvidenceRuns(latestHostEvidence, hostEvidenceRuns[1])
        const latestVerificationEvidence = runbook
          ? getLatestVerificationEvidenceRun(dispatch, target.id, runbook.id)
          : undefined
        const verificationEvidenceRuns = runbook
          ? getTargetVerificationEvidenceRuns(dispatch, target.id, runbook.id)
          : []
        const verificationEvidenceComparison = compareVerificationEvidenceRuns(
          latestVerificationEvidence,
          verificationEvidenceRuns[1],
        )
        const targetDeploySessions = getTargetDeploySessions(dispatch, target.id)
        const latestDeploySession = targetDeploySessions[0]
        const activeDeploySession = getActiveDeploySession(dispatch, target.id)
        const preflightRuns = getTargetPreflightRuns(dispatch, target.id)
        const visibleHostEvidenceRuns = hostEvidenceRuns.slice(0, evidenceHistoryLimit)
        const visibleVerificationEvidenceRuns = verificationEvidenceRuns.slice(0, evidenceHistoryLimit)
        const visiblePreflightRuns = preflightRuns.slice(0, evidenceHistoryLimit)
        const preflightRunning = preflightRunningTargetId === target.id
        const health = getHealthCheckSummary(latestDeployment?.healthCheckResults)
        const automationReadiness = findAutomationReadiness(dispatch.automationReadiness, target)
        const automationEvaluation = evaluateAutomationReadiness(target, automationReadiness)
        const dryRunPlan = dryRunPlans[target.id]
        const targetVerificationEvidence = verificationEvidence[target.id] ?? []
        const advisoryRepository = record.project.repositories[0] ?? null
        const hostPreflightResult = hostPreflightResults[target.id]
        const hostEvidenceStatus = hostPreflightResult?.status ?? latestHostEvidence?.status
        const hostEvidenceCheckedAt =
          hostPreflightResult?.checkedAt ?? latestHostEvidence?.completedAt ?? ''
        const hostEvidenceChecks = hostPreflightResult?.checks ?? latestHostEvidence?.checks ?? []
        const hostEvidenceSummary =
          hostPreflightResult?.message ??
          latestHostEvidence?.summary ??
          'No host boundary evidence captured yet.'
        const hostEvidenceCredentialRef =
          hostPreflightResult?.credentialRef ?? latestHostEvidence?.credentialRef ?? ''
        const hostEvidenceProbeMode =
          hostPreflightResult?.probeMode ?? latestHostEvidence?.probeMode ?? 'tcp'
        const hostEvidenceAuthMethod =
          hostPreflightResult?.authMethod ?? latestHostEvidence?.authMethod ?? 'none'
        const sessionMessage =
          (activeDeploySession ? deploySessionMessages[activeDeploySession.id] : '') ||
          (latestDeploySession ? deploySessionMessages[latestDeploySession.id] : '')
        const writeGateEvaluation = evaluateDispatchWriteAutomationGate({
          target,
          readiness,
          automationReadiness,
          latestDeployment,
          runbook,
          dryRunPlan,
        })
        const evaluation = evaluateDispatchReadiness({
          target,
          readiness,
          latestRecord: latestDeployment,
        })
        const contextValue: DispatchTargetContextValue = {
          record,
          dispatch,
          reports,
          credentialReferences: credentialReferences as CalibrationCredentialReference[],
          target,
          readiness,
          latestDeployment,
          deploymentRecords,
          latestPreflight,
          runbook,
          recoveryPlan,
          recoveryEvaluation,
          closeout,
          latestHostEvidence,
          hostEvidenceRuns,
          hostEvidenceComparison,
          latestVerificationEvidence,
          verificationEvidenceRuns,
          verificationEvidenceComparison,
          targetDeploySessions,
          latestDeploySession,
          activeDeploySession,
          preflightRuns,
          visibleHostEvidenceRuns,
          visibleVerificationEvidenceRuns,
          visiblePreflightRuns,
          preflightRunning,
          health,
          automationReadiness,
          automationEvaluation,
          dryRunPlan,
          targetVerificationEvidence,
          advisoryRepository,
          hostPreflightResult,
          hostEvidenceStatus,
          hostEvidenceCheckedAt,
          hostEvidenceChecks,
          hostEvidenceSummary,
          hostEvidenceCredentialRef,
          hostEvidenceProbeMode,
          hostEvidenceAuthMethod,
          sessionMessage,
          writeGateEvaluation,
          evaluation,
          artifactMessages,
          setArtifactMessages,
          verificationEvidence,
          setVerificationEvidence,
          verificationRunningTargetId,
          setVerificationRunningTargetId,
          hostPreflightResults,
          setHostPreflightResults,
          hostPreflightRunningTargetId,
          setHostPreflightRunningTargetId,
          deploymentRecordConfirmations,
          setDeploymentRecordConfirmations,
          deploySessionMessages,
          setDeploySessionMessages,
          credentialMessages,
          setCredentialMessages,
          evidenceHistoryLimit,
          setEvidenceHistoryLimit,
          setDryRunPlans,
          onTargetChange,
          onReadinessChange,
          onAutomationReadinessChange,
          onDeploymentArtifactChange,
          onDeploymentPreservePathChange,
          onDeploymentVerificationCheckChange,
          onRecoveryPlanChange,
          onStartDeploySession,
          onDeploySessionChange,
          onDeploySessionStepChange,
          onRecordManualDeployment,
          onAttachDeploySessionEvidence,
          onApplyDeploySessionPreset,
          onHostEvidenceRunAdd,
          onVerificationEvidenceRunAdd,
          onRunPreflight,
          dateInputValue,
          reviewedDateValue,
          statusesToText,
          textToStatuses,
          handleCredentialRefChange,
        }

        return (
          <DispatchTargetProvider key={target.id} value={contextValue}>
            <DispatchTargetDetail />
          </DispatchTargetProvider>
        )
      })}
    </div>
  )
}
