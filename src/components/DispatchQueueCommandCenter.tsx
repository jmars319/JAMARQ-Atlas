import {
  ClipboardCheck,
  ExternalLink,
  FileArchive,
  FileText,
  Play,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import { useState } from 'react'
import { formatDateTimeLabel } from '../domain/atlas'
import type { DeploymentArtifact } from '../domain/dispatch'
import { inspectDeploymentArtifact } from '../services/deployPreflight'
import type {
  DispatchQueueItem,
  DispatchQueueSignal,
  DispatchQueueSignalStatus,
  DispatchQueueState,
} from '../services/dispatchQueue'
import { closeoutStateLabels } from '../services/dispatchCloseout'

interface DispatchQueueCommandCenterProps {
  items: DispatchQueueItem[]
  selectedProjectId: string
  onSelectProject: (projectId: string) => void
  onStartDeploySession: (runbookId: string) => void
  onDeploymentArtifactChange: (
    runbookId: string,
    artifactId: string,
    update: Partial<DeploymentArtifact>,
  ) => void
  onRunDispatchPreflight: (targetId: string) => Promise<void>
  onRunHostInspection: (targetId: string) => Promise<void>
  onRunVerificationChecks: (targetId: string) => Promise<void>
  onRunEvidenceSweep: (targetIds: string[]) => Promise<void>
  onCreateReadinessReport: (projectId: string) => void
  preflightRunningTargetId: string
  hostInspectionRunningTargetIds: string[]
  verificationRunningTargetIds: string[]
  evidenceSweepRunning: boolean
}

const queueStateLabels: Record<DispatchQueueState, string> = {
  'needs-artifacts': 'Needs artifacts',
  'needs-evidence': 'Needs evidence',
  'session-active': 'Session active',
  'ready-for-manual-upload': 'Ready for manual upload',
  recorded: 'Recorded',
}

function statusClass(status: DispatchQueueSignalStatus | DispatchQueueState | string) {
  return status.replace(/[^a-z0-9]+/gi, '-')
}

function SignalCard({ label, signal }: { label: string; signal: DispatchQueueSignal }) {
  return (
    <div className="dispatch-queue-signal">
      <span>{label}</span>
      <strong className={`queue-chip queue-${statusClass(signal.status)}`}>
        {signal.label}
      </strong>
      <p>{signal.detail}</p>
      <small>{signal.checkedAt ? formatDateTimeLabel(signal.checkedAt) : 'no evidence yet'}</small>
    </div>
  )
}

export function DispatchQueueCommandCenter({
  items,
  selectedProjectId,
  onSelectProject,
  onStartDeploySession,
  onDeploymentArtifactChange,
  onRunDispatchPreflight,
  onRunHostInspection,
  onRunVerificationChecks,
  onRunEvidenceSweep,
  onCreateReadinessReport,
  preflightRunningTargetId,
  hostInspectionRunningTargetIds,
  verificationRunningTargetIds,
  evidenceSweepRunning,
}: DispatchQueueCommandCenterProps) {
  const [artifactMessages, setArtifactMessages] = useState<Record<string, string>>({})
  const targetIds = items.map((item) => item.target.id)

  async function inspectArtifact(
    item: DispatchQueueItem,
    artifact: DeploymentArtifact,
    file: File,
  ) {
    setArtifactMessages((current) => ({
      ...current,
      [artifact.id]: `Inspecting ${file.name}...`,
    }))

    try {
      const result = await inspectDeploymentArtifact(file, artifact)
      onDeploymentArtifactChange(item.runbook.id, artifact.id, {
        checksum: result.checksum,
        inspectedAt: result.inspectedAt,
        warnings: result.warnings,
        notes: [
          ...artifact.notes.filter((note) => !note.startsWith('Top-level ZIP entries:')),
          `Top-level ZIP entries: ${result.topLevelEntries.join(', ') || 'none inspected'}.`,
        ],
      })
      setArtifactMessages((current) => ({
        ...current,
        [artifact.id]:
          result.warnings.length > 0
            ? result.warnings.join(' ')
            : `Inspected ${result.filename}; checksum captured.`,
      }))
    } catch (error) {
      setArtifactMessages((current) => ({
        ...current,
        [artifact.id]:
          error instanceof Error ? error.message : 'Artifact inspection failed locally.',
      }))
    }
  }

  return (
    <section className="dispatch-queue" aria-label="Dispatch queue command center">
      <div className="panel-heading">
        <ClipboardCheck size={17} />
        <h2>Queue Command Center</h2>
      </div>
      <div className="dispatch-preflight-actions">
        <button
          type="button"
          disabled={evidenceSweepRunning || items.length === 0}
          onClick={() => onRunEvidenceSweep(targetIds)}
        >
          <RefreshCw size={15} />
          {evidenceSweepRunning ? 'Sweeping evidence' : 'Run read-only evidence sweep'}
        </button>
        <span>
          Ordered cPanel queue. Evidence only; uploads and production changes happen outside Atlas.
        </span>
      </div>

      <div className="dispatch-queue-list">
        {items.map((item) => {
          const preflightRunning = preflightRunningTargetId === item.target.id
          const hostRunning = hostInspectionRunningTargetIds.includes(item.target.id)
          const verificationRunning = verificationRunningTargetIds.includes(item.target.id)

          return (
            <article
              className={`dispatch-queue-item ${
                selectedProjectId === item.target.projectId ? 'is-selected' : ''
              }`}
              key={item.id}
            >
              <div className="dispatch-queue-heading">
                <div>
                  <span className="card-context">#{item.order} / {item.projectName}</span>
                  <strong>{item.runbook.siteName}</strong>
                </div>
                <span className={`queue-chip queue-${statusClass(item.state)}`}>
                  {queueStateLabels[item.state]}
                </span>
              </div>

              <div className="dispatch-queue-closeout">
                <span className={`queue-chip queue-${statusClass(item.closeout.state)}`}>
                  Closeout: {closeoutStateLabels[item.closeout.state]}
                </span>
                <p>{item.closeout.detail}</p>
              </div>

              <div className="dispatch-queue-signals">
                <SignalCard label="Artifacts" signal={item.artifactStatus} />
                <SignalCard label="Preflight" signal={item.preflightStatus} />
                <SignalCard label="Host" signal={item.hostStatus} />
                <SignalCard label="Verify" signal={item.verificationStatus} />
              </div>

              <div className="dispatch-queue-runbook">
                <div>
                  <strong>Artifact ZIPs</strong>
                  <ul className="dispatch-list">
                    {item.runbook.artifacts.map((artifact) => (
                      <li key={artifact.id}>
                        <div className="dispatch-artifact-line">
                          <span>
                            {artifact.filename} {'->'} {artifact.targetPath}
                          </span>
                          <label className="queue-file-action">
                            <FileArchive size={14} />
                            Inspect
                            <input
                              aria-label={`Inspect ${item.runbook.siteName} ${artifact.filename}`}
                              type="file"
                              accept=".zip,application/zip"
                              onChange={(event) => {
                                const file = event.currentTarget.files?.[0]
                                if (file) {
                                  void inspectArtifact(item, artifact, file)
                                  event.currentTarget.value = ''
                                }
                              }}
                            />
                          </label>
                        </div>
                        {artifact.checksum ? (
                          <small>
                            {artifact.checksum.slice(0, 22)}... /{' '}
                            {formatDateTimeLabel(artifact.inspectedAt)}
                          </small>
                        ) : null}
                        {artifactMessages[artifact.id] ? (
                          <small>{artifactMessages[artifact.id]}</small>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <strong>Preserve/create paths</strong>
                  <ul className="dispatch-list">
                    {item.runbook.preservePaths.map((preservePath) => (
                      <li key={preservePath.id}>
                        {preservePath.path}
                        {preservePath.temporary ? ' (temporary)' : ''}: {preservePath.reason}
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <strong>Protected checks</strong>
                  <ul className="dispatch-list">
                    {item.runbook.verificationChecks
                      .filter((check) => check.protectedResource)
                      .map((check) => (
                        <li key={check.id}>
                          {check.urlPath}: expect {check.expectedStatuses.join('/')}
                        </li>
                      ))}
                  </ul>
                </div>
              </div>

              {item.warnings.length > 0 ? (
                <ul className="dispatch-list dispatch-warning-list">
                  {item.warnings.slice(0, 3).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}

              <div className="dispatch-card-actions dispatch-queue-actions">
                <button
                  type="button"
                  onClick={() => {
                    if (item.activeSession) {
                      onSelectProject(item.target.projectId)
                    } else {
                      onStartDeploySession(item.runbook.id)
                    }
                  }}
                >
                  <Play size={14} />
                  {item.activeSession ? 'Resume session' : 'Start session'}
                </button>
                <button type="button" onClick={() => onSelectProject(item.target.projectId)}>
                  <ExternalLink size={14} />
                  Open project
                </button>
                <button
                  type="button"
                  disabled={preflightRunning}
                  onClick={() => void onRunDispatchPreflight(item.target.id)}
                >
                  <RefreshCw size={14} />
                  {preflightRunning ? 'Preflight running' : 'Run preflight'}
                </button>
                <button
                  type="button"
                  disabled={hostRunning}
                  onClick={() => void onRunHostInspection(item.target.id)}
                >
                  <ShieldCheck size={14} />
                  {hostRunning ? 'Inspecting host' : 'Inspect host'}
                </button>
                <button
                  type="button"
                  disabled={verificationRunning}
                  onClick={() => void onRunVerificationChecks(item.target.id)}
                >
                  <RefreshCw size={14} />
                  {verificationRunning ? 'Checking' : 'Run checks'}
                </button>
                <button type="button" onClick={() => onCreateReadinessReport(item.target.projectId)}>
                  <FileText size={14} />
                  Readiness report
                </button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
