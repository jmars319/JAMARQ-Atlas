import { useDispatchTargetContext } from './useDispatchTargetContext'
import { ClipboardCheck, Shield } from 'lucide-react'
import { formatDateTimeLabel } from '../../domain/atlas'
import { closeoutStateLabels } from '../../services/dispatchCloseout'

export function DispatchCloseoutSection() {
  const {
    target,
    closeout
  } = useDispatchTargetContext()

  return (
    <>
            <div className="dispatch-closeout" aria-label={`${target.name} closeout review`}>
              <div className="panel-heading">
                <ClipboardCheck size={17} />
                <h3>Closeout Review</h3>
              </div>
              <div className="dispatch-signal-grid">
                <div>
                  <strong>{closeoutStateLabels[closeout.state]}</strong>
                  <span>Closeout state</span>
                </div>
                <div>
                  <strong>{closeout.latestManualDeploymentRecordId ?? 'Not recorded'}</strong>
                  <span>Manual deployment record</span>
                </div>
                <div>
                  <strong>{closeout.latestHostEvidenceId ?? 'Not captured'}</strong>
                  <span>Host evidence</span>
                </div>
                <div>
                  <strong>{closeout.latestReportPacketId ?? 'Not assembled'}</strong>
                  <span>Deployment report packet</span>
                </div>
              </div>
              <p className="dispatch-muted-note">{closeout.detail}</p>
              <div className="dispatch-runbook-grid">
                <div>
                  <strong>Requirements</strong>
                  <ul className="dispatch-list">
                    {closeout.requirements.map((requirement) => (
                      <li key={requirement.id}>
                        <span className={`resource-pill state-${requirement.status}`}>
                          {requirement.status}
                        </span>{' '}
                        {requirement.label}: {requirement.detail}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <strong>Signals</strong>
                  <ul className="dispatch-list">
                    {closeout.signals.map((signal) => (
                      <li key={signal.id}>
                        {signal.label}: {signal.status}
                        {signal.checkedAt ? ` / ${formatDateTimeLabel(signal.checkedAt)}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="dispatch-safety">
                <Shield size={17} />
                <p>
                  Closeout analytics are derived from local evidence only. They do not deploy,
                  verify, publish, or change Atlas/Dispatch source-of-truth fields.
                </p>
              </div>
            </div>

    </>
  )
}
