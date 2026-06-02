import { useDispatchTargetContext } from './useDispatchTargetContext'
import { AlertTriangle, CheckCircle2, ClipboardCheck, Shield } from 'lucide-react'
import { formatDateTimeLabel } from '../../domain/atlas'
import { createDispatchAutomationDryRunPlan, canExecuteWriteAutomation } from '../../services/dispatchAutomation'
import { linesToText, textToLines } from '../DispatchPanelParts.helpers'

export function DispatchAutomationSection() {
  const {
    target,
    automationReadiness,
    automationEvaluation,
    dryRunPlan,
    writeGateEvaluation,
    setDryRunPlans,
    onAutomationReadinessChange
  } = useDispatchTargetContext()

  return (
    <>
            <div className="dispatch-automation" aria-label={`${target.name} automation readiness`}>
              <div className="panel-heading">
                <ClipboardCheck size={17} />
                <h3>Automation Readiness</h3>
              </div>
              <div className="dispatch-signal-grid">
                <div>
                  <strong>{automationEvaluation.ready ? 'Documented' : 'Needs review'}</strong>
                  <span>
                    {automationEvaluation.completeChecklistItems}/
                    {automationEvaluation.totalChecklistItems} checklist items complete
                  </span>
                </div>
                <div>
                  <strong>{automationReadiness.requiredConfirmations.length}</strong>
                  <span>Required confirmations documented</span>
                </div>
                <div>
                  <strong>{formatDateTimeLabel(automationReadiness.lastReviewedAt)}</strong>
                  <span>Last automation readiness review</span>
                </div>
              </div>

              {automationEvaluation.blockers.length > 0 ? (
                <ul className="dispatch-list">
                  {automationEvaluation.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              ) : null}

              {automationEvaluation.warnings.length > 0 ? (
                <ul className="dispatch-list dispatch-warning-list">
                  {automationEvaluation.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}

              <div className="dispatch-checklist">
                {automationReadiness.checklistItems.map((item) => (
                  <label className="check-field" key={item.id}>
                    <input
                      type="checkbox"
                      checked={item.complete}
                      onChange={(event) =>
                        onAutomationReadinessChange(target.id, target.projectId, {
                          checklistItems: automationReadiness.checklistItems.map((candidate) =>
                            candidate.id === item.id
                              ? { ...candidate, complete: event.target.checked }
                              : candidate,
                          ),
                        })
                      }
                    />
                    <span>
                      {item.label}
                      {item.required ? ' (required)' : ''}
                    </span>
                  </label>
                ))}
              </div>

              <div className="field-grid">
                <label className="field field-full">
                  <span>Runbook notes</span>
                  <textarea
                    value={linesToText(automationReadiness.runbookNotes)}
                    rows={3}
                    onChange={(event) =>
                      onAutomationReadinessChange(target.id, target.projectId, {
                        runbookNotes: textToLines(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field field-full">
                  <span>Required confirmations</span>
                  <textarea
                    value={linesToText(automationReadiness.requiredConfirmations)}
                    rows={3}
                    onChange={(event) =>
                      onAutomationReadinessChange(target.id, target.projectId, {
                        requiredConfirmations: textToLines(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field field-full">
                  <span>Artifact expectations</span>
                  <textarea
                    value={linesToText(automationReadiness.artifactExpectations)}
                    rows={3}
                    onChange={(event) =>
                      onAutomationReadinessChange(target.id, target.projectId, {
                        artifactExpectations: textToLines(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field field-full">
                  <span>Backup requirements</span>
                  <textarea
                    value={linesToText(automationReadiness.backupRequirements)}
                    rows={3}
                    onChange={(event) =>
                      onAutomationReadinessChange(target.id, target.projectId, {
                        backupRequirements: textToLines(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field field-full">
                  <span>Rollback requirements</span>
                  <textarea
                    value={linesToText(automationReadiness.rollbackRequirements)}
                    rows={3}
                    onChange={(event) =>
                      onAutomationReadinessChange(target.id, target.projectId, {
                        rollbackRequirements: textToLines(event.target.value),
                      })
                    }
                  />
                </label>
                <label className="field field-full">
                  <span>Dry-run notes</span>
                  <textarea
                    value={linesToText(automationReadiness.dryRunNotes)}
                    rows={3}
                    onChange={(event) =>
                      onAutomationReadinessChange(target.id, target.projectId, {
                        dryRunNotes: textToLines(event.target.value),
                      })
                    }
                  />
                </label>
              </div>

              <div className="dispatch-preflight-actions">
                <button
                  type="button"
                  onClick={() =>
                    setDryRunPlans((current) => ({
                      ...current,
                      [target.id]: createDispatchAutomationDryRunPlan({
                        target,
                        readiness: automationReadiness,
                      }),
                    }))
                  }
                >
                  <ClipboardCheck size={15} />
                  Generate no-op dry-run plan
                </button>
                <span>Advisory only. No deployment command is executed.</span>
              </div>

              {dryRunPlan ? (
                <div className="dispatch-dry-run" aria-label={`${target.name} dry-run plan`}>
                  <div className="dispatch-signal-grid">
                    <div>
                      <strong>{dryRunPlan.status}</strong>
                      <span>{dryRunPlan.summary}</span>
                    </div>
                    <div>
                      <strong>{formatDateTimeLabel(dryRunPlan.generatedAt)}</strong>
                      <span>{dryRunPlan.steps.length} no-op phases planned</span>
                    </div>
                  </div>
                  <ol className="resource-list">
                    {dryRunPlan.steps.map((step) => (
                      <li key={step.phase}>
                        <div className="resource-icon" aria-hidden="true">
                          <ClipboardCheck size={15} />
                        </div>
                        <div>
                          <div className="resource-line">
                            <strong>{step.phase}</strong>
                            <span className={`resource-pill state-${step.status}`}>
                              {step.status}
                            </span>
                          </div>
                          <p>{step.message}</p>
                          <div className="resource-meta">
                            <span>
                              {step.requiresConfirmation
                                ? 'confirmation required'
                                : 'no confirmation flag'}
                            </span>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}
            </div>

            <div className="dispatch-automation" aria-label={`${target.name} write automation gate`}>
              <div className="panel-heading">
                <Shield size={17} />
                <h3>Write Automation Locked</h3>
              </div>
              <div className="dispatch-signal-grid">
                <div>
                  <strong>{writeGateEvaluation.status}</strong>
                  <span>{writeGateEvaluation.summary}</span>
                </div>
                <div>
                  <strong>
                    {writeGateEvaluation.gates.filter((gate) => gate.satisfied).length}/
                    {writeGateEvaluation.gates.length}
                  </strong>
                  <span>Future gates with evidence</span>
                </div>
                <div>
                  <strong>
                    {canExecuteWriteAutomation(writeGateEvaluation) ? 'Unlocked' : 'Locked'}
                  </strong>
                  <span>No execution action is available</span>
                </div>
              </div>
              <ul className="dispatch-list dispatch-warning-list">
                {writeGateEvaluation.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
              <ol className="resource-list">
                {writeGateEvaluation.gates.map((gate) => (
                  <li key={gate.id}>
                    <div className="resource-icon" aria-hidden="true">
                      {gate.satisfied ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
                    </div>
                    <div>
                      <div className="resource-line">
                        <strong>{gate.label}</strong>
                        <span
                          className={`resource-pill ${
                            gate.satisfied ? 'state-passing' : 'state-warning'
                          }`}
                        >
                          {gate.satisfied ? 'evidence' : 'needed'}
                        </span>
                      </div>
                      <p>{gate.evidence}</p>
                      <div className="resource-meta">
                        <span>{gate.required ? 'required gate' : 'optional gate'}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
    </>
  )
}
