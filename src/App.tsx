import { lazy, Suspense, useMemo, useState } from 'react'
import {
  ArchiveRestore,
  CalendarCheck,
  ClipboardList,
  DatabaseZap,
  Eye,
  FileText,
  GitBranch,
  Newspaper,
  ListTree,
  PanelRightOpen,
  Rocket,
  Settings2,
  UploadCloud,
} from 'lucide-react'
import './App.css'
import { AppViewBoundary } from './components/AppViewBoundary'
import { Dashboard } from './components/Dashboard'
import { ProjectDetail } from './components/ProjectDetail'
import { SurfaceState } from './components/SurfaceState'
import {
  findProjectRecord,
  flattenProjects,
  type WorkStatus,
} from './domain/atlas'
import type {
  DispatchDeploySession,
  DispatchDeploySessionStep,
  DispatchDeploySessionStepKind,
  DispatchHostEvidenceRun,
  DispatchRecoveryPlan,
  DispatchVerificationEvidenceRun,
} from './domain/dispatch'
import type { DeploySessionChecklistPresetId } from './services/deploySessions'
import type { WritingTemplateId } from './domain/writing'
import { useLocalDispatch } from './hooks/useLocalDispatch'
import { useLocalCalibration } from './hooks/useLocalCalibration'
import { useLocalPlanning } from './hooks/useLocalPlanning'
import { useLocalReports } from './hooks/useLocalReports'
import { useLocalReview } from './hooks/useLocalReview'
import { useLocalSettings } from './hooks/useLocalSettings'
import { useLocalSync } from './hooks/useLocalSync'
import { useLocalWriting } from './hooks/useLocalWriting'
import { useLocalWorkspace } from './hooks/useLocalWorkspace'
import { githubIngestionContract } from './services/githubIntegration'
import { deriveTimelineEvents } from './services/timeline'
import { scanAtlasCalibration } from './services/calibration'
import { createAtlasActions, type AtlasActionView } from './services/atlasActions'
import { createDataIntegrityDiagnostics } from './services/dataIntegrity'

const TimelineDashboard = lazy(() =>
  import('./components/TimelineDashboard').then((module) => ({
    default: module.TimelineDashboard,
  })),
)
const GitHubIntakeDashboard = lazy(() =>
  import('./components/GitHubIntakeDashboard').then((module) => ({
    default: module.GitHubIntakeDashboard,
  })),
)
const PlanningCenter = lazy(() =>
  import('./components/PlanningCenter').then((module) => ({ default: module.PlanningCenter })),
)
const ReportsCenter = lazy(() =>
  import('./components/ReportsCenter').then((module) => ({ default: module.ReportsCenter })),
)
const ReviewCenter = lazy(() =>
  import('./components/ReviewCenter').then((module) => ({ default: module.ReviewCenter })),
)
const VerificationCenter = lazy(() =>
  import('./components/VerificationCenter').then((module) => ({
    default: module.VerificationCenter,
  })),
)
const DispatchDashboard = lazy(() =>
  import('./components/DispatchDashboard').then((module) => ({
    default: module.DispatchDashboard,
  })),
)
const OpsCockpit = lazy(() =>
  import('./components/OpsCockpit').then((module) => ({ default: module.OpsCockpit })),
)
const WritingWorkbench = lazy(() =>
  import('./components/WritingWorkbench').then((module) => ({ default: module.WritingWorkbench })),
)
const DataCenter = lazy(() =>
  import('./components/DataCenter').then((module) => ({ default: module.DataCenter })),
)
const SettingsCenter = lazy(() =>
  import('./components/SettingsCenter').then((module) => ({ default: module.SettingsCenter })),
)

type StatusFilter = WorkStatus | 'All'
type SectionFilter = string | 'All'
type AppView = AtlasActionView

function appViewLabel(view: AppView) {
  const labels: Record<AppView, string> = {
    board: 'Board',
    timeline: 'Timeline',
    github: 'GitHub',
    planning: 'Planning',
    reports: 'Reports',
    review: 'Review',
    ops: 'Ops',
    verification: 'Verification',
    dispatch: 'Dispatch',
    writing: 'Writing',
    data: 'Data',
    settings: 'Settings',
  }

  return labels[view]
}

function App() {
  const { workspace, setWorkspace, resetWorkspace } = useLocalWorkspace()
  const {
    dispatch,
    setDispatch,
    updateTarget,
    updateReadiness,
    updateAutomationReadiness,
    updateDeploymentArtifact,
    updateDeploymentPreservePath,
    updateDeploymentVerificationCheck,
    updateRecoveryPlan,
    createDeploySession,
    updateDeploySessionFields,
    updateDeploySessionStepFields,
    recordManualDeployment,
    attachDeploySessionEvidence,
    applyDeploySessionPreset,
    addHostEvidenceRun,
    addVerificationEvidenceRun,
    addPreflightRun,
  } = useLocalDispatch()
  const { settings, setSettings, updateLocalSettings } = useLocalSettings()
  const {
    calibration,
    setCalibration,
    setFieldProgress: setCalibrationFieldProgress,
    saveCredentialReference,
    removeCredentialReference,
  } = useLocalCalibration()
  const {
    sync,
    setSync,
    addSnapshot,
    removeSnapshot,
    updateProvider,
    recordRemoteSnapshots,
    recordRemotePush,
    removeRemoteSnapshot,
  } = useLocalSync()
  const {
    writing,
    setWriting,
    addDraft,
    updateDraftText,
    updateDraftNotes,
    recordProviderSuggestion,
    applyProviderSuggestion,
    markReviewed,
    approveDraft,
    recordCopied,
    markExported,
    archiveDraft,
  } = useLocalWriting()
  const {
    planning,
    setPlanning,
    createItem: createPlanningItem,
    updateItem: updatePlanningItem,
    deleteItem: deletePlanningItem,
  } = useLocalPlanning()
  const {
    reports,
    setReports,
    addPacket: addReportPacket,
    updatePacketMarkdown: updateReportPacketMarkdown,
    recordCopied: recordReportCopied,
    markExported: markReportExported,
    archivePacket: archiveReportPacket,
  } = useLocalReports()
  const {
    review,
    setReview,
    addSession: addReviewSession,
    addNote: addReviewNote,
    saveFilter: saveReviewFilter,
    deleteFilter: deleteReviewFilter,
  } = useLocalReview()
  const projectRecords = useMemo(() => flattenProjects(workspace), [workspace])
  const calibrationIssues = useMemo(
    () =>
      scanAtlasCalibration(
        workspace,
        dispatch,
        undefined,
        calibration.credentialReferences.map((reference) => reference.label),
      ),
    [calibration.credentialReferences, dispatch, workspace],
  )
  const timelineEvents = useMemo(
    () =>
      deriveTimelineEvents({
        projectRecords,
        dispatch,
        writing,
        planning,
        reports,
        review,
        calibration,
        sync,
      }),
    [calibration, dispatch, planning, projectRecords, reports, review, sync, writing],
  )
  const dataIntegrityDiagnostics = useMemo(
    () =>
      createDataIntegrityDiagnostics({
        workspace,
        dispatch,
        writing,
        planning,
        reports,
        review,
        calibration,
      }),
    [calibration, dispatch, planning, reports, review, workspace, writing],
  )
  const [selectedProjectId, setSelectedProjectId] = useState(
    () => projectRecords[0]?.project.id ?? '',
  )
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('All')
  const [appView, setAppView] = useState<AppView>('board')
  const [selectedWritingTemplate, setSelectedWritingTemplate] =
    useState<WritingTemplateId>('client-update')
  const [selectedWritingDraftId, setSelectedWritingDraftId] = useState('')
  const [preflightRunningTargetId, setPreflightRunningTargetId] = useState('')
  const [hostInspectionRunningTargetIds, setHostInspectionRunningTargetIds] = useState<string[]>(
    [],
  )
  const [verificationRunningTargetIds, setVerificationRunningTargetIds] = useState<string[]>([])
  const [queueEvidenceSweepRunning, setQueueEvidenceSweepRunning] = useState(false)
  const selectedRecord =
    findProjectRecord(workspace, selectedProjectId) ?? projectRecords[0]
  const atlasActions = createAtlasActions({
    workspace,
    setWorkspace,
    selectedRecord,
    projectRecords,
    dispatch,
    setDispatch,
    updateTarget,
    updateReadiness,
    updateAutomationReadiness,
    addPreflightRun,
    addHostEvidenceRun,
    addVerificationEvidenceRun,
    settings,
    setSettings,
    calibration,
    setCalibration,
    setCalibrationFieldProgress,
    saveCredentialReference,
    sync,
    setSync,
    addSnapshot,
    writing,
    setWriting,
    addDraft,
    planning,
    setPlanning,
    createPlanningItem,
    reports,
    setReports,
    addReportPacket,
    review,
    setReview,
    calibrationIssues,
    setSelectedProjectId,
    setSelectedWritingTemplate,
    setSelectedWritingDraftId,
    setAppView,
    setPreflightRunningTargetId,
    setHostInspectionRunningTargetIds,
    setVerificationRunningTargetIds,
    setQueueEvidenceSweepRunning,
  })

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <img src="/jamarq-logo.png" alt="" className="brand-mark" />
          <div>
            <strong>Atlas</strong>
            <span>JAMARQ operator dashboard</span>
          </div>
        </div>
        <div className="topbar-meta">
          <span>
            <DatabaseZap size={15} />
            Local-first
          </span>
          <span>
            <ListTree size={15} />
            Timeline-ready
          </span>
          <span>
            <GitBranch size={15} />
            GitHub-ready
          </span>
          <span>
            <ClipboardList size={15} />
            Planning-ready
          </span>
          <span>
            <Newspaper size={15} />
            Reports-ready
          </span>
          <span>
            <Eye size={15} />
            Review-ready
          </span>
          <span>
            <Rocket size={15} />
            Dispatch-ready
          </span>
          <span>
            <CalendarCheck size={15} />
            Verification-aware
          </span>
          <span>
            <FileText size={15} />
            Writing-ready
          </span>
          <span>
            <ArchiveRestore size={15} />
            Backup-ready
          </span>
          <span>
            <Settings2 size={15} />
            Settings-ready
          </span>
          <span>
            <UploadCloud size={15} />
            Sync-local
          </span>
          <span>
            <PanelRightOpen size={15} />
            Human source of truth
          </span>
        </div>
      </header>

      <nav className="app-tabs" aria-label="Atlas views">
        <button
          type="button"
          className={appView === 'board' ? 'is-selected' : ''}
          onClick={() => setAppView('board')}
        >
          Board
        </button>
        <button
          type="button"
          className={appView === 'timeline' ? 'is-selected' : ''}
          onClick={() => setAppView('timeline')}
        >
          Timeline
        </button>
        <button
          type="button"
          className={appView === 'github' ? 'is-selected' : ''}
          onClick={() => setAppView('github')}
        >
          GitHub
        </button>
        <button
          type="button"
          className={appView === 'planning' ? 'is-selected' : ''}
          onClick={() => setAppView('planning')}
        >
          Planning
        </button>
        <button
          type="button"
          className={appView === 'reports' ? 'is-selected' : ''}
          onClick={() => setAppView('reports')}
        >
          Reports
        </button>
        <button
          type="button"
          className={appView === 'review' ? 'is-selected' : ''}
          onClick={() => setAppView('review')}
        >
          Review
        </button>
        <button
          type="button"
          className={appView === 'dispatch' ? 'is-selected' : ''}
          onClick={() => setAppView('dispatch')}
        >
          Dispatch
        </button>
        <button
          type="button"
          className={appView === 'ops' ? 'is-selected' : ''}
          onClick={() => setAppView('ops')}
        >
          Ops
        </button>
        <button
          type="button"
          className={appView === 'verification' ? 'is-selected' : ''}
          onClick={() => setAppView('verification')}
        >
          Verification
        </button>
        <button
          type="button"
          className={appView === 'writing' ? 'is-selected' : ''}
          onClick={() => setAppView('writing')}
        >
          Writing
        </button>
        <button
          type="button"
          className={appView === 'data' ? 'is-selected' : ''}
          onClick={() => setAppView('data')}
        >
          Data
        </button>
        <button
          type="button"
          className={appView === 'settings' ? 'is-selected' : ''}
          onClick={() => setAppView('settings')}
        >
          Settings
        </button>
      </nav>

      <div className="app-layout">
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
            onSelectProject={atlasActions.selectProject}
            onQueryChange={setQuery}
            onStatusFilterChange={setStatusFilter}
            onSectionFilterChange={setSectionFilter}
          />
        ) : appView === 'timeline' ? (
          <TimelineDashboard
            events={timelineEvents}
            projectRecords={projectRecords}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={atlasActions.selectProject}
          />
        ) : appView === 'github' ? (
          <GitHubIntakeDashboard
            projectRecords={projectRecords}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={atlasActions.selectProject}
            onBindRepository={atlasActions.bindRepository}
            onCreateInboxProject={atlasActions.createInboxProject}
          />
        ) : appView === 'planning' ? (
          <PlanningCenter
            planning={planning}
            projectRecords={projectRecords}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={atlasActions.selectProject}
            onCreateItem={createPlanningItem}
            onUpdateItem={updatePlanningItem}
            onDeleteItem={deletePlanningItem}
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
            onSelectProject={atlasActions.selectProject}
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
            timelineEvents={timelineEvents}
            onSelectProject={atlasActions.selectProject}
            onAddReviewSession={addReviewSession}
            onAddReviewNote={addReviewNote}
            onSaveReviewFilter={saveReviewFilter}
            onDeleteReviewFilter={deleteReviewFilter}
            onCreatePlanningNote={atlasActions.createPlanningNoteFromReview}
            onOpenGitHub={() => setAppView('github')}
            onOpenPlanning={atlasActions.openPlanning}
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
            onOpenProject={(projectId) => {
              atlasActions.selectProject(projectId)
              setAppView('board')
            }}
            onOpenDispatchTarget={(projectId) => {
              atlasActions.selectProject(projectId)
              setAppView('dispatch')
            }}
            onOpenCalibration={() => setAppView('settings')}
            onOpenDataCenter={() => setAppView('data')}
            onRunEvidenceSweep={(targetIds) => atlasActions.runQueueEvidenceSweep(targetIds)}
            evidenceSweepRunning={queueEvidenceSweepRunning}
            onStartManualDeploySession={(targetId) => {
              const runbook = dispatch.runbooks.find((candidate) => candidate.targetId === targetId)

              if (runbook) {
                createDeploySession(runbook.id)
                atlasActions.selectProject(runbook.projectId)
                setAppView('dispatch')
              }
            }}
            onCreatePlanningFollowUp={(projectId, detail) => {
              const record = findProjectRecord(workspace, projectId)

              if (!record) {
                return
              }

              createPlanningItem({
                kind: 'note',
                record,
                title: 'Ops follow-up',
                detail,
                status: 'planned',
              })
              atlasActions.selectProject(projectId)
              setAppView('planning')
            }}
            onCreateReportPacket={(projectId) =>
              atlasActions.createOperationsReadinessReport(projectId)
            }
            onCreateSnapshot={() =>
              atlasActions.createSnapshot('Ops cockpit snapshot', 'Created from Ops Cockpit.')
            }
          />
        ) : appView === 'verification' ? (
          <VerificationCenter
            projectRecords={projectRecords}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={atlasActions.selectProject}
          />
        ) : appView === 'writing' ? (
          <WritingWorkbench
            projectRecords={projectRecords}
            dispatch={dispatch}
            writing={writing}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            selectedTemplateId={selectedWritingTemplate}
            selectedDraftId={selectedWritingDraftId}
            onSelectProject={atlasActions.selectProject}
            onSelectTemplate={setSelectedWritingTemplate}
            onCreateDraft={atlasActions.createWritingDraft}
            onSelectDraft={atlasActions.selectWritingDraft}
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
            settings={settings}
            sync={sync}
            onRestoreStores={atlasActions.restoreStores}
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
            sync={sync}
            onSettingsChange={updateLocalSettings}
            onDispatchTargetChange={atlasActions.updateDispatchTarget}
            onCalibrationProgressChange={atlasActions.updateCalibrationProgress}
            onCalibrationAudit={atlasActions.recordCalibrationAudit}
            onCredentialReferenceSave={atlasActions.saveCredentialReference}
            onCredentialReferenceDelete={(referenceId) =>
              removeCredentialReference(referenceId, settings.operatorLabel)
            }
            onApplyCalibrationImport={atlasActions.applyCalibrationImport}
            onCreateSnapshot={atlasActions.createSnapshot}
            onDeleteSnapshot={removeSnapshot}
            onRestoreSnapshot={atlasActions.restoreSnapshot}
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
            onSelectProject={atlasActions.selectProject}
            onStartDeploySession={createDeploySession}
            onDeploymentArtifactChange={updateDeploymentArtifact}
            onRunDispatchPreflight={atlasActions.runDispatchPreflight}
            preflightRunningTargetId={preflightRunningTargetId}
            onRunHostInspection={atlasActions.runHostInspection}
            onRunHostInspections={atlasActions.runHostInspections}
            hostInspectionRunningTargetIds={hostInspectionRunningTargetIds}
            onRunVerificationChecks={atlasActions.runDeploymentVerification}
            verificationRunningTargetIds={verificationRunningTargetIds}
            onRunQueueEvidenceSweep={atlasActions.runQueueEvidenceSweep}
            queueEvidenceSweepRunning={queueEvidenceSweepRunning}
            onCreateReadinessReport={atlasActions.createReadinessReport}
          />
            )}
          </Suspense>
        </AppViewBoundary>

        {selectedRecord ? (
          <AppViewBoundary viewKey={`project-${selectedRecord.project.id}`} title="Project detail">
            <ProjectDetail
              record={selectedRecord}
              dispatch={dispatch}
              planning={planning}
              reports={reports}
              review={review}
              credentialReferences={calibration.credentialReferences}
              writingDrafts={writing.drafts}
              timelineEvents={timelineEvents.filter(
                (event) => event.projectId === selectedRecord.project.id,
              )}
              onManualChange={atlasActions.updateManualState}
              onDispatchTargetChange={atlasActions.updateDispatchTarget}
              onDispatchReadinessChange={atlasActions.updateDispatchReadiness}
              onDispatchAutomationReadinessChange={atlasActions.updateDispatchAutomationReadiness}
              onDeploymentArtifactChange={updateDeploymentArtifact}
              onDeploymentPreservePathChange={updateDeploymentPreservePath}
              onDeploymentVerificationCheckChange={updateDeploymentVerificationCheck}
              onRecoveryPlanChange={(targetId: string, update: Partial<DispatchRecoveryPlan>) =>
                updateRecoveryPlan(targetId, update)
              }
              onStartDeploySession={createDeploySession}
              onDeploySessionChange={(
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
              ) => updateDeploySessionFields(sessionId, update)}
              onDeploySessionStepChange={(
                sessionId: string,
                stepId: string,
                update: Partial<Pick<DispatchDeploySessionStep, 'status' | 'notes' | 'evidence'>>,
              ) => updateDeploySessionStepFields(sessionId, stepId, update)}
              onRecordManualDeployment={recordManualDeployment}
              onAttachDeploySessionEvidence={(
                sessionId: string,
                stepKind: DispatchDeploySessionStepKind,
                label: string,
                detail: string,
              ) => attachDeploySessionEvidence(sessionId, stepKind, label, detail)}
              onApplyDeploySessionPreset={(
                sessionId: string,
                presetId: DeploySessionChecklistPresetId,
              ) => applyDeploySessionPreset(sessionId, presetId)}
              onHostEvidenceRunAdd={(run: DispatchHostEvidenceRun) => addHostEvidenceRun(run)}
              onVerificationEvidenceRunAdd={(run: DispatchVerificationEvidenceRun) =>
                addVerificationEvidenceRun(run)
              }
              onRunDispatchPreflight={atlasActions.runDispatchPreflight}
              preflightRunningTargetId={preflightRunningTargetId}
              onRepositoryUnbind={atlasActions.unbindRepository}
              onVerificationCadenceChange={atlasActions.updateVerificationCadence}
              onMarkVerified={atlasActions.markVerified}
              onWritingRequest={atlasActions.requestWriting}
              onOpenWritingDraft={atlasActions.selectWritingDraft}
              onOpenPlanning={atlasActions.openPlanning}
              onOpenReview={() => atlasActions.openReview(selectedRecord.project.id)}
              onAddReviewNote={addReviewNote}
              onResetWorkspace={() => {
                resetWorkspace()
              }}
            />
          </AppViewBoundary>
        ) : null}
      </div>

      <footer className="integration-footer">
        <div>
          <strong>GitHub local API boundary</strong>
          <span>{githubIngestionContract.command}</span>
        </div>
        <p>
          Read-only GitHub data is fetched through <code>/api/github</code>; manual Atlas status
          remains the source of truth.
        </p>
      </footer>
    </main>
  )
}

export default App
