import { lazy, Suspense } from 'react'
import './App.css'
import { findProjectRecord } from './domain/atlas'
import { useAtlasDerivedState } from './hooks/useAtlasDerivedState'
import { useAtlasShellState } from './hooks/useAtlasShellState'
import { useLocalDispatch } from './hooks/useLocalDispatch'
import { useLocalCalibration } from './hooks/useLocalCalibration'
import { useLocalOptimization } from './hooks/useLocalOptimization'
import { useLocalPlanning } from './hooks/useLocalPlanning'
import { useLocalRepoOperations } from './hooks/useLocalRepoOperations'
import { useLocalRepoWorkflowRuns } from './hooks/useLocalRepoWorkflowRuns'
import { useLocalReports } from './hooks/useLocalReports'
import { useLocalReview } from './hooks/useLocalReview'
import { useLocalSettings } from './hooks/useLocalSettings'
import { useLocalSync } from './hooks/useLocalSync'
import { useLocalWriting } from './hooks/useLocalWriting'
import { useLocalWorkspace } from './hooks/useLocalWorkspace'
import { githubIngestionContract } from './services/githubIntegration'
import { createAtlasActions } from './services/atlasActions'
import { AtlasTopBar } from './routes/AtlasTopBar'
import { AtlasViewTabs } from './routes/AtlasViewTabs'

const AppRouteRenderer = lazy(() =>
  import('./routes/AppRouteRenderer').then((module) => ({ default: module.AppRouteRenderer })),
)
const ProjectInspectorRoute = lazy(() =>
  import('./routes/ProjectInspectorRoute').then((module) => ({
    default: module.ProjectInspectorRoute,
  })),
)

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
    promoteNote: promotePlanningNote,
  } = useLocalPlanning()
  const {
    optimization,
    setOptimization,
    importSnapshot: importOptimizationSnapshot,
  } = useLocalOptimization()
  const {
    repoOperations,
    importSnapshot: importRepoOperationsSnapshot,
    updateFilters: updateRepoOperationsFilters,
    recordPlanningLink: recordRepoOperationsPlanningLink,
  } = useLocalRepoOperations()
  const { repoWorkflowRuns, recordWorkflowRun } = useLocalRepoWorkflowRuns()
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
  const {
    projectRecords,
    calibrationIssues,
    timelineEvents,
    dataIntegrityDiagnostics,
    repoOperationsRows,
  } = useAtlasDerivedState({
    workspace,
    dispatch,
    calibration,
    sync,
    writing,
    planning,
    optimization,
    reports,
    review,
    repoOperations,
    repoWorkflowRuns,
  })
  const shellState = useAtlasShellState(projectRecords)
  const {
    selectedProjectId,
    setSelectedProjectId,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    sectionFilter,
    setSectionFilter,
    appView,
    setAppView,
    projectInspectorOpen,
    updateProjectInspectorOpen,
    selectedWritingTemplate,
    setSelectedWritingTemplate,
    selectedWritingDraftId,
    setSelectedWritingDraftId,
    preflightRunningTargetId,
    setPreflightRunningTargetId,
    hostInspectionRunningTargetIds,
    setHostInspectionRunningTargetIds,
    verificationRunningTargetIds,
    setVerificationRunningTargetIds,
    queueEvidenceSweepRunning,
    setQueueEvidenceSweepRunning,
  } = shellState
  const selectedRecord =
    findProjectRecord(workspace, selectedProjectId) ?? projectRecords[0]

  const selectProjectAndOpenInspector = (value: Parameters<typeof setSelectedProjectId>[0]) => {
    updateProjectInspectorOpen(true)
    setSelectedProjectId(value)
  }
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
    optimization,
    setOptimization,
    reports,
    setReports,
    addReportPacket,
    review,
    setReview,
    calibrationIssues,
    setSelectedProjectId: selectProjectAndOpenInspector,
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
      <AtlasTopBar
        projectCount={projectRecords.length}
        selectedRecord={selectedRecord}
        inspectorOpen={projectInspectorOpen}
        onInspectorToggle={() => updateProjectInspectorOpen(!projectInspectorOpen)}
      />

      <AtlasViewTabs appView={appView} onViewChange={setAppView} />

      <div
        className={`app-layout ${
          projectInspectorOpen ? 'is-inspector-open' : 'is-inspector-closed'
        }`}
      >
        <Suspense
          fallback={
            <div className="surface-state surface-state-loading">
              <strong>Loading Atlas view</strong>
              <span>Atlas is loading this operator surface.</span>
            </div>
          }
        >
          <AppRouteRenderer
            appView={appView}
            workspace={workspace}
            projectRecords={projectRecords}
            selectedRecord={selectedRecord}
            dispatch={dispatch}
            settings={settings}
            calibration={calibration}
            sync={sync}
            writing={writing}
            planning={planning}
            optimization={optimization}
            repoOperations={repoOperations}
            repoWorkflowRuns={repoWorkflowRuns}
            reports={reports}
            review={review}
            calibrationIssues={calibrationIssues}
            timelineEvents={timelineEvents}
            dataIntegrityDiagnostics={dataIntegrityDiagnostics}
            repoOperationsRows={repoOperationsRows}
            query={query}
            statusFilter={statusFilter}
            sectionFilter={sectionFilter}
            selectedWritingTemplate={selectedWritingTemplate}
            selectedWritingDraftId={selectedWritingDraftId}
            preflightRunningTargetId={preflightRunningTargetId}
            hostInspectionRunningTargetIds={hostInspectionRunningTargetIds}
            verificationRunningTargetIds={verificationRunningTargetIds}
            queueEvidenceSweepRunning={queueEvidenceSweepRunning}
            actions={atlasActions}
            onQueryChange={setQuery}
            onStatusFilterChange={setStatusFilter}
            onSectionFilterChange={setSectionFilter}
            onViewChange={setAppView}
            onSelectedWritingTemplateChange={setSelectedWritingTemplate}
            importOptimizationSnapshot={importOptimizationSnapshot}
            importRepoOperationsSnapshot={importRepoOperationsSnapshot}
            updateRepoOperationsFilters={updateRepoOperationsFilters}
            recordRepoOperationsPlanningLink={recordRepoOperationsPlanningLink}
            recordWorkflowRun={recordWorkflowRun}
            createPlanningItem={createPlanningItem}
            updatePlanningItem={updatePlanningItem}
            deletePlanningItem={deletePlanningItem}
            promotePlanningNote={promotePlanningNote}
            addReviewSession={addReviewSession}
            addReviewNote={addReviewNote}
            saveReviewFilter={saveReviewFilter}
            deleteReviewFilter={deleteReviewFilter}
            addReportPacket={addReportPacket}
            updateReportPacketMarkdown={updateReportPacketMarkdown}
            recordReportCopied={recordReportCopied}
            markReportExported={markReportExported}
            archiveReportPacket={archiveReportPacket}
            updateDraftText={updateDraftText}
            updateDraftNotes={updateDraftNotes}
            recordProviderSuggestion={recordProviderSuggestion}
            applyProviderSuggestion={applyProviderSuggestion}
            markReviewed={markReviewed}
            approveDraft={approveDraft}
            recordCopied={recordCopied}
            markExported={markExported}
            archiveDraft={archiveDraft}
            updateLocalSettings={updateLocalSettings}
            removeCredentialReference={removeCredentialReference}
            removeSnapshot={removeSnapshot}
            updateProvider={updateProvider}
            recordRemoteSnapshots={recordRemoteSnapshots}
            recordRemotePush={recordRemotePush}
            removeRemoteSnapshot={removeRemoteSnapshot}
            createDeploySession={createDeploySession}
            updateDeploymentArtifact={updateDeploymentArtifact}
          />

          {projectInspectorOpen ? (
            <ProjectInspectorRoute
              selectedRecord={selectedRecord}
              dispatch={dispatch}
              planning={planning}
              reports={reports}
              review={review}
              credentialReferences={calibration.credentialReferences}
              writingDrafts={writing.drafts}
              timelineEvents={timelineEvents}
              actions={atlasActions}
              resetWorkspace={resetWorkspace}
              updateDeploymentArtifact={updateDeploymentArtifact}
              updateDeploymentPreservePath={updateDeploymentPreservePath}
              updateDeploymentVerificationCheck={updateDeploymentVerificationCheck}
              updateRecoveryPlan={updateRecoveryPlan}
              createDeploySession={createDeploySession}
              updateDeploySessionFields={updateDeploySessionFields}
              updateDeploySessionStepFields={updateDeploySessionStepFields}
              recordManualDeployment={recordManualDeployment}
              attachDeploySessionEvidence={attachDeploySessionEvidence}
              applyDeploySessionPreset={applyDeploySessionPreset}
              addHostEvidenceRun={addHostEvidenceRun}
              addVerificationEvidenceRun={addVerificationEvidenceRun}
              addReviewNote={addReviewNote}
              preflightRunningTargetId={preflightRunningTargetId}
            />
          ) : null}
        </Suspense>
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
