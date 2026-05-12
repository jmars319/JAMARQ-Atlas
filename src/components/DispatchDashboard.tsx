import { DatabaseBackup, ExternalLink, Rocket, ShieldAlert } from 'lucide-react'
import type { ProjectRecord } from '../domain/atlas'
import { formatDateLabel, formatDateTimeLabel } from '../domain/atlas'
import {
  findReadiness,
  formatDeploymentStatus,
  formatPreflightStatus,
  getHealthCheckSummary,
  getLatestDeploymentRecord,
  getLatestPreflightRun,
  getRunbookForTarget,
  type DispatchState,
} from '../domain/dispatch'
import {
  evaluateAutomationReadiness,
  findAutomationReadiness,
} from '../services/dispatchAutomation'
import { evaluateDispatchReadiness } from '../services/dispatchReadiness'

interface DispatchDashboardProps {
  dispatch: DispatchState
  projectRecords: ProjectRecord[]
  selectedProjectId: string
  onSelectProject: (projectId: string) => void
}

function projectName(projectRecords: ProjectRecord[], projectId: string) {
  return projectRecords.find((record) => record.project.id === projectId)?.project.name ?? projectId
}

export function DispatchDashboard({
  dispatch,
  projectRecords,
  selectedProjectId,
  onSelectProject,
}: DispatchDashboardProps) {
  const configuredTargets = dispatch.targets.length
  const blockedTargets = dispatch.targets.filter((target) => {
    const readiness = findReadiness(dispatch, target.projectId, target.id)
    const latest = getLatestDeploymentRecord(dispatch, target.id)
    return evaluateDispatchReadiness({ target, readiness, latestRecord: latest }).blocked
  }).length
  const backupRequired = dispatch.targets.filter((target) => target.backupRequired).length

  return (
    <section className="dispatch-dashboard" aria-labelledby="dispatch-title">
      <div className="dashboard-header">
        <div>
          <p className="section-label">Atlas Dispatch</p>
          <h1 id="dispatch-title">Deployment Readiness</h1>
          <p>
            Dispatch tracks target environments, health checks, rollback posture, and backup
            readiness. Humans decide what ships.
          </p>
        </div>
        <div className="dashboard-stats" aria-label="Dispatch status counts">
          <div>
            <Rocket size={16} />
            <strong>{configuredTargets}</strong>
            <span>Targets</span>
          </div>
          <div>
            <ShieldAlert size={16} />
            <strong>{blockedTargets}</strong>
            <span>Blocked</span>
          </div>
          <div>
            <DatabaseBackup size={16} />
            <strong>{backupRequired}</strong>
            <span>Backups</span>
          </div>
        </div>
      </div>

      <div className="dispatch-card-grid">
        {dispatch.targets.map((target) => {
          const readiness = findReadiness(dispatch, target.projectId, target.id)
          const latestDeployment = getLatestDeploymentRecord(dispatch, target.id)
          const latestPreflight = getLatestPreflightRun(dispatch, target.id)
          const runbook = getRunbookForTarget(dispatch, target.id)
          const automationReadiness = findAutomationReadiness(
            dispatch.automationReadiness,
            target,
          )
          const automationEvaluation = evaluateAutomationReadiness(target, automationReadiness)
          const health = getHealthCheckSummary(latestDeployment?.healthCheckResults)
          const evaluation = evaluateDispatchReadiness({
            target,
            readiness,
            latestRecord: latestDeployment,
          })

          return (
            <button
              type="button"
              className={`dispatch-card ${
                selectedProjectId === target.projectId ? 'is-selected' : ''
              }`}
              key={target.id}
              onClick={() => onSelectProject(target.projectId)}
            >
              <div className="dispatch-summary-heading">
                <div>
                  <span className="card-context">{projectName(projectRecords, target.projectId)}</span>
                  <strong>{target.name}</strong>
                </div>
                <span className={`dispatch-status dispatch-${target.status}`}>
                  {formatDeploymentStatus(target.status)}
                </span>
              </div>
              <div className="dispatch-mini-grid">
                <div>
                  <span>Environment</span>
                  <strong>{target.environment}</strong>
                </div>
                <div>
                  <span>Host</span>
                  <strong>{target.hostType}</strong>
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
                  <span>Backup</span>
                  <strong>
                    {target.backupRequired ? (readiness?.backupReady ? 'Ready' : 'Required') : 'No'}
                  </strong>
                </div>
                <div>
                  <span>Preflight</span>
                  <strong>
                    {latestPreflight ? formatPreflightStatus(latestPreflight.status) : 'Not run'}
                  </strong>
                </div>
                <div>
                  <span>Runbook</span>
                  <strong>{runbook ? `#${runbook.deployOrder}` : 'None'}</strong>
                </div>
                <div>
                  <span>Automation</span>
                  <strong>
                    {automationEvaluation.completeChecklistItems}/
                    {automationEvaluation.totalChecklistItems}
                  </strong>
                </div>
              </div>
              <p>{target.publicUrl || 'No public URL configured.'}</p>
              <div className="card-footer">
                <span>{evaluation.ready ? 'Readiness clear' : 'Readiness review'}</span>
                <span>{evaluation.blockers.length} blockers</span>
                <span>{evaluation.warnings.length} warnings</span>
              </div>
              <div className="card-footer">
                <span>
                  Preflight:{' '}
                  {latestPreflight ? formatDateTimeLabel(latestPreflight.completedAt) : 'not run'}
                </span>
                <span>
                  Automation:{' '}
                  {automationEvaluation.ready
                    ? 'readiness documented'
                    : `${automationEvaluation.blockers.length} blockers`}
                </span>
              </div>
              {target.publicUrl ? (
                <span className="dispatch-url">
                  <ExternalLink size={13} />
                  {target.publicUrl}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </section>
  )
}
