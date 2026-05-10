import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  History,
  ListChecks,
  RefreshCw,
  Rocket,
  Shield,
} from 'lucide-react'
import type { ProjectRecord } from '../domain/atlas'
import { formatDateLabel, formatDateTimeLabel } from '../domain/atlas'
import {
  formatDeploymentStatus,
  formatPreflightStatus,
  getHealthCheckSummary,
  getLatestDeploymentRecord,
  getLatestPreflightRun,
  getTargetPreflightRuns,
  getTargetRecords,
  type DeploymentTarget,
  type DispatchReadiness,
  type DispatchState,
} from '../domain/dispatch'
import { evaluateDispatchReadiness } from '../services/dispatchReadiness'

interface DispatchPanelProps {
  record: ProjectRecord
  dispatch: DispatchState
  onTargetChange: (targetId: string, update: Partial<DeploymentTarget>) => void
  onReadinessChange: (
    targetId: string,
    projectId: string,
    update: Partial<DispatchReadiness>,
  ) => void
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

export function DispatchPanel({
  record,
  dispatch,
  onTargetChange,
  onReadinessChange,
  onRunPreflight,
  preflightRunningTargetId,
}: DispatchPanelProps) {
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
        const preflightRuns = getTargetPreflightRuns(dispatch, target.id)
        const preflightRunning = preflightRunningTargetId === target.id
        const health = getHealthCheckSummary(latestDeployment?.healthCheckResults)
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
              </div>
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
