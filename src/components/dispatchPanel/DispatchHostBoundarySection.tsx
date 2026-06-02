import { useDispatchTargetContext } from './useDispatchTargetContext'
import { AlertTriangle, CheckCircle2, RefreshCw, Server } from 'lucide-react'
import { formatDateTimeLabel } from '../../domain/atlas'
import { createHostEvidenceRun, formatHostEvidenceProbeLabel } from '../../services/dispatchEvidence'
import { requestHostConnectionPreflight } from '../../services/hostConnection'
import { EvidenceComparisonSummary } from '../DispatchPanelParts'

export function DispatchHostBoundarySection() {
  const {
    target,
    runbook,
    hostEvidenceRuns,
    hostEvidenceComparison,
    visibleHostEvidenceRuns,
    hostEvidenceStatus,
    hostEvidenceCheckedAt,
    hostEvidenceChecks,
    hostEvidenceSummary,
    hostEvidenceCredentialRef,
    hostEvidenceProbeMode,
    hostEvidenceAuthMethod,
    setHostPreflightResults,
    hostPreflightRunningTargetId,
    setHostPreflightRunningTargetId,
    onHostEvidenceRunAdd
  } = useDispatchTargetContext()

  return (
    <>
            <div className="dispatch-preflight" aria-label={`${target.name} host connection`}>
              <div className="panel-heading">
                <Server size={17} />
                <h3>Read-Only Host Boundary</h3>
              </div>
              <div className="dispatch-preflight-actions">
                <button
                  type="button"
                  disabled={hostPreflightRunningTargetId === target.id}
                  onClick={() => {
                    setHostPreflightRunningTargetId(target.id)
                    void requestHostConnectionPreflight({
                      target,
                      preservePaths: runbook?.preservePaths.map((preservePath) => preservePath.path) ?? [],
                    })
                      .then((result) => {
                        onHostEvidenceRunAdd(
                          createHostEvidenceRun({
                            projectId: target.projectId,
                            result,
                          }),
                        )
                        setHostPreflightResults((current) => ({
                          ...current,
                          [target.id]: result,
                        }))
                      })
                      .finally(() => setHostPreflightRunningTargetId(''))
                  }}
                >
                  <RefreshCw size={15} />
                  {hostPreflightRunningTargetId === target.id
                    ? 'Checking host'
                    : 'Run read-only host check'}
                </button>
                <span>Credential refs only. No SSH/SFTP write, upload, or writable check.</span>
              </div>

              {hostEvidenceStatus ? (
                <>
                  <div className="dispatch-signal-grid">
                    <div>
                      <strong>{hostEvidenceStatus}</strong>
                      <span>{hostEvidenceSummary}</span>
                    </div>
                    <div>
                      <strong>{formatDateTimeLabel(hostEvidenceCheckedAt)}</strong>
                      <span>{hostEvidenceChecks.length} read-only checks</span>
                    </div>
                    <div>
                      <strong>{hostEvidenceCredentialRef || 'Not set'}</strong>
                      <span>Credential reference label</span>
                    </div>
                    <div>
                      <strong>{hostEvidenceProbeMode}</strong>
                      <span>Read-only probe mode</span>
                    </div>
                    <div>
                      <strong>{hostEvidenceAuthMethod}</strong>
                      <span>Auth reference type</span>
                    </div>
                  </div>
                  <ol className="resource-list">
                    {hostEvidenceChecks.map((check) => (
                      <li key={check.id}>
                        <div className="resource-icon" aria-hidden="true">
                          {check.status === 'passing' ? (
                            <CheckCircle2 size={15} />
                          ) : (
                            <AlertTriangle size={15} />
                          )}
                        </div>
                        <div>
                          <div className="resource-line">
                            <strong>{check.label}</strong>
                            <span className={`resource-pill state-${check.status}`}>
                              {check.status}
                            </span>
                          </div>
                          <p>{check.message}</p>
                          <div className="resource-meta">
                            <span>{check.type}</span>
                            {check.host ? <span>{check.host}</span> : null}
                            {check.path ? <span>{check.path}</span> : null}
                            {check.probeMode ? <span>{check.probeMode}</span> : null}
                            {check.authMethod ? <span>{check.authMethod}</span> : null}
                            {typeof check.entryCount === 'number' ? (
                              <span>{check.entryCount} entries</span>
                            ) : null}
                            {typeof check.fileCount === 'number' ? (
                              <span>{check.fileCount} files</span>
                            ) : null}
                            {typeof check.directoryCount === 'number' ? (
                              <span>{check.directoryCount} folders</span>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {hostEvidenceRuns.length > 0 ? (
                    <div className="dispatch-preflight-history">
                      <strong>Host evidence history</strong>
                      <EvidenceComparisonSummary
                        label="Host"
                        comparison={hostEvidenceComparison}
                      />
                      <ol>
                        {visibleHostEvidenceRuns.map((run) => (
                          <li key={run.id}>
                            <span className={`resource-pill state-${run.status}`}>
                              {run.status}
                            </span>
                            <span>{formatDateTimeLabel(run.completedAt)}</span>
                            <span>{formatHostEvidenceProbeLabel(run)}</span>
                            <span>{run.summary}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="empty-state">
                  No host boundary evidence captured yet. Configure server-side
                  ATLAS_HOST_PREFLIGHT_CONFIG to enable optional read-only host checks.
                </p>
              )}
            </div>
    </>
  )
}
