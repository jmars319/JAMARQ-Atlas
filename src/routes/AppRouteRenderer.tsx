import { lazy, Suspense, type Dispatch, type SetStateAction } from 'react'
import { Dashboard } from '../components/Dashboard'
import { AppViewBoundary } from '../components/AppViewBoundary'
import { SurfaceState } from '../components/SurfaceState'
import { findProjectRecord, type ProjectRecord, type WorkStatus, type Workspace } from '../domain/atlas'
import type { AtlasCalibrationState } from '../domain/calibration'
import type { DispatchState } from '../domain/dispatch'
import type { AtlasOptimizationState } from '../domain/optimization'
import type { PlanningSourceLink, PlanningState } from '../domain/planning'
import type { RepoOperationsState } from '../domain/repoOperations'
import type { RepoWorkflowRunsState } from '../domain/repoWorkflowRuns'
import type { ReportsState } from '../domain/reports'
import type { ReviewState } from '../domain/review'
import type { AtlasSettingsState } from '../domain/settings'
import type { AtlasSyncState } from '../domain/sync'
import type { TimelineEvent } from '../domain/timeline'
import type { WritingTemplateId, WritingWorkbenchState } from '../domain/writing'
import type { CalibrationIssue } from '../services/calibration'
import type { DataIntegrityDiagnostic } from '../domain/dataIntegrity'
import type { RepoOperationsRow } from '../services/repoOperations'
import type { createAtlasActions } from '../services/atlasActions'
import type { useLocalCalibration } from '../hooks/useLocalCalibration'
import type { useLocalDispatch } from '../hooks/useLocalDispatch'
import type { useLocalOptimization } from '../hooks/useLocalOptimization'
import type { useLocalPlanning } from '../hooks/useLocalPlanning'
import type { useLocalRepoOperations } from '../hooks/useLocalRepoOperations'
import type { useLocalRepoWorkflowRuns } from '../hooks/useLocalRepoWorkflowRuns'
import type { useLocalReports } from '../hooks/useLocalReports'
import type { useLocalReview } from '../hooks/useLocalReview'
import type { useLocalSettings } from '../hooks/useLocalSettings'
import type { useLocalSync } from '../hooks/useLocalSync'
import type { useLocalWriting } from '../hooks/useLocalWriting'
import { appViewLabel, type AppView } from './atlasViews'

const TimelineDashboard = lazy(() =>
  import('../components/TimelineDashboard').then((module) => ({
    default: module.TimelineDashboard,
  })),
)
const GitHubIntakeDashboard = lazy(() =>
  import('../components/GitHubIntakeDashboard').then((module) => ({
    default: module.GitHubIntakeDashboard,
  })),
)
const RepoCommandCenter = lazy(() =>
  import('../components/RepoCommandCenter').then((module) => ({
    default: module.RepoCommandCenter,
  })),
)
const PlanningCenter = lazy(() =>
  import('../components/PlanningCenter').then((module) => ({ default: module.PlanningCenter })),
)
const OptimizationCenter = lazy(() =>
  import('../components/OptimizationCenter').then((module) => ({
    default: module.OptimizationCenter,
  })),
)
const ReportsCenter = lazy(() =>
  import('../components/ReportsCenter').then((module) => ({ default: module.ReportsCenter })),
)
const ReviewCenter = lazy(() =>
  import('../components/ReviewCenter').then((module) => ({ default: module.ReviewCenter })),
)
const VerificationCenter = lazy(() =>
  import('../components/VerificationCenter').then((module) => ({
    default: module.VerificationCenter,
  })),
)
const DispatchDashboard = lazy(() =>
  import('../components/DispatchDashboard').then((module) => ({
    default: module.DispatchDashboard,
  })),
)
const OpsCockpit = lazy(() =>
  import('../components/OpsCockpit').then((module) => ({ default: module.OpsCockpit })),
)
const WritingWorkbench = lazy(() =>
  import('../components/WritingWorkbench').then((module) => ({ default: module.WritingWorkbench })),
)
const DataCenter = lazy(() =>
  import('../components/DataCenter').then((module) => ({ default: module.DataCenter })),
)
const SettingsCenter = lazy(() =>
  import('../components/SettingsCenter').then((module) => ({ default: module.SettingsCenter })),
)

type AtlasActions = ReturnType<typeof createAtlasActions>
type StatusFilter = WorkStatus | 'All'
type SectionFilter = string | 'All'
type LocalCalibration = ReturnType<typeof useLocalCalibration>
type LocalDispatch = ReturnType<typeof useLocalDispatch>
type LocalOptimization = ReturnType<typeof useLocalOptimization>
type LocalPlanning = ReturnType<typeof useLocalPlanning>
type LocalRepoOperations = ReturnType<typeof useLocalRepoOperations>
type LocalRepoWorkflowRuns = ReturnType<typeof useLocalRepoWorkflowRuns>
type LocalReports = ReturnType<typeof useLocalReports>
type LocalReview = ReturnType<typeof useLocalReview>
type LocalSettings = ReturnType<typeof useLocalSettings>
type LocalSync = ReturnType<typeof useLocalSync>
type LocalWriting = ReturnType<typeof useLocalWriting>

interface AppRouteRendererProps {
  appView: AppView
  workspace: Workspace
  projectRecords: ProjectRecord[]
  selectedRecord: ProjectRecord | undefined
  dispatch: DispatchState
  settings: AtlasSettingsState
  calibration: AtlasCalibrationState
  sync: AtlasSyncState
  writing: WritingWorkbenchState
  planning: PlanningState
  optimization: AtlasOptimizationState
  repoOperations: RepoOperationsState
  repoWorkflowRuns: RepoWorkflowRunsState
  reports: ReportsState
  review: ReviewState
  calibrationIssues: CalibrationIssue[]
  timelineEvents: TimelineEvent[]
  dataIntegrityDiagnostics: DataIntegrityDiagnostic[]
  repoOperationsRows: RepoOperationsRow[]
  query: string
  statusFilter: StatusFilter
  sectionFilter: SectionFilter
  selectedWritingTemplate: WritingTemplateId
  selectedWritingDraftId: string
  preflightRunningTargetId: string
  hostInspectionRunningTargetIds: string[]
  verificationRunningTargetIds: string[]
  queueEvidenceSweepRunning: boolean
  actions: AtlasActions
  onQueryChange: Dispatch<SetStateAction<string>>
  onStatusFilterChange: Dispatch<SetStateAction<StatusFilter>>
  onSectionFilterChange: Dispatch<SetStateAction<SectionFilter>>
  onViewChange: Dispatch<SetStateAction<AppView>>
  onSelectedWritingTemplateChange: Dispatch<SetStateAction<WritingTemplateId>>
  importOptimizationSnapshot: LocalOptimization['importSnapshot']
  importRepoOperationsSnapshot: LocalRepoOperations['importSnapshot']
  updateRepoOperationsFilters: LocalRepoOperations['updateFilters']
  recordRepoOperationsPlanningLink: LocalRepoOperations['recordPlanningLink']
  recordWorkflowRun: LocalRepoWorkflowRuns['recordWorkflowRun']
  createPlanningItem: LocalPlanning['createItem']
  updatePlanningItem: LocalPlanning['updateItem']
  deletePlanningItem: LocalPlanning['deleteItem']
  promotePlanningNote: LocalPlanning['promoteNote']
  addReviewSession: LocalReview['addSession']
  addReviewNote: LocalReview['addNote']
  saveReviewFilter: LocalReview['saveFilter']
  deleteReviewFilter: LocalReview['deleteFilter']
  addReportPacket: LocalReports['addPacket']
  updateReportPacketMarkdown: LocalReports['updatePacketMarkdown']
  recordReportCopied: LocalReports['recordCopied']
  markReportExported: LocalReports['markExported']
  archiveReportPacket: LocalReports['archivePacket']
  updateDraftText: LocalWriting['updateDraftText']
  updateDraftNotes: LocalWriting['updateDraftNotes']
  recordProviderSuggestion: LocalWriting['recordProviderSuggestion']
  applyProviderSuggestion: LocalWriting['applyProviderSuggestion']
  markReviewed: LocalWriting['markReviewed']
  approveDraft: LocalWriting['approveDraft']
  recordCopied: LocalWriting['recordCopied']
  markExported: LocalWriting['markExported']
  archiveDraft: LocalWriting['archiveDraft']
  updateLocalSettings: LocalSettings['updateLocalSettings']
  removeCredentialReference: LocalCalibration['removeCredentialReference']
  removeSnapshot: LocalSync['removeSnapshot']
  updateProvider: LocalSync['updateProvider']
  recordRemoteSnapshots: LocalSync['recordRemoteSnapshots']
  recordRemotePush: LocalSync['recordRemotePush']
  removeRemoteSnapshot: LocalSync['removeRemoteSnapshot']
  createDeploySession: LocalDispatch['createDeploySession']
  updateDeploymentArtifact: LocalDispatch['updateDeploymentArtifact']
}

export function AppRouteRenderer({
  appView,
  workspace,
  projectRecords,
  selectedRecord,
  dispatch,
  settings,
  calibration,
  sync,
  writing,
  planning,
  optimization,
  repoOperations,
  repoWorkflowRuns,
  reports,
  review,
  calibrationIssues,
  timelineEvents,
  dataIntegrityDiagnostics,
  repoOperationsRows,
  query,
  statusFilter,
  sectionFilter,
  selectedWritingTemplate,
  selectedWritingDraftId,
  preflightRunningTargetId,
  hostInspectionRunningTargetIds,
  verificationRunningTargetIds,
  queueEvidenceSweepRunning,
  actions,
  onQueryChange,
  onStatusFilterChange,
  onSectionFilterChange,
  onViewChange,
  onSelectedWritingTemplateChange,
  importOptimizationSnapshot,
  importRepoOperationsSnapshot,
  updateRepoOperationsFilters,
  recordRepoOperationsPlanningLink,
  recordWorkflowRun,
  createPlanningItem,
  updatePlanningItem,
  deletePlanningItem,
  promotePlanningNote,
  addReviewSession,
  addReviewNote,
  saveReviewFilter,
  deleteReviewFilter,
  addReportPacket,
  updateReportPacketMarkdown,
  recordReportCopied,
  markReportExported,
  archiveReportPacket,
  updateDraftText,
  updateDraftNotes,
  recordProviderSuggestion,
  applyProviderSuggestion,
  markReviewed,
  approveDraft,
  recordCopied,
  markExported,
  archiveDraft,
  updateLocalSettings,
  removeCredentialReference,
  removeSnapshot,
  updateProvider,
  recordRemoteSnapshots,
  recordRemotePush,
  removeRemoteSnapshot,
  createDeploySession,
  updateDeploymentArtifact,
}: AppRouteRendererProps) {
  return (
    <AppViewBoundary viewKey={appView} title={`${appViewLabel(appView)} view`}>
      <Suspense
        fallback={
          <SurfaceState
            tone="loading"
            title={`Loading ${appViewLabel(appView)}`}
            detail="Atlas is loading this operator surface."
          />
        }
      >
        {appView === 'board' ? (
          <Dashboard
            workspace={workspace}
            projectRecords={projectRecords}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            query={query}
            statusFilter={statusFilter}
            sectionFilter={sectionFilter}
            onSelectProject={actions.selectProject}
            onQueryChange={onQueryChange}
            onStatusFilterChange={onStatusFilterChange}
            onSectionFilterChange={onSectionFilterChange}
          />
        ) : appView === 'timeline' ? (
          <TimelineDashboard
            events={timelineEvents}
            projectRecords={projectRecords}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={actions.selectProject}
          />
        ) : appView === 'optimize' ? (
          <OptimizationCenter
            optimization={optimization}
            projectRecords={projectRecords}
            onImportSnapshot={importOptimizationSnapshot}
            onSelectProject={actions.selectProject}
            onCreatePlanningNote={(projectId, title, detail, sourceLinks) => {
              const record = findProjectRecord(workspace, projectId)

              if (!record) return

              createPlanningItem({
                kind: 'note',
                record,
                title,
                detail,
                status: 'planned',
                sourceLinks: sourceLinks as PlanningSourceLink[],
              })
              actions.selectProject(projectId)
              onViewChange('planning')
            }}
          />
        ) : appView === 'repos' ? (
          <RepoCommandCenter
            repoOperations={repoOperations}
            projectRecords={projectRecords}
            onImportSnapshot={importRepoOperationsSnapshot}
            onUpdateFilters={updateRepoOperationsFilters}
            onCreatePlanningItem={createPlanningItem}
            onRecordPlanningLink={recordRepoOperationsPlanningLink}
            repoWorkflowRuns={repoWorkflowRuns.runs}
            onRecordWorkflowRun={recordWorkflowRun}
            onSelectProject={actions.selectProject}
            onOpenPlanning={(projectId) => {
              actions.selectProject(projectId)
              onViewChange('planning')
            }}
          />
        ) : appView === 'github' ? (
          <GitHubIntakeDashboard
            projectRecords={projectRecords}
            dispatch={dispatch}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={actions.selectProject}
            onBindRepository={actions.bindRepository}
            onCreateInboxProject={actions.createInboxProject}
            onAddReviewNote={addReviewNote}
          />
        ) : appView === 'planning' ? (
          <PlanningCenter
            planning={planning}
            projectRecords={projectRecords}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={actions.selectProject}
            onCreateItem={createPlanningItem}
            onUpdateItem={updatePlanningItem}
            onDeleteItem={deletePlanningItem}
            onPromoteNote={promotePlanningNote}
          />
        ) : appView === 'reports' ? (
          <ReportsCenter
            reports={reports}
            review={review}
            projectRecords={projectRecords}
            dispatch={dispatch}
            planning={planning}
            writing={writing}
            calibration={calibration}
            calibrationIssues={calibrationIssues}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={actions.selectProject}
            onCreatePacket={addReportPacket}
            onUpdatePacketMarkdown={updateReportPacketMarkdown}
            onRecordCopied={recordReportCopied}
            onMarkExported={markReportExported}
            onArchivePacket={archiveReportPacket}
          />
        ) : appView === 'review' ? (
          <ReviewCenter
            review={review}
            projectRecords={projectRecords}
            dispatch={dispatch}
            planning={planning}
            reports={reports}
            writing={writing}
            sync={sync}
            repoOperations={repoOperations}
            repoWorkflowRuns={repoWorkflowRuns.runs}
            timelineEvents={timelineEvents}
            onSelectProject={actions.selectProject}
            onAddReviewSession={addReviewSession}
            onAddReviewNote={addReviewNote}
            onSaveReviewFilter={saveReviewFilter}
            onDeleteReviewFilter={deleteReviewFilter}
            onCreatePlanningNote={actions.createPlanningNoteFromReview}
            onOpenGitHub={() => onViewChange('github')}
            onOpenPlanning={actions.openPlanning}
          />
        ) : appView === 'ops' ? (
          <OpsCockpit
            workspace={workspace}
            dispatch={dispatch}
            reports={reports}
            sync={sync}
            calibration={calibration}
            calibrationIssues={calibrationIssues}
            dataIntegrityDiagnostics={dataIntegrityDiagnostics}
            repoOperationsRows={repoOperationsRows}
            onOpenProject={(projectId) => {
              actions.selectProject(projectId)
              onViewChange('board')
            }}
            onOpenDispatchTarget={(projectId) => {
              actions.selectProject(projectId)
              onViewChange('dispatch')
            }}
            onOpenReview={() => onViewChange('review')}
            onOpenPlanning={() => onViewChange('planning')}
            onOpenDispatch={() => onViewChange('dispatch')}
            onOpenCalibration={() => onViewChange('settings')}
            onOpenDataCenter={() => onViewChange('data')}
            onOpenRepos={() => onViewChange('repos')}
            onRunEvidenceSweep={(targetIds) => actions.runQueueEvidenceSweep(targetIds)}
            evidenceSweepRunning={queueEvidenceSweepRunning}
            onStartManualDeploySession={(targetId) => {
              const runbook = dispatch.runbooks.find((candidate) => candidate.targetId === targetId)

              if (runbook) {
                createDeploySession(runbook.id)
                actions.selectProject(runbook.projectId)
                onViewChange('dispatch')
              }
            }}
            onCreatePlanningFollowUp={(projectId, detail) => {
              const record = findProjectRecord(workspace, projectId)

              if (!record) return

              createPlanningItem({
                kind: 'note',
                record,
                title: 'Ops follow-up',
                detail,
                status: 'planned',
              })
              actions.selectProject(projectId)
              onViewChange('planning')
            }}
            onCreateReportPacket={(projectId) => actions.createOperationsReadinessReport(projectId)}
            onCreateSnapshot={() =>
              actions.createSnapshot('Ops cockpit snapshot', 'Created from Ops Cockpit.')
            }
          />
        ) : appView === 'verification' ? (
          <VerificationCenter
            projectRecords={projectRecords}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={actions.selectProject}
          />
        ) : appView === 'writing' ? (
          <WritingWorkbench
            projectRecords={projectRecords}
            dispatch={dispatch}
            writing={writing}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            selectedTemplateId={selectedWritingTemplate}
            selectedDraftId={selectedWritingDraftId}
            onSelectProject={actions.selectProject}
            onSelectTemplate={onSelectedWritingTemplateChange}
            onCreateDraft={actions.createWritingDraft}
            onSelectDraft={actions.selectWritingDraft}
            onUpdateDraftText={updateDraftText}
            onUpdateDraftNotes={updateDraftNotes}
            onRecordProviderSuggestion={recordProviderSuggestion}
            onApplyProviderSuggestion={applyProviderSuggestion}
            onMarkReviewed={markReviewed}
            onApproveDraft={approveDraft}
            onRecordCopied={recordCopied}
            onMarkExported={markExported}
            onArchiveDraft={archiveDraft}
          />
        ) : appView === 'data' ? (
          <DataCenter
            workspace={workspace}
            dispatch={dispatch}
            writing={writing}
            planning={planning}
            reports={reports}
            review={review}
            calibration={calibration}
            optimization={optimization}
            settings={settings}
            sync={sync}
            onRestoreStores={actions.restoreStores}
          />
        ) : appView === 'settings' ? (
          <SettingsCenter
            settings={settings}
            workspace={workspace}
            dispatch={dispatch}
            writing={writing}
            planning={planning}
            reports={reports}
            review={review}
            calibration={calibration}
            optimization={optimization}
            sync={sync}
            onSettingsChange={updateLocalSettings}
            onDispatchTargetChange={actions.updateDispatchTarget}
            onCalibrationProgressChange={actions.updateCalibrationProgress}
            onCalibrationAudit={actions.recordCalibrationAudit}
            onCredentialReferenceSave={actions.saveCredentialReference}
            onCredentialReferenceDelete={(referenceId) =>
              removeCredentialReference(referenceId, settings.operatorLabel)
            }
            onApplyCalibrationImport={actions.applyCalibrationImport}
            onCreateSnapshot={actions.createSnapshot}
            onDeleteSnapshot={removeSnapshot}
            onRestoreSnapshot={actions.restoreSnapshot}
            onSyncProviderChange={updateProvider}
            onRecordRemoteSnapshots={recordRemoteSnapshots}
            onRecordRemotePush={recordRemotePush}
            onRemoveRemoteSnapshot={removeRemoteSnapshot}
          />
        ) : (
          <DispatchDashboard
            dispatch={dispatch}
            reports={reports}
            projectRecords={projectRecords}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={actions.selectProject}
            onStartDeploySession={createDeploySession}
            onDeploymentArtifactChange={updateDeploymentArtifact}
            onRunDispatchPreflight={actions.runDispatchPreflight}
            preflightRunningTargetId={preflightRunningTargetId}
            onRunHostInspection={actions.runHostInspection}
            onRunHostInspections={actions.runHostInspections}
            hostInspectionRunningTargetIds={hostInspectionRunningTargetIds}
            onRunVerificationChecks={actions.runDeploymentVerification}
            verificationRunningTargetIds={verificationRunningTargetIds}
            onRunQueueEvidenceSweep={actions.runQueueEvidenceSweep}
            queueEvidenceSweepRunning={queueEvidenceSweepRunning}
            onCreateReadinessReport={actions.createReadinessReport}
          />
        )}
      </Suspense>
    </AppViewBoundary>
  )
}
