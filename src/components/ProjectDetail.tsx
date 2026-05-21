import { useMemo, useState } from 'react'
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
import type { CalibrationCredentialReference } from '../domain/calibration'
import type {
  DeploymentArtifact,
  DeploymentPreservePath,
  DeploymentTarget,
  DeploymentVerificationCheck,
  DispatchAutomationReadiness,
  DispatchDeploySession,
  DispatchDeploySessionStep,
  DispatchDeploySessionStepKind,
  DispatchHostEvidenceRun,
  DispatchReadiness,
  DispatchRecoveryPlan,
  DispatchState,
  DispatchVerificationEvidenceRun,
} from '../domain/dispatch'
import type { PlanningState } from '../domain/planning'
import type { ReportsState } from '../domain/reports'
import type { ReviewNote, ReviewState } from '../domain/review'
import type { TimelineEvent } from '../domain/timeline'
import {
  getWritingTemplate,
  WRITING_TEMPLATES,
  type WritingDraft,
  type WritingTemplateId,
} from '../domain/writing'
import type { DeploySessionChecklistPresetId } from '../services/deploySessions'
import {
  deriveAtlasActionIntents,
  deriveAtlasProjectActionRollup,
} from '../services/actionPlanner'
import { deriveGithubProjectCommandRollup } from '../services/githubCommand'
import { useGithubCommandSummaries } from '../hooks/useGithubCommandSummaries'
import { useVercelCommandSummaries } from '../hooks/useVercelCommandSummaries'
import { ActionPlannerPanel } from './ActionPlannerPanel'
import { ActivityFeed } from './ActivityFeed'
import { DispatchPanel } from './DispatchPanel'
import { GitHubProjectCommandRollupPanel } from './GitHubProjectCommandRollup'
import { LocalGitStatusInline } from './LocalGitStatus'
import { PlanningPanel } from './PlanningPanel'
import { RepoActivityPanel } from './RepoActivityPanel'
import { ReviewPanel } from './ReviewPanel'
import { StatusBadge } from './StatusBadge'
import { TimelineEventList } from './TimelineEventList'
import {
  deriveVercelReadinessSignals,
  vercelDeploymentLabel,
} from '../services/vercelIntegration'

interface ProjectDetailProps {
  record: ProjectRecord
  dispatch: DispatchState
  planning: PlanningState
  reports: ReportsState
  review: ReviewState
  credentialReferences: CalibrationCredentialReference[]
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
  onDeploymentArtifactChange: (
    runbookId: string,
    artifactId: string,
    update: Partial<DeploymentArtifact>,
  ) => void
  onDeploymentPreservePathChange: (
    runbookId: string,
    preservePathId: string,
    update: Partial<DeploymentPreservePath>,
  ) => void
  onDeploymentVerificationCheckChange: (
    runbookId: string,
    checkId: string,
    update: Partial<DeploymentVerificationCheck>,
  ) => void
  onRecoveryPlanChange: (targetId: string, update: Partial<DispatchRecoveryPlan>) => void
  onStartDeploySession: (runbookId: string) => void
  onDeploySessionChange: (
    sessionId: string,
    update: Partial<
      Pick<
        DispatchDeploySession,
        | 'versionLabel'
        | 'sourceRef'
        | 'commitSha'
        | 'artifactName'
        | 'deployedBy'
        | 'summary'
        | 'recordStatus'
        | 'rollbackRef'
        | 'databaseBackupRef'
      >
    >,
  ) => void
  onDeploySessionStepChange: (
    sessionId: string,
    stepId: string,
    update: Partial<Pick<DispatchDeploySessionStep, 'status' | 'notes' | 'evidence'>>,
  ) => void
  onRecordManualDeployment: (
    sessionId: string,
    confirmation: string,
  ) => { ok: boolean; message: string; recordId: string | null }
  onAttachDeploySessionEvidence: (
    sessionId: string,
    stepKind: DispatchDeploySessionStepKind,
    label: string,
    detail: string,
  ) => void
  onApplyDeploySessionPreset: (
    sessionId: string,
    presetId: DeploySessionChecklistPresetId,
  ) => void
  onHostEvidenceRunAdd: (run: DispatchHostEvidenceRun) => void
  onVerificationEvidenceRunAdd: (run: DispatchVerificationEvidenceRun) => void
  onRunDispatchPreflight: (targetId: string) => Promise<void>
  preflightRunningTargetId: string
  onRepositoryUnbind: (projectId: string, repository: GithubRepositoryLink) => void
  onVerificationCadenceChange: (projectId: string, cadence: VerificationCadence) => void
  onMarkVerified: (projectId: string, note: string) => void
  onWritingRequest: (projectId: string, templateId: WritingTemplateId) => void
  onOpenWritingDraft: (draftId: string) => void
  onOpenPlanning: (projectId: string) => void
  onOpenReview: () => void
  onAddReviewNote: (note: ReviewNote) => void
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
  reports,
  review,
  credentialReferences,
  writingDrafts,
  timelineEvents,
  onManualChange,
  onDispatchTargetChange,
  onDispatchReadinessChange,
  onDispatchAutomationReadinessChange,
  onDeploymentArtifactChange,
  onDeploymentPreservePathChange,
  onDeploymentVerificationCheckChange,
  onRecoveryPlanChange,
  onStartDeploySession,
  onDeploySessionChange,
  onDeploySessionStepChange,
  onRecordManualDeployment,
  onAttachDeploySessionEvidence,
  onApplyDeploySessionPreset,
  onHostEvidenceRunAdd,
  onVerificationEvidenceRunAdd,
  onRunDispatchPreflight,
  preflightRunningTargetId,
  onRepositoryUnbind,
  onVerificationCadenceChange,
  onMarkVerified,
  onWritingRequest,
  onOpenWritingDraft,
  onOpenPlanning,
  onOpenReview,
  onAddReviewNote,
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
  const projectRepoKeys = useMemo(
    () => project.repositories.map((repository) => `${repository.owner}/${repository.name}`),
    [project.repositories],
  )
  const commandSummaries = useGithubCommandSummaries(projectRepoKeys)
  const githubRollup = useMemo(
    () =>
      deriveGithubProjectCommandRollup({
        projectId: project.id,
        projectName: project.name,
        repositories: project.repositories,
        summaries: commandSummaries.data,
      }),
    [commandSummaries.data, project.id, project.name, project.repositories],
  )
  const actionIntents = useMemo(
    () =>
      deriveAtlasActionIntents({
        projectRecords: [record],
        summaries: commandSummaries.data,
      }),
    [commandSummaries.data, record],
  )
  const actionRollup = useMemo(
    () => deriveAtlasProjectActionRollup({ projectRecord: record, intents: actionIntents }),
    [actionIntents, record],
  )
  const projectTargets = useMemo(
    () => dispatch.targets.filter((target) => target.projectId === project.id),
    [dispatch.targets, project.id],
  )
  const vercelTargets = useMemo(
    () => projectTargets.filter((target) => target.hostType === 'vercel'),
    [projectTargets],
  )
  const vercelSummaries = useVercelCommandSummaries(vercelTargets.map((target) => target.id))
  const vercelSignals = useMemo(
    () =>
      vercelSummaries.data.flatMap((summary) => {
        const target = vercelTargets.find((candidate) => candidate.id === summary.targetId)

        return deriveVercelReadinessSignals({
          summary,
          target,
          repositoryKeys: projectRepoKeys,
        })
      }),
    [projectRepoKeys, vercelSummaries.data, vercelTargets],
  )
  const latestVercelProduction = vercelSummaries.data.find(
    (summary) => summary.latestProduction,
  )?.latestProduction
  const projectReviewItems = review.notes.filter((note) => note.projectId === project.id).length

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
          <ClipboardList size={17} />
          <h3>Project Command Summary</h3>
        </div>
        <div className="github-health-grid is-compact">
          <div>
            <GitBranch size={16} />
            <strong>{githubRollup.latestCiStatus}</strong>
            <span>Latest CI/check</span>
          </div>
          <div>
            <Rocket size={16} />
            <strong>{vercelDeploymentLabel(latestVercelProduction ?? null)}</strong>
            <span>Vercel production</span>
          </div>
          <div>
            <Rocket size={16} />
            <strong>{projectTargets.length}</strong>
            <span>Dispatch targets</span>
          </div>
          <div>
            <ShieldAlert size={16} />
            <strong>{vercelSignals.filter((signal) => signal.severity !== 'ok').length}</strong>
            <span>Deployment signals</span>
          </div>
          <div>
            <GitBranch size={16} />
            <strong>{actionRollup.dirtyLocalRepoCount}</strong>
            <span>Dirty local repos</span>
          </div>
          <div>
            <NotebookPen size={16} />
            <strong>{projectReviewItems}</strong>
            <span>Review notes</span>
          </div>
        </div>
        <p className="dispatch-muted-note">
          Advisory summary only. Manual project status, Dispatch readiness, verification, and
          deploy state remain unchanged.
        </p>
      </section>

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
          reports={reports}
          credentialReferences={credentialReferences}
          onTargetChange={onDispatchTargetChange}
          onReadinessChange={onDispatchReadinessChange}
          onAutomationReadinessChange={onDispatchAutomationReadinessChange}
          onDeploymentArtifactChange={onDeploymentArtifactChange}
          onDeploymentPreservePathChange={onDeploymentPreservePathChange}
          onDeploymentVerificationCheckChange={onDeploymentVerificationCheckChange}
          onRecoveryPlanChange={onRecoveryPlanChange}
          onStartDeploySession={onStartDeploySession}
          onDeploySessionChange={onDeploySessionChange}
          onDeploySessionStepChange={onDeploySessionStepChange}
          onRecordManualDeployment={onRecordManualDeployment}
          onAttachDeploySessionEvidence={onAttachDeploySessionEvidence}
          onApplyDeploySessionPreset={onApplyDeploySessionPreset}
          onHostEvidenceRunAdd={onHostEvidenceRunAdd}
          onVerificationEvidenceRunAdd={onVerificationEvidenceRunAdd}
          onRunPreflight={onRunDispatchPreflight}
          preflightRunningTargetId={preflightRunningTargetId}
        />
      </section>

      <section className="detail-panel">
        <div className="panel-heading">
          <GitBranch size={17} />
          <h3>GitHub Activity</h3>
        </div>
        {project.repositories.length > 0 ? (
          <>
            <GitHubProjectCommandRollupPanel
              rollup={githubRollup}
              loading={commandSummaries.loading}
              error={commandSummaries.error}
              cacheMetadata={commandSummaries.cacheMetadata}
              onRefresh={commandSummaries.reload}
            />
            <div className="github-action-rollup" aria-label="Project GitHub action planner rollup">
              <div className="github-health-grid is-compact">
                <div>
                  <ShieldAlert size={16} />
                  <strong>{actionRollup.totalIntents}</strong>
                  <span>Planner intents</span>
                </div>
                <div>
                  <ShieldAlert size={16} />
                  <strong>{actionRollup.highestRisk}</strong>
                  <span>Highest risk</span>
                </div>
                <div>
                  <GitBranch size={16} />
                  <strong>{actionRollup.dirtyLocalRepoCount}</strong>
                  <span>Dirty local repos</span>
                </div>
                <div>
                  <GitBranch size={16} />
                  <strong>{actionRollup.failedOrStaleCiCount}</strong>
                  <span>Failed/stale CI</span>
                </div>
              </div>
            </div>
            <ActionPlannerPanel
              intents={actionRollup.topRecommendedActions}
              loading={commandSummaries.loading}
              error={commandSummaries.error}
              title="Project Action Planner"
              detail="Top advisory Git/GitHub actions for connected repositories"
              compact
              maxItems={5}
              onRefresh={commandSummaries.reload}
            />
          </>
        ) : (
          <p className="empty-state">
            No repository is connected, so deploy delta summaries are unavailable.
          </p>
        )}
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
                <div>
                  <span>
                    {repo.owner}/{repo.name}
                  </span>
                  <LocalGitStatusInline owner={repo.owner} repo={repo.name} compact />
                </div>
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
          <p className="empty-state">No connected repository yet.</p>
        )}
      </section>

      <section className="detail-panel">
        <div className="panel-heading">
          <ClipboardList size={17} />
          <h3>Review</h3>
        </div>
        <ReviewPanel
          review={review}
          record={record}
          onAddReviewNote={onAddReviewNote}
          onOpenReview={onOpenReview}
        />
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
