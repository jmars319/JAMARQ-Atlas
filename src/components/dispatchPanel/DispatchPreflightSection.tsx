import { useDispatchTargetContext } from './useDispatchTargetContext'
import { AlertTriangle, CheckCircle2, ListChecks, RefreshCw } from 'lucide-react'
import { formatDateTimeLabel } from '../../domain/atlas'
import { formatPreflightStatus } from '../../domain/dispatch'

export function DispatchPreflightSection() {
  const {
    target,
    latestPreflight,
    visiblePreflightRuns,
    preflightRunning,
    onRunPreflight
  } = useDispatchTargetContext()

  return (
    <>
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
                      {visiblePreflightRuns.map((run) => (
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
    </>
  )
}
