import { useState } from 'react'
import {
  CalendarCheck,
  ClipboardList,
  FileText,
  GitBranch,
  ListTree,
  NotebookPen,
  RefreshCcw,
  Rocket,
  ShieldAlert,
  SquareArrowOutUpRight,
  Unlink,
} from 'lucide-react'
import {
  WORK_STATUSES,
  VERIFICATION_CADENCES,
  formatDateLabel,
  formatDateTimeLabel,
  type GithubRepositoryLink,
  type ManualOperationalState,
  type ProjectRecord,
  type VerificationCadence,
} from '../domain/atlas'
import type {
  DeploymentTarget,
  DispatchAutomationReadiness,
  DispatchReadiness,
  DispatchState,
} from '../domain/dispatch'
import type { PlanningState } from '../domain/planning'
import type { TimelineEvent } from '../domain/timeline'
import {
  getWritingTemplate,
  WRITING_TEMPLATES,
  type WritingDraft,
  type WritingTemplateId,
} from '../domain/writing'
import { ActivityFeed } from './ActivityFeed'
import { DispatchPanel } from './DispatchPanel'
import { PlanningPanel } from './PlanningPanel'
import { RepoActivityPanel } from './RepoActivityPanel'
import { StatusBadge } from './StatusBadge'
import { TimelineEventList } from './TimelineDashboard'

interface ProjectDetailProps {
  record: ProjectRecord
  dispatch: DispatchState
  planning: PlanningState
  writingDrafts: WritingDraft[]
  timelineEvents: TimelineEvent[]
  onManualChange: (manual: Partial<ManualOperationalState>) => void
  onDispatchTargetChange: (targetId: string, update: Partial<DeploymentTarget>) => void
  onDispatchReadinessChange: (
    targetId: string,
    projectId: string,
    update: Partial<DispatchReadiness>,
  ) => void
  onDispatchAutomationReadinessChange: (
    targetId: string,
    projectId: string,
    update: Partial<DispatchAutomationReadiness>,
  ) => void
  onRunDispatchPreflight: (targetId: string) => Promise<void>
  preflightRunningTargetId: string
  onRepositoryUnbind: (projectId: string, repository: GithubRepositoryLink) => void
  onVerificationCadenceChange: (projectId: string, cadence: VerificationCadence) => void
  onMarkVerified: (projectId: string, note: string) => void
  onWritingRequest: (projectId: string, templateId: WritingTemplateId) => void
  onOpenWritingDraft: (draftId: string) => void
  onOpenPlanning: (projectId: string) => void
  onResetWorkspace: () => void
}

function linesToText(lines: string[]): string {
  return lines.join('\n')
}

function textToLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
}

interface TextAreaFieldProps {
  label: string
  value: string[]
  onChange: (value: string[]) => void
}

function TextAreaField({ label, value, onChange }: TextAreaFieldProps) {
  return (
    <label className="field field-full">
      <span>{label}</span>
      <textarea
        value={linesToText(value)}
        rows={4}
        onChange={(event) => onChange(textToLines(event.target.value))}
      />
    </label>
  )
}

export function ProjectDetail({
  record,
  dispatch,
  planning,
  writingDrafts,
  timelineEvents,
  onManualChange,
  onDispatchTargetChange,
  onDispatchReadinessChange,
  onDispatchAutomationReadinessChange,
  onRunDispatchPreflight,
  preflightRunningTargetId,
  onRepositoryUnbind,
  onVerificationCadenceChange,
  onMarkVerified,
  onWritingRequest,
  onOpenWritingDraft,
  onOpenPlanning,
  onResetWorkspace,
}: ProjectDetailProps) {
  const { project, group, section } = record
  const { manual } = project
  const [verificationDraft, setVerificationDraft] = useState({ projectId: '', note: '' })
  const verificationNote =
    verificationDraft.projectId === project.id ? verificationDraft.note : ''
  const approvedWritingDrafts = writingDrafts
    .filter(
      (draft) =>
        draft.projectId === project.id && ['approved', 'exported'].includes(draft.status),
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 3)
  const recentWritingDrafts = writingDrafts
    .filter((draft) => draft.projectId === project.id && draft.status !== 'archived')
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 3)
  const visibleWritingDrafts =
    approvedWritingDrafts.length > 0 ? approvedWritingDrafts : recentWritingDrafts

  return (
    <aside className="project-detail" aria-labelledby="project-detail-title">
      <div className="detail-header">
        <div>
          <p className="section-label">
            {section.name} / {group.name}
          </p>
          <h2 id="project-detail-title">{project.name}</h2>
          <p>{project.summary}</p>
        </div>
        <StatusBadge status={manual.status} />
      </div>

      <div className="detail-actions">
        <button type="button" onClick={onResetWorkspace}>
          <RefreshCcw size={16} />
          Reset seed
        </button>
      </div>

      <section className="detail-panel">
        <div className="panel-heading">
          <NotebookPen size={17} />
          <h3>Operational Header</h3>
        </div>

        <div className="field-grid">
          <label className="field">
            <span>Status</span>
            <select
              value={manual.status}
              onChange={(event) =>
                onManualChange({ status: event.target.value as ManualOperationalState['status'] })
              }
            >
              {WORK_STATUSES.map((status) => (
                <option key={status.id} value={status.id}>
                  {status.label}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Last verified</span>
            <input
              type="date"
              value={manual.lastVerified}
              onChange={(event) => onManualChange({ lastVerified: event.target.value })}
            />
          </label>

          <label className="field field-full">
            <span>Next action</span>
            <textarea
              rows={2}
              value={manual.nextAction}
              onChange={(event) => onManualChange({ nextAction: event.target.value })}
            />
          </label>

          <label className="field field-full">
            <span>Last meaningful change</span>
            <textarea
              rows={2}
              value={manual.lastMeaningfulChange}
              onChange={(event) => onManualChange({ lastMeaningfulChange: event.target.value })}
            />
          </label>

          <label className="field field-full">
            <span>Current risk</span>
            <textarea
              rows={2}
              value={manual.currentRisk}
              onChange={(event) => onManualChange({ currentRisk: event.target.value })}
            />
          </label>
        </div>
      </section>

      <section className="detail-panel">
        <div className="panel-heading">
          <ShieldAlert size={17} />
          <h3>Manual Intent</h3>
        </div>
        <div className="field-grid">
          <TextAreaField
            label="Blockers"
            value={manual.blockers}
            onChange={(blockers) => onManualChange({ blockers })}
          />
          <TextAreaField
            label="Deferred items"
            value={manual.deferredItems}
            onChange={(deferredItems) => onManualChange({ deferredItems })}
          />
          <TextAreaField
            label="Explicitly not doing"
            value={manual.notDoingItems}
            onChange={(notDoingItems) => onManualChange({ notDoingItems })}
          />
          <TextAreaField
            label="Notes"
            value={manual.notes}
            onChange={(notes) => onManualChange({ notes })}
          />
          <TextAreaField
            label="Decisions"
            value={manual.decisions}
            onChange={(decisions) => onManualChange({ decisions })}
          />
        </div>
      </section>

      <section className="detail-panel">
        <div className="panel-heading">
          <Rocket size={17} />
          <h3>Dispatch</h3>
        </div>
        <DispatchPanel
          record={record}
          dispatch={dispatch}
          onTargetChange={onDispatchTargetChange}
          onReadinessChange={onDispatchReadinessChange}
          onAutomationReadinessChange={onDispatchAutomationReadinessChange}
          onRunPreflight={onRunDispatchPreflight}
          preflightRunningTargetId={preflightRunningTargetId}
        />
      </section>

      <section className="detail-panel">
        <div className="panel-heading">
          <GitBranch size={17} />
          <h3>GitHub Activity</h3>
        </div>
        <RepoActivityPanel project={project} />
      </section>

      <section className="detail-panel">
        <div className="panel-heading">
          <ListTree size={17} />
          <h3>Evidence Timeline</h3>
        </div>
        <TimelineEventList
          events={timelineEvents.slice(0, 5)}
          compact
          emptyLabel="No derived timeline evidence for this project yet."
        />
      </section>

      <section className="detail-panel">
        <div className="panel-heading">
          <GitBranch size={17} />
          <h3>Manual / Mock Activity</h3>
        </div>
        <ActivityFeed events={project.activity} />
      </section>

      <section className="detail-panel">
        <div className="panel-heading">
          <CalendarCheck size={17} />
          <h3>Verification</h3>
        </div>
        <div className="verification-grid">
          <div>
            <span>Last verified</span>
            <strong>{formatDateLabel(manual.lastVerified)}</strong>
          </div>
          <div>
            <span>Repositories</span>
            <strong>{project.repositories.length}</strong>
          </div>
          <div>
            <span>Cadence</span>
            <strong>
              {VERIFICATION_CADENCES.find((cadence) => cadence.id === manual.verificationCadence)
                ?.label ?? 'Monthly'}
            </strong>
          </div>
        </div>

        <div className="field-grid">
          <label className="field">
            <span>Verification cadence</span>
            <select
              value={manual.verificationCadence}
              onChange={(event) =>
                onVerificationCadenceChange(project.id, event.target.value as VerificationCadence)
              }
            >
              {VERIFICATION_CADENCES.map((cadence) => (
                <option key={cadence.id} value={cadence.id}>
                  {cadence.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field field-full">
            <span>Verification note</span>
            <textarea
              rows={2}
              value={verificationNote}
              onChange={(event) =>
                setVerificationDraft({ projectId: project.id, note: event.target.value })
              }
              placeholder="Optional note for the verification audit trail"
            />
          </label>
        </div>

        <div className="verification-actions">
          <button
            type="button"
            onClick={() => {
              onMarkVerified(project.id, verificationNote)
              setVerificationDraft({ projectId: project.id, note: '' })
            }}
          >
            <CalendarCheck size={15} />
            Mark verified today
          </button>
          <span>Manual verification updates the date and activity only.</span>
        </div>

        {project.repositories.length > 0 ? (
          <ul className="repo-list">
            {project.repositories.map((repo) => (
              <li key={`${repo.owner}/${repo.name}`}>
                <span>
                  {repo.owner}/{repo.name}
                </span>
                <div className="repo-list-actions">
                  {repo.url ? (
                    <a href={repo.url} target="_blank" rel="noreferrer" aria-label="Open repo">
                      <SquareArrowOutUpRight size={15} />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    aria-label={`Unbind ${repo.owner}/${repo.name}`}
                    onClick={() => onRepositoryUnbind(project.id, repo)}
                  >
                    <Unlink size={15} />
                    Unbind
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No repository binding yet.</p>
        )}
      </section>

      <section className="detail-panel">
        <div className="panel-heading">
          <ClipboardList size={17} />
          <h3>Planning</h3>
        </div>
        <PlanningPanel
          planning={planning}
          projectId={project.id}
          onOpenPlanning={onOpenPlanning}
        />
      </section>

      <section className="detail-panel">
        <div className="panel-heading">
          <FileText size={17} />
          <h3>Writing</h3>
        </div>
        <div className="ai-action-grid">
          {WRITING_TEMPLATES.map((action) => (
            <button
              type="button"
              key={action.id}
              onClick={() => onWritingRequest(project.id, action.id)}
            >
              <FileText size={15} />
              {action.label}
            </button>
          ))}
        </div>
        {visibleWritingDrafts.length > 0 ? (
          <div
            className="writing-mini-list"
            aria-label={approvedWritingDrafts.length > 0 ? 'Approved writing drafts' : 'Recent writing drafts'}
          >
            {visibleWritingDrafts.map((draft) => (
              <button type="button" key={draft.id} onClick={() => onOpenWritingDraft(draft.id)}>
                <span>
                  {getWritingTemplate(draft.templateId).label} / {draft.status}
                </span>
                <strong>{draft.title}</strong>
                <small>{formatDateTimeLabel(draft.updatedAt)}</small>
              </button>
            ))}
          </div>
        ) : (
          <p className="empty-state">No writing drafts for this project yet.</p>
        )}
      </section>
    </aside>
  )
}
