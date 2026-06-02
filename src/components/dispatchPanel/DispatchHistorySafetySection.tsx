import { useDispatchTargetContext } from './useDispatchTargetContext'
import { ClipboardCheck, History, Rocket, Shield } from 'lucide-react'
import { formatDateTimeLabel } from '../../domain/atlas'
import { formatDeploymentStatus } from '../../domain/dispatch'

export function DispatchHistorySafetySection() {
  const {
    deploymentRecords
  } = useDispatchTargetContext()

  return (
    <>
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
                Dispatch runner phases are advisory simulations. No production files, databases,
                SSH/SFTP, cPanel, GoDaddy, rollback, or deploy command is executed from this UI.
              </p>
            </div>
            <div className="dispatch-safety">
              <ClipboardCheck size={17} />
              <p>
                Future destructive operations require typed human confirmation and verified backups
                before any production file or database overwrite.
              </p>
            </div>
    </>
  )
}
