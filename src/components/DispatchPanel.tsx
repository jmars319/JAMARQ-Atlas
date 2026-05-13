import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  History,
  ListChecks,
  RefreshCw,
  Rocket,
  Server,
  Shield,
} from 'lucide-react'
import { useState } from 'react'
import type { ProjectRecord } from '../domain/atlas'
import { formatDateLabel, formatDateTimeLabel } from '../domain/atlas'
import {
  DEPLOYMENT_STATUSES,
  formatDeploymentStatus,
  formatPreflightStatus,
  getActiveDeploySession,
  getHealthCheckSummary,
  getLatestDeploymentRecord,
  getLatestHostEvidenceRun,
  getLatestPreflightRun,
  getLatestVerificationEvidenceRun,
  getRunbookForTarget,
  getTargetDeploySessions,
  getTargetHostEvidenceRuns,
  getTargetPreflightRuns,
  getTargetRecords,
  getTargetVerificationEvidenceRuns,
  type DispatchAutomationDryRunPlan,
  type DispatchAutomationReadiness,
  type DispatchDeploySession,
  type DispatchDeploySessionStep,
  type DispatchDeploySessionStepKind,
  type DispatchHostEvidenceRun,
  type DeploymentArtifact,
  type DeploymentStatus,
  type DeploymentTarget,
  type DispatchReadiness,
  type DispatchState,
  type DispatchVerificationEvidenceRun,
  type HostConnectionPreflightResult,
} from '../domain/dispatch'
import {
  createDispatchAutomationDryRunPlan,
  evaluateDispatchWriteAutomationGate,
  evaluateAutomationReadiness,
  findAutomationReadiness,
  canExecuteWriteAutomation,
} from '../services/dispatchAutomation'
import { evaluateDispatchReadiness } from '../services/dispatchReadiness'
import {
  inspectDeploymentArtifact,
  runDeploymentVerificationChecks,
  type DeploymentVerificationEvidence,
} from '../services/deployPreflight'
import {
  createHostEvidenceRun,
  createVerificationEvidenceRun,
} from '../services/dispatchEvidence'
import { MANUAL_DEPLOYMENT_RECORD_CONFIRMATION } from '../services/deploySessions'
import { requestHostConnectionPreflight } from '../services/hostConnection'

interface DispatchPanelProps {
  record: ProjectRecord
  dispatch: DispatchState
  onTargetChange: (targetId: string, update: Partial<DeploymentTarget>) => void
  onReadinessChange: (
    targetId: string,
    projectId: string,
    update: Partial<DispatchReadiness>,
  ) => void
  onAutomationReadinessChange: (
    targetId: string,
    projectId: string,
    update: Partial<DispatchAutomationReadiness>,
  ) => void
  onDeploymentArtifactChange: (
    runbookId: string,
    artifactId: string,
    update: Partial<DeploymentArtifact>,
  ) => void
  onStartDeploySession: (runbookId: string) => void
  onDeploySessionChange: (
    sessionId: string,
    update: Partial<
      Pick<
        DispatchDeploySession,
        | 'versionLabel'
        | 'sourceRef'
        | 'commitSha'
        | 'artifactName'
        | 'deployedBy'
        | 'summary'
        | 'recordStatus'
        | 'rollbackRef'
        | 'databaseBackupRef'
      >
    >,
  ) => void
  onDeploySessionStepChange: (
    sessionId: string,
    stepId: string,
    update: Partial<Pick<DispatchDeploySessionStep, 'status' | 'notes' | 'evidence'>>,
  ) => void
  onRecordManualDeployment: (
    sessionId: string,
    confirmation: string,
  ) => { ok: boolean; message: string; recordId: string | null }
  onAttachDeploySessionEvidence: (
    sessionId: string,
    stepKind: DispatchDeploySessionStepKind,
    label: string,
    detail: string,
  ) => void
  onHostEvidenceRunAdd: (run: DispatchHostEvidenceRun) => void
  onVerificationEvidenceRunAdd: (run: DispatchVerificationEvidenceRun) => void
  onRunPreflight: (targetId: string) => Promise<void>
  preflightRunningTargetId: string
}

function linesToText(lines: string[]) {
  return lines.join('\n')
}

function textToLines(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

function backupLabel(target: DeploymentTarget, readiness?: DispatchReadiness) {
  if (!target.backupRequired) {
    return 'Not required'
  }

  return readiness?.backupReady ? 'Ready' : 'Required'
}

const DEPLOY_SESSION_STEP_STATUSES: DispatchDeploySessionStep['status'][] = [
  'pending',
  'in-progress',
  'confirmed',
  'skipped',
  'blocked',
]

function evidenceLinkDetail({
  id,
  status,
  completedAt,
  summary,
}: {
  id: string
  status: string
  completedAt: string
  summary: string
}) {
  return `${id}: ${status} at ${completedAt}. ${summary}`
}

export function DispatchPanel({
  record,
  dispatch,
  onTargetChange,
  onReadinessChange,
  onAutomationReadinessChange,
  onDeploymentArtifactChange,
  onStartDeploySession,
  onDeploySessionChange,
  onDeploySessionStepChange,
  onRecordManualDeployment,
  onAttachDeploySessionEvidence,
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
  const targets = dispatch.targets.filter((target) => target.projectId === record.project.id)

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
        const latestHostEvidence = getLatestHostEvidenceRun(dispatch, target.id)
        const hostEvidenceRuns = getTargetHostEvidenceRuns(dispatch, target.id)
        const latestVerificationEvidence = runbook
          ? getLatestVerificationEvidenceRun(dispatch, target.id, runbook.id)
          : undefined
        const verificationEvidenceRuns = runbook
          ? getTargetVerificationEvidenceRuns(dispatch, target.id, runbook.id)
          : []
        const targetDeploySessions = getTargetDeploySessions(dispatch, target.id)
        const latestDeploySession = targetDeploySessions[0]
        const activeDeploySession = getActiveDeploySession(dispatch, target.id)
        const preflightRuns = getTargetPreflightRuns(dispatch, target.id)
        const preflightRunning = preflightRunningTargetId === target.id
        const health = getHealthCheckSummary(latestDeployment?.healthCheckResults)
        const automationReadiness = findAutomationReadiness(
          dispatch.automationReadiness,
          target,
        )
        const automationEvaluation = evaluateAutomationReadiness(target, automationReadiness)
        const dryRunPlan = dryRunPlans[target.id]
        const targetVerificationEvidence = verificationEvidence[target.id] ?? []
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

        return (
          <section className="dispatch-target-detail" key={target.id}>
            <div className="dispatch-summary-card">
              <div className="dispatch-summary-heading">
                <div>
                  <p className="section-label">Atlas Dispatch</p>
                  <h3>{target.name}</h3>
                </div>
                <span className={`dispatch-status dispatch-${target.status}`}>
                  {formatDeploymentStatus(target.status)}
                </span>
              </div>

              <div className="dispatch-summary-grid">
                <div>
                  <span>Environment</span>
                  <strong>{target.environment}</strong>
                </div>
                <div>
                  <span>Host type</span>
                  <strong>{target.hostType}</strong>
                </div>
                <div>
                  <span>Credential ref</span>
                  <strong>{target.credentialRef || 'Not set'}</strong>
                </div>
                <div>
                  <span>Public URL</span>
                  <strong>{target.publicUrl || 'Not set'}</strong>
                </div>
                <div>
                  <span>Last deployed</span>
                  <strong>{formatDateTimeLabel(latestDeployment?.completedAt ?? null)}</strong>
                </div>
                <div>
                  <span>Last verified</span>
                  <strong>{formatDateLabel(target.lastVerified)}</strong>
                </div>
                <div>
                  <span>Health</span>
                  <strong>{health.label}</strong>
                </div>
                <div>
                  <span>Rollback</span>
                  <strong>{latestDeployment?.rollbackRef ? 'Available' : 'Not recorded'}</strong>
                </div>
                <div>
                  <span>Backup</span>
                  <strong>{backupLabel(target, readiness)}</strong>
                </div>
                <div>
                  <span>Preflight</span>
                  <strong>
                    {latestPreflight ? formatPreflightStatus(latestPreflight.status) : 'Not run'}
                  </strong>
                </div>
                <div>
                  <span>Host boundary</span>
                  <strong>{hostEvidenceStatus ?? 'Not checked'}</strong>
                </div>
                <div>
                  <span>Verification evidence</span>
                  <strong>{latestVerificationEvidence?.status ?? 'Not checked'}</strong>
                </div>
                <div>
                  <span>Deploy session</span>
                  <strong>{activeDeploySession?.status ?? 'Not active'}</strong>
                </div>
              </div>
            </div>

            <div className="dispatch-runbook" aria-label={`${target.name} deploy runbook`}>
              <div className="panel-heading">
                <ClipboardCheck size={17} />
                <h3>cPanel Deploy Runbook</h3>
              </div>
              {runbook ? (
                <>
                  <div className="dispatch-signal-grid">
                    <div>
                      <strong>Order {runbook.deployOrder}</strong>
                      <span>{runbook.siteName}</span>
                    </div>
                    <div>
                      <strong>{runbook.artifacts.length}</strong>
                      <span>Expected artifacts</span>
                    </div>
                    <div>
                      <strong>{runbook.preservePaths.length}</strong>
                      <span>Preserve paths</span>
                    </div>
                    <div>
                      <strong>{runbook.verificationChecks.length}</strong>
                      <span>Verification checks</span>
                    </div>
                  </div>
                  <p>{runbook.summary}</p>
                  <div className="dispatch-preflight-actions">
                    <button type="button" onClick={() => onStartDeploySession(runbook.id)}>
                      <Rocket size={15} />
                      Start deploy session
                    </button>
                    <span>
                      Manual session only. Uploads and server changes happen outside Atlas.
                    </span>
                  </div>

                  <div className="dispatch-runbook-grid">
                    <div>
                      <strong>Artifacts</strong>
                      <ul className="dispatch-list">
                        {runbook.artifacts.map((artifact) => (
                          <li key={artifact.id}>
                            <div className="dispatch-artifact-line">
                              <span>
                                {artifact.filename} {'->'} {artifact.targetPath} ({artifact.role})
                              </span>
                              <label>
                                <span className="sr-only">Inspect {artifact.filename}</span>
                                <input
                                  type="file"
                                  accept=".zip,application/zip,application/x-zip-compressed"
                                  onChange={(event) => {
                                    const file = event.target.files?.[0]
                                    event.target.value = ''

                                    if (!file) {
                                      return
                                    }

                                    void inspectDeploymentArtifact(file, artifact).then(
                                      (inspection) => {
                                        onDeploymentArtifactChange(runbook.id, artifact.id, {
                                          checksum: inspection.checksum,
                                          inspectedAt: inspection.inspectedAt,
                                          warnings: inspection.warnings,
                                          notes: [
                                            ...artifact.notes.filter(
                                              (note) => !note.startsWith('Inspected entries:'),
                                            ),
                                            `Inspected entries: ${
                                              inspection.topLevelEntries.join(', ') || 'none'
                                            }`,
                                          ],
                                        })
                                        setArtifactMessages((current) => ({
                                          ...current,
                                          [artifact.id]:
                                            inspection.warnings.length > 0
                                              ? inspection.warnings.join(' ')
                                              : 'Artifact inspected locally. No upload occurred.',
                                        }))
                                      },
                                    )
                                  }}
                                />
                              </label>
                            </div>
                            {artifact.checksum ? (
                              <div className="resource-meta">
                                <span>{artifact.checksum.slice(0, 22)}...</span>
                                <span>{formatDateTimeLabel(artifact.inspectedAt)}</span>
                              </div>
                            ) : null}
                            {artifact.warnings.length > 0 ? (
                              <ul className="dispatch-list dispatch-warning-list">
                                {artifact.warnings.map((warning) => (
                                  <li key={warning}>{warning}</li>
                                ))}
                              </ul>
                            ) : null}
                            {artifactMessages[artifact.id] ? (
                              <p className="empty-state">{artifactMessages[artifact.id]}</p>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong>Preserve/create on server</strong>
                      {runbook.preservePaths.length > 0 ? (
                        <ul className="dispatch-list">
                          {runbook.preservePaths.map((path) => (
                            <li key={path.id}>
                              {path.path}
                              {path.temporary ? ' (temporary)' : ''}: {path.reason}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="empty-state">No special preserve paths recorded.</p>
                      )}
                    </div>
                    <div>
                      <strong>Verification checks</strong>
                      <ul className="dispatch-list">
                        {runbook.verificationChecks.map((check) => (
                          <li key={check.id}>
                            {check.method} {check.urlPath} {'->'} {check.expectedStatuses.join('/')}
                          </li>
                        ))}
                      </ul>
                      <div className="dispatch-preflight-actions">
                        <button
                          type="button"
                          disabled={verificationRunningTargetId === target.id}
                          onClick={() => {
                            setVerificationRunningTargetId(target.id)
                            void runDeploymentVerificationChecks({
                              target,
                              checks: runbook.verificationChecks,
                            })
                              .then((evidence) => {
                                const run = createVerificationEvidenceRun({
                                  projectId: target.projectId,
                                  targetId: target.id,
                                  runbookId: runbook.id,
                                  evidence,
                                })

                                onVerificationEvidenceRunAdd(run)
                                setVerificationEvidence((current) => ({
                                  ...current,
                                  [target.id]: evidence,
                                }))
                              })
                              .finally(() => setVerificationRunningTargetId(''))
                          }}
                        >
                          <RefreshCw size={15} />
                          {verificationRunningTargetId === target.id
                            ? 'Checking'
                            : 'Run read-only checks'}
                        </button>
                        <span>No upload, extraction, deletion, or server write.</span>
                      </div>
                      {targetVerificationEvidence.length > 0 ? (
                        <ol className="resource-list">
                          {targetVerificationEvidence.map((evidence) => (
                            <li key={evidence.check.id}>
                              <div className="resource-icon" aria-hidden="true">
                                {evidence.passedExpectation ? (
                                  <CheckCircle2 size={15} />
                                ) : (
                                  <AlertTriangle size={15} />
                                )}
                              </div>
                              <div>
                                <div className="resource-line">
                                  <strong>{evidence.check.label}</strong>
                                  <span
                                    className={`resource-pill ${
                                      evidence.passedExpectation
                                        ? 'state-passing'
                                        : 'state-warning'
                                    }`}
                                  >
                                    {evidence.result.statusCode ?? 'No status'}
                                  </span>
                                </div>
                                <p>{evidence.message}</p>
                                <div className="resource-meta">
                                  <span>{evidence.url}</span>
                                  <span>
                                    {evidence.check.protectedResource
                                      ? 'protected path'
                                      : 'public path'}
                                  </span>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ol>
                      ) : null}
                      {latestVerificationEvidence ? (
                        <div className="dispatch-preflight-history">
                          <strong>Stored verification evidence</strong>
                          <ol>
                            {verificationEvidenceRuns.slice(0, 5).map((run) => (
                              <li key={run.id}>
                                <span className={`resource-pill state-${run.status}`}>
                                  {run.status}
                                </span>
                                <span>{formatDateTimeLabel(run.completedAt)}</span>
                                <span>{run.summary}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      ) : (
                        <p className="empty-state">
                          No stored runbook verification evidence yet.
                        </p>
                      )}
                    </div>
                    <div>
                      <strong>Deploy notes</strong>
                      <ul className="dispatch-list">
                        {[...runbook.notes, ...runbook.manualDeployNotes].map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </>
              ) : (
                <p className="empty-state">
                  No deploy runbook is configured for this target yet.
                </p>
              )}
            </div>

            <div className="dispatch-deploy-session" aria-label={`${target.name} deploy sessions`}>
              <div className="panel-heading">
                <Rocket size={17} />
                <h3>Deploy Sessions</h3>
              </div>
              <div className="dispatch-signal-grid">
                <div>
                  <strong>{activeDeploySession?.status ?? 'None active'}</strong>
                  <span>Manual session state</span>
                </div>
                <div>
                  <strong>{targetDeploySessions.length}</strong>
                  <span>Sessions tracked for this target</span>
                </div>
                <div>
                  <strong>{latestHostEvidence?.status ?? 'Not captured'}</strong>
                  <span>Latest host evidence</span>
                </div>
                <div>
                  <strong>{latestVerificationEvidence?.status ?? 'Not captured'}</strong>
                  <span>Latest verification evidence</span>
                </div>
              </div>

              {activeDeploySession ? (
                <>
                  <div className="dispatch-safety">
                    <Shield size={17} />
                    <p>
                      This session tracks human evidence only. Atlas did not upload, extract,
                      delete, overwrite, back up, restore, roll back, SSH/SFTP write, cPanel write,
                      or touch production databases.
                    </p>
                  </div>

                  <div className="dispatch-manual-record">
                    <div className="panel-heading">
                      <ClipboardCheck size={17} />
                      <h4>Closeout Evidence</h4>
                    </div>
                    <p>
                      Attach stored read-only evidence to this manual session. This records what a
                      human reviewed; it does not mark anything verified or deployed.
                    </p>
                    <div className="dispatch-preflight-actions">
                      <button
                        type="button"
                        disabled={!latestHostEvidence}
                        onClick={() => {
                          if (!latestHostEvidence) {
                            return
                          }

                          onAttachDeploySessionEvidence(
                            activeDeploySession.id,
                            'preflight',
                            `Host evidence linked: ${latestHostEvidence.id}`,
                            evidenceLinkDetail(latestHostEvidence),
                          )
                          setDeploySessionMessages((current) => ({
                            ...current,
                            [activeDeploySession.id]: 'Latest host evidence attached to session.',
                          }))
                        }}
                      >
                        <ClipboardCheck size={15} />
                        Add latest host evidence to session notes
                      </button>
                      <button
                        type="button"
                        disabled={!latestVerificationEvidence}
                        onClick={() => {
                          if (!latestVerificationEvidence) {
                            return
                          }

                          onAttachDeploySessionEvidence(
                            activeDeploySession.id,
                            'verification-checks',
                            `Verification evidence linked: ${latestVerificationEvidence.id}`,
                            evidenceLinkDetail(latestVerificationEvidence),
                          )
                          setDeploySessionMessages((current) => ({
                            ...current,
                            [activeDeploySession.id]:
                              'Latest verification evidence attached to session.',
                          }))
                        }}
                      >
                        <ClipboardCheck size={15} />
                        Add latest verification evidence to session notes
                      </button>
                      <span>Evidence is advisory and remains local to Dispatch.</span>
                    </div>
                  </div>

                  <div className="dispatch-session-steps">
                    {activeDeploySession.steps.map((step) => (
                      <article className="dispatch-session-step" key={step.id}>
                        <div className="resource-line">
                          <strong>{step.label}</strong>
                          <span className={`resource-pill state-${step.status}`}>
                            {step.status}
                          </span>
                        </div>
                        <p>{step.detail}</p>
                        <div className="field-grid">
                          <label className="field">
                            <span>Step status</span>
                            <select
                              aria-label={`${step.label} step status`}
                              value={step.status}
                              onChange={(event) =>
                                onDeploySessionStepChange(activeDeploySession.id, step.id, {
                                  status: event.target.value as DispatchDeploySessionStep['status'],
                                })
                              }
                            >
                              {DEPLOY_SESSION_STEP_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {status}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field field-full">
                            <span>Notes</span>
                            <textarea
                              aria-label={`${step.label} notes`}
                              rows={2}
                              value={step.notes}
                              onChange={(event) =>
                                onDeploySessionStepChange(activeDeploySession.id, step.id, {
                                  notes: event.target.value,
                                })
                              }
                            />
                          </label>
                          <label className="field field-full">
                            <span>Evidence</span>
                            <input
                              aria-label={`${step.label} evidence`}
                              value={step.evidence}
                              onChange={(event) =>
                                onDeploySessionStepChange(activeDeploySession.id, step.id, {
                                  evidence: event.target.value,
                                })
                              }
                            />
                          </label>
                        </div>
                      </article>
                    ))}
                  </div>

                  <div
                    className="dispatch-manual-record"
                    aria-label={`${target.name} manual deployment record`}
                  >
                    <div className="panel-heading">
                      <ClipboardCheck size={17} />
                      <h4>Record Manual Deployment</h4>
                    </div>
                    <p>
                      Create a deployment record only after a human reviews the session. The record
                      will state that Atlas did not perform the deploy.
                    </p>
                    <div className="field-grid">
                      <label className="field field-full">
                        <span>Version label</span>
                        <input
                          value={activeDeploySession.versionLabel}
                          onChange={(event) =>
                            onDeploySessionChange(activeDeploySession.id, {
                              versionLabel: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Manual record status</span>
                        <select
                          value={activeDeploySession.recordStatus}
                          onChange={(event) =>
                            onDeploySessionChange(activeDeploySession.id, {
                              recordStatus: event.target.value as DeploymentStatus,
                            })
                          }
                        >
                          {DEPLOYMENT_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {formatDeploymentStatus(status)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Deployed by</span>
                        <input
                          value={activeDeploySession.deployedBy}
                          onChange={(event) =>
                            onDeploySessionChange(activeDeploySession.id, {
                              deployedBy: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Source ref</span>
                        <input
                          value={activeDeploySession.sourceRef}
                          onChange={(event) =>
                            onDeploySessionChange(activeDeploySession.id, {
                              sourceRef: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Commit SHA</span>
                        <input
                          value={activeDeploySession.commitSha}
                          onChange={(event) =>
                            onDeploySessionChange(activeDeploySession.id, {
                              commitSha: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="field field-full">
                        <span>Artifact name</span>
                        <input
                          value={activeDeploySession.artifactName}
                          onChange={(event) =>
                            onDeploySessionChange(activeDeploySession.id, {
                              artifactName: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Rollback ref</span>
                        <input
                          value={activeDeploySession.rollbackRef}
                          onChange={(event) =>
                            onDeploySessionChange(activeDeploySession.id, {
                              rollbackRef: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Database backup ref</span>
                        <input
                          value={activeDeploySession.databaseBackupRef}
                          onChange={(event) =>
                            onDeploySessionChange(activeDeploySession.id, {
                              databaseBackupRef: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="field field-full">
                        <span>Manual deployment summary</span>
                        <textarea
                          rows={3}
                          value={activeDeploySession.summary}
                          onChange={(event) =>
                            onDeploySessionChange(activeDeploySession.id, {
                              summary: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="field field-full">
                        <span>Typed confirmation</span>
                        <input
                          aria-label={`Type ${MANUAL_DEPLOYMENT_RECORD_CONFIRMATION} for ${activeDeploySession.siteName}`}
                          value={deploymentRecordConfirmations[activeDeploySession.id] ?? ''}
                          placeholder={MANUAL_DEPLOYMENT_RECORD_CONFIRMATION}
                          onChange={(event) =>
                            setDeploymentRecordConfirmations((current) => ({
                              ...current,
                              [activeDeploySession.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                    <div className="dispatch-preflight-actions">
                      <button
                        type="button"
                        onClick={() => {
                          const result = onRecordManualDeployment(
                            activeDeploySession.id,
                            deploymentRecordConfirmations[activeDeploySession.id] ?? '',
                          )

                          setDeploySessionMessages((current) => ({
                            ...current,
                            [activeDeploySession.id]: result.message,
                          }))

                          if (result.ok) {
                            setDeploymentRecordConfirmations((current) => ({
                              ...current,
                              [activeDeploySession.id]: '',
                            }))
                          }
                        }}
                      >
                        <ClipboardCheck size={15} />
                        Record manual deployment
                      </button>
                      <span>
                        Requires typing {MANUAL_DEPLOYMENT_RECORD_CONFIRMATION}. No production
                        action runs.
                      </span>
                    </div>
                    {sessionMessage ? <p className="empty-state">{sessionMessage}</p> : null}
                  </div>
                </>
              ) : (
                <p className="empty-state">
                  No active deploy session for this target. Start one from the cPanel runbook when a
                  human is ready to perform an outside-Atlas upload.
                </p>
              )}

              {!activeDeploySession && sessionMessage ? (
                <p className="empty-state">{sessionMessage}</p>
              ) : null}

              {targetDeploySessions.length > 0 ? (
                <div className="dispatch-preflight-history">
                  <strong>Session history</strong>
                  <ol>
                    {targetDeploySessions.slice(0, 5).map((session) => {
                      const sessionEvidence = session.steps
                        .map((step) => `${step.notes}\n${step.evidence}`)
                        .join('\n')
                      const hasHostEvidence = sessionEvidence.includes('host-evidence-')
                      const hasVerificationEvidence = sessionEvidence.includes(
                        'verification-evidence-',
                      )

                      return (
                        <li key={session.id}>
                          <span className={`resource-pill state-${session.status}`}>
                            {session.status}
                          </span>
                          <span>{formatDateTimeLabel(session.updatedAt)}</span>
                          <span>
                            {session.siteName}
                            {session.recordedDeploymentRecordId
                              ? ` / ${session.recordedDeploymentRecordId}`
                              : ''}
                            {hasHostEvidence ? ' / host evidence' : ''}
                            {hasVerificationEvidence ? ' / verification evidence' : ''}
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ) : null}
            </div>

            <div className="dispatch-preflight" aria-label={`${target.name} host connection`}>
              <div className="panel-heading">
                <Server size={17} />
                <h3>Read-Only Host Boundary</h3>
              </div>
              <div className="dispatch-preflight-actions">
                <button
                  type="button"
                  disabled={hostPreflightRunningTargetId === target.id}
                  onClick={() => {
                    setHostPreflightRunningTargetId(target.id)
                    void requestHostConnectionPreflight({
                      target,
                      preservePaths: runbook?.preservePaths.map((preservePath) => preservePath.path) ?? [],
                    })
                      .then((result) => {
                        onHostEvidenceRunAdd(
                          createHostEvidenceRun({
                            projectId: target.projectId,
                            result,
                          }),
                        )
                        setHostPreflightResults((current) => ({
                          ...current,
                          [target.id]: result,
                        }))
                      })
                      .finally(() => setHostPreflightRunningTargetId(''))
                  }}
                >
                  <RefreshCw size={15} />
                  {hostPreflightRunningTargetId === target.id
                    ? 'Checking host'
                    : 'Run read-only host check'}
                </button>
                <span>Credential refs only. No SSH/SFTP write, upload, or writable check.</span>
              </div>

              {hostEvidenceStatus ? (
                <>
                  <div className="dispatch-signal-grid">
                    <div>
                      <strong>{hostEvidenceStatus}</strong>
                      <span>{hostEvidenceSummary}</span>
                    </div>
                    <div>
                      <strong>{formatDateTimeLabel(hostEvidenceCheckedAt)}</strong>
                      <span>{hostEvidenceChecks.length} read-only checks</span>
                    </div>
                    <div>
                      <strong>{hostEvidenceCredentialRef || 'Not set'}</strong>
                      <span>Credential reference label</span>
                    </div>
                  </div>
                  <ol className="resource-list">
                    {hostEvidenceChecks.map((check) => (
                      <li key={check.id}>
                        <div className="resource-icon" aria-hidden="true">
                          {check.status === 'passing' ? (
                            <CheckCircle2 size={15} />
                          ) : (
                            <AlertTriangle size={15} />
                          )}
                        </div>
                        <div>
                          <div className="resource-line">
                            <strong>{check.label}</strong>
                            <span className={`resource-pill state-${check.status}`}>
                              {check.status}
                            </span>
                          </div>
                          <p>{check.message}</p>
                          <div className="resource-meta">
                            <span>{check.type}</span>
                            {check.host ? <span>{check.host}</span> : null}
                            {check.path ? <span>{check.path}</span> : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {hostEvidenceRuns.length > 0 ? (
                    <div className="dispatch-preflight-history">
                      <strong>Host evidence history</strong>
                      <ol>
                        {hostEvidenceRuns.slice(0, 5).map((run) => (
                          <li key={run.id}>
                            <span className={`resource-pill state-${run.status}`}>
                              {run.status}
                            </span>
                            <span>{formatDateTimeLabel(run.completedAt)}</span>
                            <span>{run.summary}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="empty-state">
                  No host boundary evidence captured yet. Configure server-side
                  ATLAS_HOST_PREFLIGHT_CONFIG to enable optional read-only host checks.
                </p>
              )}
            </div>

            <div className="dispatch-preflight" aria-label={`${target.name} preflight`}>
              <div className="panel-heading">
                <ListChecks size={17} />
                <h3>Preflight Evidence</h3>
              </div>
              <div className="dispatch-preflight-actions">
                <button
                  type="button"
                  onClick={() => void onRunPreflight(target.id)}
                  disabled={preflightRunning}
                >
                  <RefreshCw size={15} />
                  {preflightRunning ? 'Running preflight' : 'Run read-only preflight'}
                </button>
                <span>Evidence only. Atlas and Dispatch statuses are unchanged.</span>
              </div>

              {latestPreflight ? (
                <>
                  <div className="dispatch-signal-grid">
                    <div>
                      <strong>{formatPreflightStatus(latestPreflight.status)}</strong>
                      <span>{latestPreflight.summary}</span>
                    </div>
                    <div>
                      <strong>{formatDateTimeLabel(latestPreflight.completedAt)}</strong>
                      <span>{latestPreflight.checks.length} checks captured</span>
                    </div>
                  </div>

                  <ol className="resource-list preflight-check-list">
                    {latestPreflight.checks.map((preflightCheck) => (
                      <li key={preflightCheck.id}>
                        <div className="resource-icon" aria-hidden="true">
                          {preflightCheck.status === 'passing' ? (
                            <CheckCircle2 size={15} />
                          ) : (
                            <AlertTriangle size={15} />
                          )}
                        </div>
                        <div>
                          <div className="resource-line">
                            <strong>{preflightCheck.label}</strong>
                            <span className={`resource-pill state-${preflightCheck.status}`}>
                              {formatPreflightStatus(preflightCheck.status)}
                            </span>
                          </div>
                          <p>{preflightCheck.message}</p>
                          <div className="resource-meta">
                            <span>{preflightCheck.source}</span>
                            <span>{preflightCheck.type}</span>
                            <span>{formatDateTimeLabel(preflightCheck.checkedAt)}</span>
                          </div>
                          {preflightCheck.details?.length ? (
                            <ul className="dispatch-list">
                              {preflightCheck.details.map((detail) => (
                                <li key={detail}>{detail}</li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ol>

                  <div className="dispatch-preflight-history">
                    <strong>Preflight history</strong>
                    <ol>
                      {preflightRuns.slice(0, 5).map((run) => (
                        <li key={run.id}>
                          <span className={`resource-pill state-${run.status}`}>
                            {formatPreflightStatus(run.status)}
                          </span>
                          <span>{formatDateTimeLabel(run.completedAt)}</span>
                          <span>{run.summary}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </>
              ) : (
                <p className="empty-state">
                  No preflight evidence captured yet. Run a read-only preflight to collect target,
                  health, backup, rollback, and optional GitHub signals.
                </p>
              )}
            </div>

            <div className="dispatch-readiness">
              <div className="panel-heading">
                {evaluation.blocked ? <AlertTriangle size={17} /> : <CheckCircle2 size={17} />}
                <h3>Readiness</h3>
              </div>
              <div className="dispatch-signal-grid">
                <div>
                  <strong>{evaluation.ready ? 'Ready' : 'Not ready'}</strong>
                  <span>Advisory only. Atlas status is unchanged.</span>
                </div>
                <div>
                  <strong>{evaluation.blocked ? 'Blocked' : 'No readiness blockers'}</strong>
                  <span>{formatDateTimeLabel(evaluation.lastCheckedAt)}</span>
                </div>
              </div>

              {evaluation.blockers.length > 0 ? (
                <ul className="dispatch-list">
                  {evaluation.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              ) : null}

              {evaluation.warnings.length > 0 ? (
                <ul className="dispatch-list dispatch-warning-list">
                  {evaluation.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="field-grid">
              <label className="field">
                <span>Remote host</span>
                <input
                  value={target.remoteHost}
                  onChange={(event) =>
                    onTargetChange(target.id, { remoteHost: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Remote user</span>
                <input
                  value={target.remoteUser}
                  onChange={(event) =>
                    onTargetChange(target.id, { remoteUser: event.target.value })
                  }
                />
              </label>
              <label className="field field-full">
                <span>Credential reference label (not a secret)</span>
                <input
                  value={target.credentialRef}
                  placeholder="godaddy-mmh-production"
                  onChange={(event) =>
                    onTargetChange(target.id, { credentialRef: event.target.value })
                  }
                />
              </label>
              <label className="field field-full">
                <span>Remote frontend path</span>
                <input
                  value={target.remoteFrontendPath}
                  onChange={(event) =>
                    onTargetChange(target.id, { remoteFrontendPath: event.target.value })
                  }
                />
              </label>
              <label className="field field-full">
                <span>Remote backend path</span>
                <input
                  value={target.remoteBackendPath}
                  onChange={(event) =>
                    onTargetChange(target.id, { remoteBackendPath: event.target.value })
                  }
                />
              </label>
              <label className="field field-full">
                <span>Health check URLs</span>
                <textarea
                  value={linesToText(target.healthCheckUrls)}
                  rows={3}
                  onChange={(event) =>
                    onTargetChange(target.id, {
                      healthCheckUrls: textToLines(event.target.value),
                    })
                  }
                />
              </label>
              <label className="field field-full">
                <span>Deployment notes</span>
                <textarea
                  value={linesToText(target.deploymentNotes)}
                  rows={3}
                  onChange={(event) =>
                    onTargetChange(target.id, {
                      deploymentNotes: textToLines(event.target.value),
                    })
                  }
                />
              </label>
              <label className="field field-full">
                <span>Blockers</span>
                <textarea
                  value={linesToText(target.blockers)}
                  rows={3}
                  onChange={(event) =>
                    onTargetChange(target.id, {
                      blockers: textToLines(event.target.value),
                    })
                  }
                />
              </label>
              <label className="field field-full">
                <span>Target notes</span>
                <textarea
                  value={linesToText(target.notes)}
                  rows={3}
                  onChange={(event) =>
                    onTargetChange(target.id, {
                      notes: textToLines(event.target.value),
                    })
                  }
                />
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={target.backupRequired}
                  onChange={(event) =>
                    onTargetChange(target.id, { backupRequired: event.target.checked })
                  }
                />
                <span>Backup required</span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={target.destructiveOperationsRequireConfirmation}
                  onChange={(event) =>
                    onTargetChange(target.id, {
                      destructiveOperationsRequireConfirmation: event.target.checked,
                    })
                  }
                />
                <span>Destructive confirmation required</span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={readiness?.backupReady ?? false}
                  onChange={(event) =>
                    onReadinessChange(target.id, target.projectId, {
                      backupReady: event.target.checked,
                    })
                  }
                />
                <span>Backup ready</span>
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={readiness?.artifactReady ?? false}
                  onChange={(event) =>
                    onReadinessChange(target.id, target.projectId, {
                      artifactReady: event.target.checked,
                    })
                  }
                />
                <span>Artifact ready</span>
              </label>
            </div>

            <div className="dispatch-automation" aria-label={`${target.name} automation readiness`}>
              <div className="panel-heading">
                <ClipboardCheck size={17} />
                <h3>Automation Readiness</h3>
              </div>
              <div className="dispatch-signal-grid">
                <div>
                  <strong>{automationEvaluation.ready ? 'Documented' : 'Needs review'}</strong>
                  <span>
                    {automationEvaluation.completeChecklistItems}/
                    {automationEvaluation.totalChecklistItems} checklist items complete
                  </span>
                </div>
                <div>
                  <strong>{automationReadiness.requiredConfirmations.length}</strong>
                  <span>Required confirmations documented</span>
                </div>
                <div>
                  <strong>{formatDateTimeLabel(automationReadiness.lastReviewedAt)}</strong>
                  <span>Last automation readiness review</span>
                </div>
              </div>

              {automationEvaluation.blockers.length > 0 ? (
                <ul className="dispatch-list">
                  {automationEvaluation.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              ) : null}

              {automationEvaluation.warnings.length > 0 ? (
                <ul className="dispatch-list dispatch-warning-list">
                  {automationEvaluation.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}

              <div className="dispatch-checklist">
                {automationReadiness.checklistItems.map((item) => (
                  <label className="check-field" key={item.id}>
                    <input
                      type="checkbox"
                      checked={item.complete}
                      onChange={(event) =>
                        onAutomationReadinessChange(target.id, target.projectId, {
                          checklistItems: automationReadiness.checklistItems.map((candidate) =>
                            candidate.id === item.id
                              ? { ...candidate, complete: event.target.checked }
                              : candidate,
                          ),
                        })
                      }
                    />
                    <span>
                      {item.label}
                      {item.required ? ' (required)' : ''}
                    </span>
                  </label>
                ))}
              </div>

              <div className="field-grid">
                <label className="field field-full">
                  <span>Runbook notes</span>
                  <textarea
                    value={linesToText(automationReadiness.runbookNotes)}
                    rows={3}
                    onChange={(event) =>
                      onAutomationReadinessChange(target.id, target.projectId, {
                        runbookNotes: textToLines(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field field-full">
                  <span>Required confirmations</span>
                  <textarea
                    value={linesToText(automationReadiness.requiredConfirmations)}
                    rows={3}
                    onChange={(event) =>
                      onAutomationReadinessChange(target.id, target.projectId, {
                        requiredConfirmations: textToLines(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field field-full">
                  <span>Artifact expectations</span>
                  <textarea
                    value={linesToText(automationReadiness.artifactExpectations)}
                    rows={3}
                    onChange={(event) =>
                      onAutomationReadinessChange(target.id, target.projectId, {
                        artifactExpectations: textToLines(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field field-full">
                  <span>Backup requirements</span>
                  <textarea
                    value={linesToText(automationReadiness.backupRequirements)}
                    rows={3}
                    onChange={(event) =>
                      onAutomationReadinessChange(target.id, target.projectId, {
                        backupRequirements: textToLines(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field field-full">
                  <span>Rollback requirements</span>
                  <textarea
                    value={linesToText(automationReadiness.rollbackRequirements)}
                    rows={3}
                    onChange={(event) =>
                      onAutomationReadinessChange(target.id, target.projectId, {
                        rollbackRequirements: textToLines(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field field-full">
                  <span>Dry-run notes</span>
                  <textarea
                    value={linesToText(automationReadiness.dryRunNotes)}
                    rows={3}
                    onChange={(event) =>
                      onAutomationReadinessChange(target.id, target.projectId, {
                        dryRunNotes: textToLines(event.target.value),
                      })
                    }
                  />
                </label>
              </div>

              <div className="dispatch-preflight-actions">
                <button
                  type="button"
                  onClick={() =>
                    setDryRunPlans((current) => ({
                      ...current,
                      [target.id]: createDispatchAutomationDryRunPlan({
                        target,
                        readiness: automationReadiness,
                      }),
                    }))
                  }
                >
                  <ClipboardCheck size={15} />
                  Generate no-op dry-run plan
                </button>
                <span>Advisory only. No deployment command is executed.</span>
              </div>

              {dryRunPlan ? (
                <div className="dispatch-dry-run" aria-label={`${target.name} dry-run plan`}>
                  <div className="dispatch-signal-grid">
                    <div>
                      <strong>{dryRunPlan.status}</strong>
                      <span>{dryRunPlan.summary}</span>
                    </div>
                    <div>
                      <strong>{formatDateTimeLabel(dryRunPlan.generatedAt)}</strong>
                      <span>{dryRunPlan.steps.length} no-op phases planned</span>
                    </div>
                  </div>
                  <ol className="resource-list">
                    {dryRunPlan.steps.map((step) => (
                      <li key={step.phase}>
                        <div className="resource-icon" aria-hidden="true">
                          <ClipboardCheck size={15} />
                        </div>
                        <div>
                          <div className="resource-line">
                            <strong>{step.phase}</strong>
                            <span className={`resource-pill state-${step.status}`}>
                              {step.status}
                            </span>
                          </div>
                          <p>{step.message}</p>
                          <div className="resource-meta">
                            <span>
                              {step.requiresConfirmation
                                ? 'confirmation required'
                                : 'no confirmation flag'}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>

            <div className="dispatch-automation" aria-label={`${target.name} write automation gate`}>
              <div className="panel-heading">
                <Shield size={17} />
                <h3>Write Automation Locked</h3>
              </div>
              <div className="dispatch-signal-grid">
                <div>
                  <strong>{writeGateEvaluation.status}</strong>
                  <span>{writeGateEvaluation.summary}</span>
                </div>
                <div>
                  <strong>
                    {writeGateEvaluation.gates.filter((gate) => gate.satisfied).length}/
                    {writeGateEvaluation.gates.length}
                  </strong>
                  <span>Future gates with evidence</span>
                </div>
                <div>
                  <strong>
                    {canExecuteWriteAutomation(writeGateEvaluation) ? 'Unlocked' : 'Locked'}
                  </strong>
                  <span>No execution action is available</span>
                </div>
              </div>
              <ul className="dispatch-list dispatch-warning-list">
                {writeGateEvaluation.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
              <ol className="resource-list">
                {writeGateEvaluation.gates.map((gate) => (
                  <li key={gate.id}>
                    <div className="resource-icon" aria-hidden="true">
                      {gate.satisfied ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                    </div>
                    <div>
                      <div className="resource-line">
                        <strong>{gate.label}</strong>
                        <span
                          className={`resource-pill ${
                            gate.satisfied ? 'state-passing' : 'state-warning'
                          }`}
                        >
                          {gate.satisfied ? 'evidence' : 'needed'}
                        </span>
                      </div>
                      <p>{gate.evidence}</p>
                      <div className="resource-meta">
                        <span>{gate.required ? 'required gate' : 'optional gate'}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="dispatch-history">
              <div className="panel-heading">
                <History size={17} />
                <h3>Deployment History</h3>
              </div>
              {deploymentRecords.length === 0 ? (
                <p className="empty-state">No deployment records captured yet.</p>
              ) : (
                <ol className="resource-list">
                  {deploymentRecords.map((deployment) => (
                    <li key={deployment.id}>
                      <div className="resource-icon" aria-hidden="true">
                        <Rocket size={15} />
                      </div>
                      <div>
                        <div className="resource-line">
                          <strong>{deployment.versionLabel}</strong>
                          <span className={`resource-pill state-${deployment.status}`}>
                            {formatDeploymentStatus(deployment.status)}
                          </span>
                        </div>
                        <p>{deployment.summary}</p>
                        <div className="resource-meta">
                          <span>{formatDateTimeLabel(deployment.completedAt)}</span>
                          <span>{deployment.deployedBy}</span>
                          <span>{deployment.rollbackRef ? 'rollback available' : 'no rollback ref'}</span>
                          <span>
                            {deployment.databaseBackupRef ? 'backup recorded' : 'no backup ref'}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="dispatch-safety">
              <Shield size={17} />
              <p>
                Dispatch runner phases are stubs. No production files, databases, SSH/SFTP, cPanel,
                GoDaddy, rollback, or deploy command is executed from this UI.
              </p>
            </div>
            <div className="dispatch-safety">
              <ClipboardCheck size={17} />
              <p>
                Future destructive operations require typed human confirmation and verified backups
                before any production file or database overwrite.
              </p>
            </div>
          </section>
        )
      })}
    </div>
  )
}
