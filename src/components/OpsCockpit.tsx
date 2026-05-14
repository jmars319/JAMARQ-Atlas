import {
  ArchiveRestore,
  ClipboardCheck,
  DatabaseZap,
  ListChecks,
  RefreshCw,
  Rocket,
  ShieldAlert,
} from 'lucide-react'
import { useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Workspace } from '../domain/atlas'
import { formatDateTimeLabel } from '../domain/atlas'
import type { AtlasCalibrationState } from '../domain/calibration'
import type { DataIntegrityDiagnostic } from '../domain/dataIntegrity'
import type { DispatchState } from '../domain/dispatch'
import type {
  OperationsAction,
  OperationsCockpitSummary,
  OperationsQueueItem,
} from '../domain/operations'
import type { ReportsState } from '../domain/reports'
import type { AtlasSyncState } from '../domain/sync'
import type { CalibrationIssue } from '../services/calibration'
import { createOperationsCockpitSummary } from '../services/operations'

interface OpsCockpitProps {
  workspace: Workspace
  dispatch: DispatchState
  reports: ReportsState
  sync: AtlasSyncState
  calibration: AtlasCalibrationState
  calibrationIssues: CalibrationIssue[]
  dataIntegrityDiagnostics: DataIntegrityDiagnostic[]
  onOpenProject: (projectId: string) => void
  onOpenDispatchTarget: (projectId: string, targetId: string) => void
  onOpenCalibration: () => void
  onOpenDataCenter: () => void
  onRunEvidenceSweep: (targetIds: string[]) => Promise<void>
  evidenceSweepRunning: boolean
  onStartManualDeploySession: (targetId: string) => void
  onCreatePlanningFollowUp: (projectId: string, detail: string) => void
  onCreateReportPacket: (projectId: string) => void
  onCreateSnapshot: () => void
}

function gradeLabel(summary: OperationsCockpitSummary) {
  if (summary.grade === 'blocked') {
    return 'Blocked'
  }

  if (summary.grade === 'attention') {
    return 'Needs attention'
  }

  return 'Ready'
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: ReactNode
  value: string | number
  label: string
}) {
  return (
    <div>
      {icon}
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  )
}

export function OpsCockpit({
  workspace,
  dispatch,
  reports,
  sync,
  calibration,
  calibrationIssues,
  dataIntegrityDiagnostics,
  onOpenProject,
  onOpenDispatchTarget,
  onOpenCalibration,
  onOpenDataCenter,
  onRunEvidenceSweep,
  evidenceSweepRunning,
  onStartManualDeploySession,
  onCreatePlanningFollowUp,
  onCreateReportPacket,
  onCreateSnapshot,
}: OpsCockpitProps) {
  const summary = useMemo(
    () =>
      createOperationsCockpitSummary({
        workspace,
        dispatch,
        reports,
        sync,
        calibration,
        calibrationIssues,
        dataIntegrityDiagnostics,
      }),
    [calibration, calibrationIssues, dataIntegrityDiagnostics, dispatch, reports, sync, workspace],
  )
  const queueTargetIds = summary.queue
    .map((item) => item.targetId)
    .filter((targetId): targetId is string => Boolean(targetId))
  const uniqueQueueTargetIds = [...new Set(queueTargetIds)]

  function runAction(action: OperationsAction, item: OperationsQueueItem) {
    if (action.id === 'open-project' && action.projectId) {
      onOpenProject(action.projectId)
      return
    }

    if (action.id === 'open-dispatch-target' && action.projectId && action.targetId) {
      onOpenDispatchTarget(action.projectId, action.targetId)
      return
    }

    if (action.id === 'open-calibration') {
      onOpenCalibration()
      return
    }

    if (action.id === 'open-data-center') {
      onOpenDataCenter()
      return
    }

    if (action.id === 'run-read-only-evidence-sweep' && action.targetId) {
      void onRunEvidenceSweep([action.targetId])
      return
    }

    if (action.id === 'start-manual-deploy-session' && action.targetId) {
      onStartManualDeploySession(action.targetId)
      return
    }

    if (action.id === 'create-planning-follow-up' && action.projectId) {
      onCreatePlanningFollowUp(action.projectId, `${item.label}: ${item.summary}`)
      return
    }

    if (action.id === 'create-report-packet' && action.projectId) {
      onCreateReportPacket(action.projectId)
      return
    }

    if (action.id === 'create-local-snapshot') {
      onCreateSnapshot()
    }
  }

  return (
    <section className="ops-cockpit" aria-labelledby="ops-cockpit-title">
      <div className="dashboard-header">
        <div>
          <p className="section-label">Daily operations</p>
          <h1 id="ops-cockpit-title">Ops Cockpit</h1>
          <p>
            {gradeLabel(summary)} as of {formatDateTimeLabel(summary.generatedAt)}.
          </p>
        </div>
        <div className="dashboard-stats" aria-label="Ops readiness counts">
          <Stat icon={<ShieldAlert size={16} />} value={summary.counts.blockedTargets} label="Blocked" />
          <Stat icon={<ListChecks size={16} />} value={summary.queue.length} label="Queue" />
          <Stat icon={<RefreshCw size={16} />} value={summary.counts.staleEvidence} label="Stale evidence" />
          <Stat icon={<ArchiveRestore size={16} />} value={summary.counts.recoveryGaps} label="Recovery gaps" />
          <Stat icon={<DatabaseZap size={16} />} value={summary.counts.missingSnapshots + summary.counts.staleSnapshots} label="Snapshot gaps" />
          <Stat icon={<ClipboardCheck size={16} />} value={summary.counts.closeoutGaps} label="Closeout gaps" />
        </div>
      </div>

      <section className="dispatch-preflight" aria-label="Ops global readiness">
        <div className="panel-heading">
          <ListChecks size={17} />
          <h2>Global Readiness</h2>
        </div>
        <div className="dispatch-signal-grid">
          <div>
            <strong>{summary.counts.projects}</strong>
            <span>Projects</span>
          </div>
          <div>
            <strong>{summary.counts.dispatchTargets}</strong>
            <span>Dispatch targets</span>
          </div>
          <div>
            <strong>{summary.counts.currentRecoveryPlans}</strong>
            <span>Current recovery plans</span>
          </div>
          <div>
            <strong>{summary.latestSnapshotAt ? formatDateTimeLabel(summary.latestSnapshotAt) : 'None'}</strong>
            <span>Latest snapshot</span>
          </div>
          <div>
            <strong>{summary.counts.dataIntegrityDanger}</strong>
            <span>Integrity danger</span>
          </div>
          <div>
            <strong>{summary.counts.calibrationBlocked}</strong>
            <span>Calibration blocked</span>
          </div>
        </div>
        <div className="dispatch-preflight-actions">
          <button
            type="button"
            disabled={evidenceSweepRunning || uniqueQueueTargetIds.length === 0}
            onClick={() => void onRunEvidenceSweep(uniqueQueueTargetIds)}
          >
            <RefreshCw size={15} />
            {evidenceSweepRunning ? 'Running sweep' : 'Run read-only evidence sweep'}
          </button>
          <button type="button" onClick={onCreateSnapshot}>
            <ArchiveRestore size={15} />
            Create local snapshot
          </button>
        </div>
        {summary.warnings.length > 0 ? (
          <ul className="dispatch-list">
            {summary.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="dispatch-preflight" aria-label="Ops daily queue">
        <div className="panel-heading">
          <Rocket size={17} />
          <h2>Daily Queue</h2>
        </div>
        {summary.queue.length === 0 ? (
          <p className="empty-state">No daily operations queue items are active.</p>
        ) : (
          <ol className="resource-list">
            {summary.queue.slice(0, 12).map((item) => (
              <li key={item.id}>
                <div className="resource-icon" aria-hidden="true">
                  {item.grade === 'blocked' ? <ShieldAlert size={15} /> : <ListChecks size={15} />}
                </div>
                <div>
                  <div className="resource-line">
                    <strong>{item.label}</strong>
                    <span className={`resource-pill state-${item.grade}`}>{item.grade}</span>
                  </div>
                  <p>{item.summary}</p>
                  <div className="resource-meta">
                    {item.targetName ? <span>{item.targetName}</span> : null}
                    <span>{item.reasons.map((reason) => reason.label).join(' / ')}</span>
                  </div>
                  <div className="dispatch-preflight-actions">
                    {item.actions.slice(0, 4).map((action) => (
                      <button
                        type="button"
                        key={`${item.id}-${action.id}`}
                        disabled={
                          evidenceSweepRunning && action.id === 'run-read-only-evidence-sweep'
                        }
                        onClick={() => runAction(action, item)}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  )
}
