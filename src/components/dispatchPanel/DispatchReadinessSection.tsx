import { useDispatchTargetContext } from './useDispatchTargetContext'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { formatDateTimeLabel } from '../../domain/atlas'
import { linesToText, textToLines } from '../DispatchPanelParts.helpers'

export function DispatchReadinessSection() {
  const {
    credentialReferences,
    target,
    readiness,
    evaluation,
    credentialMessages,
    onTargetChange,
    onReadinessChange,
    handleCredentialRefChange
  } = useDispatchTargetContext()

  return (
    <>
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
                <span>Credential reference label (not a secret)</span>
                {credentialReferences.length > 0 ? (
                  <select
                    aria-label={`Registered credential reference for ${target.name}`}
                    value={
                      credentialReferences.some(
                        (reference) => reference.label === target.credentialRef,
                      )
                        ? target.credentialRef
                        : ''
                    }
                    onChange={(event) => handleCredentialRefChange(target.id, event.target.value)}
                  >
                    <option value="">Manual / unregistered label</option>
                    {credentialReferences.map((reference) => (
                      <option key={reference.id} value={reference.label}>
                        {reference.label}
                      </option>
                    ))}
                  </select>
                ) : null}
                <input
                  value={target.credentialRef}
                  placeholder="godaddy-mmh-production"
                  onChange={(event) => handleCredentialRefChange(target.id, event.target.value)}
                />
                {credentialMessages[target.id] ? (
                  <span className="field-warning">{credentialMessages[target.id]}</span>
                ) : null}
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
    </>
  )
}
