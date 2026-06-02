import { useDispatchTargetContext } from './useDispatchTargetContext'
import { formatDateLabel, formatDateTimeLabel } from '../../domain/atlas'
import { formatDeploymentStatus, formatPreflightStatus } from '../../domain/dispatch'
import { EvidenceHistoryDisplayControl } from '../DispatchPanelParts'
import { backupLabel } from '../DispatchPanelParts.helpers'

export function DispatchSummarySection() {
  const {
    target,
    readiness,
    latestDeployment,
    latestPreflight,
    recoveryEvaluation,
    latestVerificationEvidence,
    activeDeploySession,
    health,
    hostEvidenceStatus,
    evidenceHistoryLimit,
    setEvidenceHistoryLimit
  } = useDispatchTargetContext()

  return (
    <>
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
                  <span>Recovery</span>
                  <strong>{recoveryEvaluation.label}</strong>
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

            <EvidenceHistoryDisplayControl
              targetName={target.name}
              limit={evidenceHistoryLimit}
              onLimitChange={setEvidenceHistoryLimit}
            />
    </>
  )
}
