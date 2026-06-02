import { useDispatchTargetContext } from './useDispatchTargetContext'
import { GitBranch, Shield } from 'lucide-react'
import { formatDateTimeLabel } from '../../domain/atlas'
import { LocalGitStatusInline } from '../LocalGitStatus'
import { linesToText, textToLines } from '../DispatchPanelParts.helpers'

export function DispatchRecoverySection() {
  const {
    target,
    recoveryPlan,
    recoveryEvaluation,
    advisoryRepository,
    onRecoveryPlanChange,
    dateInputValue,
    reviewedDateValue
  } = useDispatchTargetContext()

  return (
    <>
            <div className="dispatch-preflight" aria-label={`${target.name} recovery readiness`}>
              <div className="panel-heading">
                <Shield size={17} />
                <h3>Recovery Readiness</h3>
              </div>
              <div className="dispatch-signal-grid">
                <div>
                  <strong>{recoveryEvaluation.label}</strong>
                  <span>{recoveryEvaluation.detail}</span>
                </div>
                <div>
                  <strong>{formatDateTimeLabel(recoveryEvaluation.reviewedAt || null)}</strong>
                  <span>Last reviewed</span>
                </div>
                <div>
                  <strong>{recoveryEvaluation.missingFields.length}</strong>
                  <span>Missing fields</span>
                </div>
              </div>
              <div className="field-grid">
                <label className="field">
                  <span>Backup cadence</span>
                  <input
                    value={recoveryPlan?.backupCadence ?? ''}
                    onChange={(event) =>
                      onRecoveryPlanChange(target.id, { backupCadence: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Backup location ref</span>
                  <input
                    value={recoveryPlan?.backupLocationRef ?? ''}
                    onChange={(event) =>
                      onRecoveryPlanChange(target.id, { backupLocationRef: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Rollback reference</span>
                  <input
                    value={recoveryPlan?.rollbackReference ?? ''}
                    onChange={(event) =>
                      onRecoveryPlanChange(target.id, { rollbackReference: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Maintenance window</span>
                  <input
                    value={recoveryPlan?.maintenanceWindow ?? ''}
                    onChange={(event) =>
                      onRecoveryPlanChange(target.id, { maintenanceWindow: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Escalation contact ref</span>
                  <input
                    value={recoveryPlan?.escalationContactRef ?? ''}
                    onChange={(event) =>
                      onRecoveryPlanChange(target.id, { escalationContactRef: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Last reviewed</span>
                  <input
                    type="date"
                    value={dateInputValue(recoveryPlan?.lastReviewedAt ?? '')}
                    onChange={(event) =>
                      onRecoveryPlanChange(target.id, {
                        lastReviewedAt: reviewedDateValue(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field field-full">
                  <span>Rollback steps</span>
                  <textarea
                    rows={3}
                    value={linesToText(recoveryPlan?.rollbackSteps ?? [])}
                    onChange={(event) =>
                      onRecoveryPlanChange(target.id, {
                        rollbackSteps: textToLines(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field field-full">
                  <span>Recovery notes</span>
                  <textarea
                    rows={3}
                    value={linesToText(recoveryPlan?.notes ?? [])}
                    onChange={(event) =>
                      onRecoveryPlanChange(target.id, { notes: textToLines(event.target.value) })
                    }
                  />
                </label>
              </div>
            </div>

            {advisoryRepository ? (
              <div
                className="dispatch-preflight"
                aria-label={`${target.name} local git advisory`}
              >
                <div className="panel-heading">
                  <GitBranch size={17} />
                  <h3>Local Git Advisory</h3>
                </div>
                <LocalGitStatusInline
                  owner={advisoryRepository.owner}
                  repo={advisoryRepository.name}
                />
                <p className="dispatch-muted-note">
                  This signal is read-only and advisory. It does not update readiness, start builds,
                  pull, push, commit, stash, reset, or deploy.
                </p>
              </div>
            ) : null}
    </>
  )
}
