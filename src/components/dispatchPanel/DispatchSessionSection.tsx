import { useDispatchTargetContext } from './useDispatchTargetContext'
import { ClipboardCheck, ListChecks, Rocket, Shield } from 'lucide-react'
import { formatDateTimeLabel } from '../../domain/atlas'
import { DEPLOYMENT_STATUSES, formatDeploymentStatus } from '../../domain/dispatch'
import { DEPLOY_SESSION_CHECKLIST_PRESETS, MANUAL_DEPLOYMENT_RECORD_CONFIRMATION } from '../../services/deploySessions'
import { DEPLOY_SESSION_STEP_STATUSES, evidenceLinkDetail } from '../DispatchPanelParts.helpers'
import type { DispatchDeploySessionStep, DeploymentStatus } from '../../domain/dispatch'

export function DispatchSessionSection() {
  const {
    target,
    closeout,
    latestHostEvidence,
    latestVerificationEvidence,
    targetDeploySessions,
    activeDeploySession,
    sessionMessage,
    deploymentRecordConfirmations,
    setDeploymentRecordConfirmations,
    setDeploySessionMessages,
    onDeploySessionChange,
    onDeploySessionStepChange,
    onRecordManualDeployment,
    onAttachDeploySessionEvidence,
    onApplyDeploySessionPreset
  } = useDispatchTargetContext()

  return (
    <>
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
                      <ListChecks size={17} />
                      <h4>Checklist Presets</h4>
                    </div>
                    <p>
                      Presets are explicit human shortcuts for session notes and step statuses. They
                      never run upload or deployment commands.
                    </p>
                    <div className="dispatch-preflight-actions">
                      {DEPLOY_SESSION_CHECKLIST_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            onApplyDeploySessionPreset(activeDeploySession.id, preset.id)
                            setDeploySessionMessages((current) => ({
                              ...current,
                              [activeDeploySession.id]: `${preset.label} applied.`,
                            }))
                          }}
                        >
                          <ClipboardCheck size={15} />
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <ul className="dispatch-list">
                      {DEPLOY_SESSION_CHECKLIST_PRESETS.map((preset) => (
                        <li key={preset.id}>{preset.detail}</li>
                      ))}
                    </ul>
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
                      <button
                        type="button"
                        onClick={() => {
                          onAttachDeploySessionEvidence(
                            activeDeploySession.id,
                            'post-deploy-wrap-up',
                            `Closeout review summary: ${closeout.label}`,
                            closeout.detail,
                          )
                          setDeploySessionMessages((current) => ({
                            ...current,
                            [activeDeploySession.id]: 'Closeout review summary added to session.',
                          }))
                        }}
                      >
                        <ClipboardCheck size={15} />
                        Add closeout summary to session
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
    </>
  )
}
