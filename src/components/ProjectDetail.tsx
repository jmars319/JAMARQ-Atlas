import {
  Bot,
  CalendarCheck,
  GitBranch,
  NotebookPen,
  RefreshCcw,
  ShieldAlert,
  SquareArrowOutUpRight,
} from 'lucide-react'
import type { AiWritingAction } from '../services/aiWritingAssistant'
import { aiWritingActions } from '../services/aiWritingAssistant'
import {
  WORK_STATUSES,
  formatDateLabel,
  type ManualOperationalState,
  type ProjectRecord,
} from '../domain/atlas'
import { ActivityFeed } from './ActivityFeed'
import { StatusBadge } from './StatusBadge'

interface ProjectDetailProps {
  record: ProjectRecord
  aiDraft: string
  onManualChange: (manual: Partial<ManualOperationalState>) => void
  onDraftRequest: (action: AiWritingAction) => void
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
  aiDraft,
  onManualChange,
  onDraftRequest,
  onResetWorkspace,
}: ProjectDetailProps) {
  const { project, group, section } = record
  const { manual } = project

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
          <GitBranch size={17} />
          <h3>Raw Activity</h3>
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
        </div>

        {project.repositories.length > 0 ? (
          <ul className="repo-list">
            {project.repositories.map((repo) => (
              <li key={`${repo.owner}/${repo.name}`}>
                <span>
                  {repo.owner}/{repo.name}
                </span>
                {repo.url ? (
                  <a href={repo.url} target="_blank" rel="noreferrer" aria-label="Open repo">
                    <SquareArrowOutUpRight size={15} />
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty-state">No repository binding yet.</p>
        )}
      </section>

      <section className="detail-panel">
        <div className="panel-heading">
          <Bot size={17} />
          <h3>AI Writing Boundary</h3>
        </div>
        <div className="ai-action-grid">
          {aiWritingActions.map((action) => (
            <button type="button" key={action.id} onClick={() => onDraftRequest(action.id)}>
              <Bot size={15} />
              {action.label}
            </button>
          ))}
        </div>
        <textarea className="draft-output" readOnly value={aiDraft} rows={10} />
      </section>
    </aside>
  )
}
