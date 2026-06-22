import {
  ClipboardCheck,
  DatabaseBackup,
  ExternalLink,
  RefreshCw,
  Rocket,
  Server,
  ShieldAlert,
} from 'lucide-react'
import { useMemo } from 'react'
import type { ProjectRecord } from '../domain/atlas'
import { formatDateLabel, formatDateTimeLabel } from '../domain/atlas'
import {
  findReadiness,
  formatDeploymentStatus,
  formatPreflightStatus,
  getHealthCheckSummary,
  getActiveDeploySession,
  getLatestHostEvidenceRun,
  getLatestDeploymentRecord,
  getLatestPreflightRun,
  getRecoveryPlanForTarget,
  getLatestVerificationEvidenceRun,
  getRunbookForTarget,
  getTargetDeploySessions,
  getTargetHostEvidenceRuns,
  getTargetVerificationEvidenceRuns,
  type DispatchState,
} from '../domain/dispatch'
import {
  evaluateAutomationReadiness,
  findAutomationReadiness,
} from '../services/dispatchAutomation'
import { evaluateDispatchReadiness } from '../services/dispatchReadiness'
import { deriveDispatchQueueItems } from '../services/dispatchQueue'
import { DispatchQueueCommandCenter } from './DispatchQueueCommandCenter'
import type { DeploymentArtifact } from '../domain/dispatch'
import type { ReportsState } from '../domain/reports'
import {
  closeoutStateLabels,
  deriveDispatchCloseoutFocusGroups,
  deriveDispatchCloseoutSummaries,
} from '../services/dispatchCloseout'
import {
  compareHostEvidenceRuns,
  compareVerificationEvidenceRuns,
} from '../services/dispatchEvidence'
import { evaluateRecoveryPlanReadiness } from '../services/dispatchRecovery'
import { useVercelCommandSummaries } from '../hooks/useVercelCommandSummaries'
import {
  deriveVercelReadinessSignals,
  vercelDeploymentLabel,
} from '../services/vercelIntegration'

interface DispatchDashboardProps {
  dispatch: DispatchState
  reports: ReportsState
  projectRecords: ProjectRecord[]
  selectedProjectId: string
  onSelectProject: (projectId: string) => void
  onStartDeploySession: (runbookId: string) => void
  onDeploymentArtifactChange: (
    runbookId: string,
    artifactId: string,
    update: Partial<DeploymentArtifact>,
  ) => void
  onRunDispatchPreflight: (targetId: string) => Promise<void>
  preflightRunningTargetId: string
  onRunHostInspection: (targetId: string) => Promise<void>
  onRunHostInspections: (targetIds: string[]) => Promise<void>
  hostInspectionRunningTargetIds: string[]
  onRunVerificationChecks: (targetId: string) => Promise<void>
  verificationRunningTargetIds: string[]
  onRunQueueEvidenceSweep: (targetIds: string[]) => Promise<void>
  queueEvidenceSweepRunning: boolean
  onCreateReadinessReport: (projectId: string) => void
}

/* Project label boundary */ function projectName(projectRecords: ProjectRecord[], projectId: string) {
  return projectRecords.find((record) => record.project.id === projectId)?.project.name ?? projectId
}

/* Dispatch command surface */ export function DispatchDashboard({
  dispatch,
  reports,
  projectRecords,
  selectedProjectId,
  onSelectProject,
  onStartDeploySession,
  onDeploymentArtifactChange,
  onRunDispatchPreflight,
  preflightRunningTargetId,
  onRunHostInspection,
  onRunHostInspections,
  hostInspectionRunningTargetIds,
  onRunVerificationChecks,
  verificationRunningTargetIds,
  onRunQueueEvidenceSweep,
  queueEvidenceSweepRunning,
  onCreateReadinessReport,
}: DispatchDashboardProps) {
  const configuredTargets = dispatch.targets.length
  const queueItems = useMemo(
    () => deriveDispatchQueueItems({ dispatch, projectRecords, reports }),
    [dispatch, projectRecords, reports],
  )
  const closeoutSummaries = useMemo(
    () => deriveDispatchCloseoutSummaries({ dispatch, reports }),
    [dispatch, reports],
  )
  const closeoutFocusGroups = useMemo(
    () => deriveDispatchCloseoutFocusGroups(closeoutSummaries),
    [closeoutSummaries],
  )
  const hostInspectableTargets = dispatch.targets.filter((target) =>
    ['cpanel', 'godaddy-cpanel'].includes(target.hostType),
  )
  const vercelTargets = dispatch.targets.filter((target) => target.hostType === 'vercel')
  const vercelSummaries = useVercelCommandSummaries(vercelTargets.map((target) => target.id))
  const targetById = useMemo(
    () => new Map(dispatch.targets.map((target) => [target.id, target])),
    [dispatch.targets],
  )
  const vercelSignalCount = vercelSummaries.data.reduce(
    (total, summary) => {
      const target = targetById.get(summary.targetId)
      const repositoryKeys =
        projectRecords
          .find((record) => record.project.id === target?.projectId)
          ?.project.repositories.map((repository) => `${repository.owner}/${repository.name}`) ??
        []

      return (
        total +
        deriveVercelReadinessSignals({ summary, target, repositoryKeys }).filter((signal) =>
          ['warning', 'danger'].includes(signal.severity),
        ).length
      )
    },
    0,
  )
  const hostInspectionRunning = hostInspectionRunningTargetIds.length > 0
  const blockedTargets = dispatch.targets.filter((target) => {
    const readiness = findReadiness(dispatch, target.projectId, target.id)
    const latest = getLatestDeploymentRecord(dispatch, target.id)
    return evaluateDispatchReadiness({ target, readiness, latestRecord: latest }).blocked
  }).length
  const backupRequired = dispatch.targets.filter((target) => target.backupRequired).length
  const currentRecoveryPlans = dispatch.targets.filter(
    (target) =>
      evaluateRecoveryPlanReadiness({
        target,
        plan: getRecoveryPlanForTarget(dispatch, target.id),
      }).status === 'current',
  ).length
  const activeSessions = dispatch.deploySessions.filter((session) =>
    ['active', 'blocked', 'completed'].includes(session.status),
  )
  const recentSessions = dispatch.deploySessions
    .slice()
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 5)
  const queueCloseouts = queueItems.map((item) => item.closeout)
  const closeoutReadyCount = queueCloseouts.filter(
    (summary) => summary.state === 'closeout-ready',
  ).length
  const needsEvidenceCount = queueCloseouts.filter(
    (summary) => summary.state === 'needs-evidence',
  ).length
  const needsManualRecordCount = queueCloseouts.filter(
    (summary) => summary.state === 'needs-manual-record',
  ).length
  const needsFollowUpCount = queueCloseouts.filter(
    (summary) => summary.state === 'needs-follow-up',
  ).length

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
          <div>
            <ShieldAlert size={16} />
            <strong>{currentRecoveryPlans}</strong>
            <span>Recovery</span>
          </div>
          <div>
            <Rocket size={16} />
            <strong>{activeSessions.length}</strong>
            <span>Sessions</span>
          </div>
          <div>
            <ClipboardCheck size={16} />
            <strong>{closeoutReadyCount}</strong>
            <span>Closeout</span>
          </div>
          <div>
            <Rocket size={16} />
            <strong>{vercelSignalCount}</strong>
            <span>Vercel signals</span>
          </div>
        </div>
      </div>

      <section className="dispatch-preflight" aria-label="Dispatch closeout analytics">
        <div className="panel-heading">
          <ClipboardCheck size={17} />
          <h2>Closeout Analytics</h2>
        </div>
        <div className="dispatch-signal-grid">
          <div>
            <strong>{closeoutReadyCount}</strong>
            <span>{closeoutStateLabels['closeout-ready']}</span>
          </div>
          <div>
            <strong>{needsEvidenceCount}</strong>
            <span>{closeoutStateLabels['needs-evidence']}</span>
          </div>
          <div>
            <strong>{needsManualRecordCount}</strong>
            <span>{closeoutStateLabels['needs-manual-record']}</span>
          </div>
          <div>
            <strong>{needsFollowUpCount}</strong>
            <span>{closeoutStateLabels['needs-follow-up']}</span>
          </div>
        </div>
        <div className="dispatch-closeout-focus" aria-label="Dispatch closeout compact view">
          {closeoutFocusGroups.map((group) => (
            <article key={group.id} className="dispatch-closeout-focus-group">
              <div className="dispatch-summary-heading">
                <div>
                  <strong>{group.label}</strong>
                  <span>{group.detail}</span>
                </div>
                <span className="resource-pill state-warning">
                  {group.needsActionCount + group.warningCount} open
                </span>
              </div>
              <div className="dispatch-closeout-focus-counts">
                <span>
                  <strong>{group.readyCount}</strong>
                  Ready
                </span>
                <span>
                  <strong>{group.needsActionCount}</strong>
                  Missing
                </span>
                <span>
                  <strong>{group.warningCount}</strong>
                  Follow-up
                </span>
              </div>
              <ul className="dispatch-closeout-focus-list">
                {group.items.map((item) => {
                  const target = targetById.get(item.targetId)

                  return (
                    <li key={`${group.id}-${item.targetId}`}>
                      <span className={`resource-pill state-${item.status}`}>
                        {item.status}
                      </span>
                      <div>
                        <strong>{target?.name ?? item.targetId}</strong>
                        <span>
                          {target ? projectName(projectRecords, target.projectId) : item.projectId}
                        </span>
                        <p>{item.detail || closeoutStateLabels[item.state]}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </article>
          ))}
        </div>
        <p className="dispatch-muted-note">
          Derived from {closeoutSummaries.length} Dispatch target(s). Closeout analytics are
          advisory and do not change status, readiness, verification, or report state.
        </p>
      </section>

      <DispatchQueueCommandCenter
        items={queueItems}
        selectedProjectId={selectedProjectId}
        onSelectProject={onSelectProject}
        onStartDeploySession={onStartDeploySession}
        onDeploymentArtifactChange={onDeploymentArtifactChange}
        onRunDispatchPreflight={onRunDispatchPreflight}
        preflightRunningTargetId={preflightRunningTargetId}
        onRunHostInspection={onRunHostInspection}
        onRunVerificationChecks={onRunVerificationChecks}
        onRunEvidenceSweep={onRunQueueEvidenceSweep}
        hostInspectionRunningTargetIds={hostInspectionRunningTargetIds}
        verificationRunningTargetIds={verificationRunningTargetIds}
        evidenceSweepRunning={queueEvidenceSweepRunning}
        onCreateReadinessReport={onCreateReadinessReport}
      />

      <section className="dispatch-preflight" aria-label="Vercel deployment evidence">
        <div className="panel-heading settings-panel-heading-row">
          <div>
            <Rocket size={17} />
            <h2>Vercel Deployment Evidence</h2>
          </div>
          <button
            type="button"
            onClick={() => vercelSummaries.reload()}
            disabled={vercelSummaries.loading || vercelTargets.length === 0}
          >
            <RefreshCw size={15} />
            {vercelSummaries.loading ? 'Refreshing' : 'Refresh Vercel'}
          </button>
        </div>
        <div className="dispatch-signal-grid">
          <div>
            <strong>{vercelTargets.length}</strong>
            <span>Vercel targets</span>
          </div>
          <div>
            <strong>{vercelSummaries.data.filter((summary) => summary.binding.mapped).length}</strong>
            <span>Mapped</span>
          </div>
          <div>
            <strong>{vercelSummaries.data.filter((summary) => summary.latestProduction).length}</strong>
            <span>Production evidence</span>
          </div>
          <div>
            <strong>{vercelSignalCount}</strong>
            <span>Needs review</span>
          </div>
        </div>
        {vercelSummaries.error ? (
          <div className="github-error">
            <ShieldAlert size={16} />
            <div>
              <strong>{vercelSummaries.error.type}</strong>
              <span>{vercelSummaries.error.message}</span>
            </div>
          </div>
        ) : null}
        {vercelTargets.length === 0 ? (
          <p className="empty-state">No Vercel deployment targets are configured in Dispatch.</p>
        ) : null}
        <div className="dispatch-card-grid">
          {vercelTargets.map((target) => {
            const summary = vercelSummaries.data.find((candidate) => candidate.targetId === target.id)
            const repositoryKeys =
              projectRecords
                .find((record) => record.project.id === target.projectId)
                ?.project.repositories.map(
                  (repository) => `${repository.owner}/${repository.name}`,
                ) ?? []
            const signals = summary
              ? deriveVercelReadinessSignals({ summary, target, repositoryKeys })
              : []

            return (
              <article className="dispatch-card" key={target.id}>
                <div className="dispatch-summary-heading">
                  <div>
                    <span className="card-context">{projectName(projectRecords, target.projectId)}</span>
                    <strong>{target.name}</strong>
                  </div>
                  <span className={`resource-pill state-${summary?.state ?? 'unknown'}`}>
                    {summary?.state ?? 'unknown'}
                  </span>
                </div>
                <div className="dispatch-mini-grid">
                  <div>
                    <span>Vercel project</span>
                    <strong>{summary?.project?.name ?? summary?.projectIdOrName ?? 'Unmapped'}</strong>
                  </div>
                  <div>
                    <span>Production</span>
                    <strong>{vercelDeploymentLabel(summary?.latestProduction ?? null)}</strong>
                  </div>
                  <div>
                    <span>Preview</span>
                    <strong>{vercelDeploymentLabel(summary?.latestPreview ?? null)}</strong>
                  </div>
                  <div>
                    <span>Domains</span>
                    <strong>{summary?.domains.length ?? 0}</strong>
                  </div>
                </div>
                <p>{target.publicUrl || 'No public URL configured.'}</p>
                <div className="activity-meta">
                  <span>writeControlsEnabled: false</span>
                  <span>deploy/promote/rollback locked</span>
                  {summary?.fetchedAt ? <span>{formatDateTimeLabel(summary.fetchedAt)}</span> : null}
                </div>
                {signals.length > 0 ? (
                  <ul className="dispatch-list dispatch-warning-list">
                    {signals.slice(0, 4).map((signal) => (
                      <li key={signal.id}>
                        {signal.title}: {signal.detail}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dispatch-muted-note">
                    No Vercel evidence loaded yet. Refresh Vercel or configure target mapping.
                  </p>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className="dispatch-preflight" aria-label="Deploy session queue">
        <div className="panel-heading">
          <Rocket size={17} />
          <h2>Deploy Sessions</h2>
        </div>
        <div className="dispatch-signal-grid">
          <div>
            <strong>{activeSessions.length}</strong>
            <span>Active/manual sessions</span>
          </div>
          <div>
            <strong>{recentSessions.length}</strong>
            <span>Recent session entries</span>
          </div>
        </div>
        {recentSessions.length > 0 ? (
          <ol className="resource-list" aria-label="Deploy session history">
            {recentSessions.map((session) => (
              <li key={session.id}>
                <div className="resource-icon" aria-hidden="true">
                  <Rocket size={15} />
                </div>
                <div>
                  <div className="resource-line">
                    <strong>{session.siteName}</strong>
                    <span className={`resource-pill state-${session.status}`}>
                      {session.status}
                    </span>
                  </div>
                  <p>{session.summary}</p>
                  <div className="resource-meta">
                    <span>{formatDateTimeLabel(session.updatedAt)}</span>
                    <span>{session.recordedDeploymentRecordId ?? 'no deployment record'}</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="empty-state">
            No deploy sessions yet. Start one from a deployment runbook card.
          </p>
        )}
      </section>

      <section className="dispatch-preflight" aria-label="Host inspector queue">
        <div className="panel-heading">
          <Server size={17} />
          <h2>Host Inspector</h2>
        </div>
        <div className="dispatch-signal-grid">
          <div>
            <strong>{hostInspectableTargets.length}</strong>
            <span>Manual host targets in scope</span>
          </div>
          <div>
            <strong>{dispatch.hostEvidenceRuns.length}</strong>
            <span>Stored host evidence runs</span>
          </div>
        </div>
        <div className="dispatch-preflight-actions">
          <button
            type="button"
            disabled={hostInspectionRunning || hostInspectableTargets.length === 0}
            onClick={() => onRunHostInspections(hostInspectableTargets.map((target) => target.id))}
          >
            <RefreshCw size={15} />
            {hostInspectionRunning ? 'Inspecting hosts' : 'Run manual host inspections'}
          </button>
          <span>SFTP/local-mirror/TCP evidence only. No uploads, deletes, or writes.</span>
        </div>
      </section>

      <div className="dispatch-card-grid">
        {dispatch.targets.map((target) => {
          const readiness = findReadiness(dispatch, target.projectId, target.id)
          const latestDeployment = getLatestDeploymentRecord(dispatch, target.id)
          const latestPreflight = getLatestPreflightRun(dispatch, target.id)
          const runbook = getRunbookForTarget(dispatch, target.id)
          const recoveryEvaluation = evaluateRecoveryPlanReadiness({
            target,
            plan: getRecoveryPlanForTarget(dispatch, target.id),
          })
          const latestHostEvidence = getLatestHostEvidenceRun(dispatch, target.id)
          const hostEvidenceRuns = getTargetHostEvidenceRuns(dispatch, target.id)
          const hostEvidenceComparison = compareHostEvidenceRuns(
            latestHostEvidence,
            hostEvidenceRuns[1],
          )
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
          const activeSession = getActiveDeploySession(dispatch, target.id)
          const sessionCount = getTargetDeploySessions(dispatch, target.id).length
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
            <article
              className={`dispatch-card ${
                selectedProjectId === target.projectId ? 'is-selected' : ''
              }`}
              key={target.id}
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
                  <span>Recovery</span>
                  <strong>{recoveryEvaluation.status}</strong>
                </div>
                <div>
                  <span>Session</span>
                  <strong>{activeSession?.status ?? (sessionCount > 0 ? `${sessionCount} recent` : 'None')}</strong>
                </div>
                <div>
                  <span>Host evidence</span>
                  <strong>
                    {latestHostEvidence
                      ? `${latestHostEvidence.status} / ${latestHostEvidence.probeMode}`
                      : 'None'}
                  </strong>
                </div>
                <div>
                  <span>Verification evidence</span>
                  <strong>{latestVerificationEvidence?.status ?? 'None'}</strong>
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
                  Host:{' '}
                  {latestHostEvidence ? formatDateTimeLabel(latestHostEvidence.completedAt) : 'not run'}
                </span>
                <span>
                  Verify:{' '}
                  {latestVerificationEvidence
                    ? formatDateTimeLabel(latestVerificationEvidence.completedAt)
                    : 'not run'}
                </span>
              </div>
              <div className="card-footer">
                <span>Host compare: {hostEvidenceComparison.summary}</span>
                <span>Verify compare: {verificationEvidenceComparison.summary}</span>
              </div>
              <div className="card-footer">
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
              <div className="dispatch-card-actions">
                <button type="button" onClick={() => onSelectProject(target.projectId)}>
                  Open project
                </button>
                {runbook ? (
                  <button type="button" onClick={() => onStartDeploySession(runbook.id)}>
                    Start deploy session
                  </button>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
