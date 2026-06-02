import { useDispatchTargetContext } from './useDispatchTargetContext'
import { AlertTriangle, CheckCircle2, ClipboardCheck, RefreshCw, Rocket } from 'lucide-react'
import { formatDateTimeLabel } from '../../domain/atlas'
import { inspectDeploymentArtifact, runDeploymentVerificationChecks } from '../../services/deployPreflight'
import { createVerificationEvidenceRun } from '../../services/dispatchEvidence'
import { EvidenceComparisonSummary } from '../DispatchPanelParts'
import { linesToText, textToLines } from '../DispatchPanelParts.helpers'
import type { DeploymentArtifact, DeploymentVerificationCheck } from '../../domain/dispatch'

export function DispatchRunbookSection() {
  const {
    target,
    runbook,
    latestVerificationEvidence,
    verificationEvidenceComparison,
    visibleVerificationEvidenceRuns,
    targetVerificationEvidence,
    artifactMessages,
    setArtifactMessages,
    setVerificationEvidence,
    verificationRunningTargetId,
    setVerificationRunningTargetId,
    onDeploymentArtifactChange,
    onDeploymentPreservePathChange,
    onDeploymentVerificationCheckChange,
    onStartDeploySession,
    onVerificationEvidenceRunAdd,
    statusesToText,
    textToStatuses
  } = useDispatchTargetContext()

  return (
    <>
            <div className="dispatch-runbook" aria-label={`${target.name} deploy runbook`}>
              <div className="panel-heading">
                <ClipboardCheck size={17} />
                <h3>Deploy Runbook</h3>
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
                            <div className="field-grid">
                              <label className="field">
                                <span>Filename</span>
                                <input
                                  value={artifact.filename}
                                  onChange={(event) =>
                                    onDeploymentArtifactChange(runbook.id, artifact.id, {
                                      filename: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label className="field">
                                <span>Role</span>
                                <select
                                  value={artifact.role}
                                  onChange={(event) =>
                                    onDeploymentArtifactChange(runbook.id, artifact.id, {
                                      role: event.target.value as DeploymentArtifact['role'],
                                    })
                                  }
                                >
                                  <option value="frontend">frontend</option>
                                  <option value="backend">backend</option>
                                  <option value="placeholder">holding page</option>
                                </select>
                              </label>
                              <label className="field">
                                <span>Source repo</span>
                                <input
                                  value={artifact.sourceRepo}
                                  onChange={(event) =>
                                    onDeploymentArtifactChange(runbook.id, artifact.id, {
                                      sourceRepo: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label className="field">
                                <span>Target path</span>
                                <input
                                  value={artifact.targetPath}
                                  onChange={(event) =>
                                    onDeploymentArtifactChange(runbook.id, artifact.id, {
                                      targetPath: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label className="field checkbox-field">
                                <input
                                  type="checkbox"
                                  checked={artifact.required}
                                  onChange={(event) =>
                                    onDeploymentArtifactChange(runbook.id, artifact.id, {
                                      required: event.target.checked,
                                    })
                                  }
                                />
                                <span>Required</span>
                              </label>
                              <label className="field checkbox-field">
                                <input
                                  type="checkbox"
                                  checked={artifact.onlyWhenFullAppReady}
                                  onChange={(event) =>
                                    onDeploymentArtifactChange(runbook.id, artifact.id, {
                                      onlyWhenFullAppReady: event.target.checked,
                                    })
                                  }
                                />
                                <span>Full app only</span>
                              </label>
                              <label className="field field-full">
                                <span>Artifact notes</span>
                                <textarea
                                  rows={2}
                                  value={linesToText(artifact.notes)}
                                  onChange={(event) =>
                                    onDeploymentArtifactChange(runbook.id, artifact.id, {
                                      notes: textToLines(event.target.value),
                                    })
                                  }
                                />
                              </label>
                            </div>
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
                              <div className="field-grid">
                                <label className="field">
                                  <span>Path</span>
                                  <input
                                    value={path.path}
                                    onChange={(event) =>
                                      onDeploymentPreservePathChange(runbook.id, path.id, {
                                        path: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <label className="field">
                                  <span>Reason</span>
                                  <input
                                    value={path.reason}
                                    onChange={(event) =>
                                      onDeploymentPreservePathChange(runbook.id, path.id, {
                                        reason: event.target.value,
                                      })
                                    }
                                  />
                                </label>
                                <label className="field checkbox-field">
                                  <input
                                    type="checkbox"
                                    checked={path.required}
                                    onChange={(event) =>
                                      onDeploymentPreservePathChange(runbook.id, path.id, {
                                        required: event.target.checked,
                                      })
                                    }
                                  />
                                  <span>Required</span>
                                </label>
                                <label className="field checkbox-field">
                                  <input
                                    type="checkbox"
                                    checked={path.temporary}
                                    onChange={(event) =>
                                      onDeploymentPreservePathChange(runbook.id, path.id, {
                                        temporary: event.target.checked,
                                      })
                                    }
                                  />
                                  <span>Temporary</span>
                                </label>
                                <label className="field field-full">
                                  <span>Path notes</span>
                                  <textarea
                                    rows={2}
                                    value={linesToText(path.notes)}
                                    onChange={(event) =>
                                      onDeploymentPreservePathChange(runbook.id, path.id, {
                                        notes: textToLines(event.target.value),
                                      })
                                    }
                                  />
                                </label>
                              </div>
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
                            <div className="field-grid">
                              <label className="field">
                                <span>Label</span>
                                <input
                                  value={check.label}
                                  onChange={(event) =>
                                    onDeploymentVerificationCheckChange(runbook.id, check.id, {
                                      label: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label className="field">
                                <span>Method</span>
                                <select
                                  value={check.method}
                                  onChange={(event) =>
                                    onDeploymentVerificationCheckChange(runbook.id, check.id, {
                                      method: event.target
                                        .value as DeploymentVerificationCheck['method'],
                                    })
                                  }
                                >
                                  <option value="HEAD">HEAD</option>
                                  <option value="GET">GET</option>
                                </select>
                              </label>
                              <label className="field">
                                <span>URL path</span>
                                <input
                                  value={check.urlPath}
                                  onChange={(event) =>
                                    onDeploymentVerificationCheckChange(runbook.id, check.id, {
                                      urlPath: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label className="field">
                                <span>Expected statuses</span>
                                <input
                                  value={statusesToText(check.expectedStatuses)}
                                  onChange={(event) =>
                                    onDeploymentVerificationCheckChange(runbook.id, check.id, {
                                      expectedStatuses: textToStatuses(event.target.value),
                                    })
                                  }
                                />
                              </label>
                              <label className="field checkbox-field">
                                <input
                                  type="checkbox"
                                  checked={check.protectedResource}
                                  onChange={(event) =>
                                    onDeploymentVerificationCheckChange(runbook.id, check.id, {
                                      protectedResource: event.target.checked,
                                    })
                                  }
                                />
                                <span>Protected resource</span>
                              </label>
                              <label className="field field-full">
                                <span>Check notes</span>
                                <textarea
                                  rows={2}
                                  value={linesToText(check.notes)}
                                  onChange={(event) =>
                                    onDeploymentVerificationCheckChange(runbook.id, check.id, {
                                      notes: textToLines(event.target.value),
                                    })
                                  }
                                />
                              </label>
                            </div>
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
                          <EvidenceComparisonSummary
                            label="Runbook verification"
                            comparison={verificationEvidenceComparison}
                          />
                          <ol>
                            {visibleVerificationEvidenceRuns.map((run) => (
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
    </>
  )
}
