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
  updateProject,
  type GithubRepositoryLink,
  type ManualOperationalState,
  type VerificationCadence,
  type WorkStatus,
} from './domain/atlas'
import { getRunbookForTarget } from './domain/dispatch'
import type {
  DeploymentTarget,
  DispatchAutomationReadiness,
  DispatchDeploySession,
  DispatchDeploySessionStep,
  DispatchDeploySessionStepKind,
  DispatchHostEvidenceRun,
  DispatchReadiness,
  DispatchVerificationEvidenceRun,
} from './domain/dispatch'
import type { AtlasBackupStores } from './domain/dataPortability'
import type { AtlasSyncCoreStores } from './domain/sync'
import type { WritingDraft, WritingTemplateId } from './domain/writing'
import { useLocalDispatch } from './hooks/useLocalDispatch'
import { useLocalPlanning } from './hooks/useLocalPlanning'
import { useLocalReports } from './hooks/useLocalReports'
import { useLocalReview } from './hooks/useLocalReview'
import { useLocalSettings } from './hooks/useLocalSettings'
import { useLocalSync } from './hooks/useLocalSync'
import { useLocalWriting } from './hooks/useLocalWriting'
import { useLocalWorkspace } from './hooks/useLocalWorkspace'
import { githubIngestionContract, type GithubRepositorySummary } from './services/githubIntegration'
import {
  bindRepositoryToProject,
  createInboxProjectFromRepository,
  repositorySummaryToLink,
  unbindRepositoryFromProject,
} from './services/repoBinding'
import { runDispatchPreflight } from './services/dispatchPreflight'
import { createHostEvidenceRun, createVerificationEvidenceRun } from './services/dispatchEvidence'
import { runDeploymentVerificationChecks } from './services/deployPreflight'
import { requestHostConnectionPreflight } from './services/hostConnection'
import { createReportPacket } from './services/reports'
import { createSyncSnapshot } from './services/syncSnapshots'
import { deriveTimelineEvents } from './services/timeline'
import { markProjectVerified, updateProjectVerificationCadence } from './services/verification'

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
type AppView =
  | 'board'
  | 'timeline'
  | 'github'
  | 'planning'
  | 'reports'
  | 'review'
  | 'verification'
  | 'dispatch'
  | 'writing'
  | 'data'
  | 'settings'

function appViewLabel(view: AppView) {
  const labels: Record<AppView, string> = {
    board: 'Board',
    timeline: 'Timeline',
    github: 'GitHub',
    planning: 'Planning',
    reports: 'Reports',
    review: 'Review',
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
    createDeploySession,
    updateDeploySessionFields,
    updateDeploySessionStepFields,
    recordManualDeployment,
    attachDeploySessionEvidence,
    addHostEvidenceRun,
    addVerificationEvidenceRun,
    addPreflightRun,
  } = useLocalDispatch()
  const { settings, setSettings, updateLocalSettings } = useLocalSettings()
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
  const { review, setReview, addSession: addReviewSession, addNote: addReviewNote } =
    useLocalReview()
  const projectRecords = useMemo(() => flattenProjects(workspace), [workspace])
  const timelineEvents = useMemo(
    () =>
      deriveTimelineEvents({
        projectRecords,
        dispatch,
        writing,
        planning,
        reports,
        review,
        sync,
      }),
    [dispatch, planning, projectRecords, reports, review, sync, writing],
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

  function selectProject(projectId: string) {
    setSelectedProjectId(projectId)
    setSelectedWritingDraftId('')
  }

  function updateManualState(update: Partial<ManualOperationalState>) {
    if (!selectedRecord) {
      return
    }

    setWorkspace((currentWorkspace) =>
      updateProject(currentWorkspace, selectedRecord.project.id, (project) => ({
        ...project,
        manual: {
          ...project.manual,
          ...update,
        },
      })),
    )
  }

  function handleDispatchTargetChange(targetId: string, update: Partial<DeploymentTarget>) {
    updateTarget(targetId, update)
  }

  function handleDispatchReadinessChange(
    targetId: string,
    projectId: string,
    update: Partial<DispatchReadiness>,
  ) {
    updateReadiness(targetId, projectId, update)
  }

  function handleDispatchAutomationReadinessChange(
    targetId: string,
    projectId: string,
    update: Partial<DispatchAutomationReadiness>,
  ) {
    updateAutomationReadiness(targetId, projectId, update)
  }

  async function handleRunDispatchPreflight(targetId: string) {
    const target = dispatch.targets.find((candidate) => candidate.id === targetId)

    if (!target) {
      return
    }

    const record = findProjectRecord(workspace, target.projectId)

    if (!record) {
      return
    }

    setPreflightRunningTargetId(targetId)

    try {
      const run = await runDispatchPreflight({ record, dispatch, target })
      addPreflightRun(run)
    } finally {
      setPreflightRunningTargetId('')
    }
  }

  async function handleRunHostInspection(targetId: string) {
    const target = dispatch.targets.find((candidate) => candidate.id === targetId)

    if (!target) {
      return
    }

    const runbook = getRunbookForTarget(dispatch, target.id)

    setHostInspectionRunningTargetIds((current) =>
      current.includes(targetId) ? current : [...current, targetId],
    )

    try {
      const result = await requestHostConnectionPreflight({
        target,
        preservePaths: runbook?.preservePaths.map((preservePath) => preservePath.path) ?? [],
      })
      addHostEvidenceRun(
        createHostEvidenceRun({
          projectId: target.projectId,
          result,
        }),
      )
    } finally {
      setHostInspectionRunningTargetIds((current) =>
        current.filter((candidate) => candidate !== targetId),
      )
    }
  }

  async function handleRunHostInspections(targetIds: string[]) {
    await Promise.all(targetIds.map((targetId) => handleRunHostInspection(targetId)))
  }

  async function handleRunDeploymentVerification(targetId: string) {
    const target = dispatch.targets.find((candidate) => candidate.id === targetId)
    const runbook = target ? getRunbookForTarget(dispatch, target.id) : undefined

    if (!target || !runbook) {
      return
    }

    setVerificationRunningTargetIds((current) =>
      current.includes(targetId) ? current : [...current, targetId],
    )

    try {
      const evidence = await runDeploymentVerificationChecks({
        target,
        checks: runbook.verificationChecks,
      })
      const run = createVerificationEvidenceRun({
        projectId: target.projectId,
        targetId: target.id,
        runbookId: runbook.id,
        evidence,
      })

      addVerificationEvidenceRun(run)
    } finally {
      setVerificationRunningTargetIds((current) =>
        current.filter((candidate) => candidate !== targetId),
      )
    }
  }

  async function handleRunQueueEvidenceSweep(targetIds: string[]) {
    setQueueEvidenceSweepRunning(true)

    try {
      for (const targetId of targetIds) {
        await handleRunDispatchPreflight(targetId)
        await handleRunHostInspection(targetId)
        await handleRunDeploymentVerification(targetId)
      }
    } finally {
      setQueueEvidenceSweepRunning(false)
    }
  }

  function handleCreateReadinessReport(projectId: string) {
    const packet = createReportPacket({
      type: 'deployment-readiness-packet',
      projectRecords,
      dispatch,
      reports,
      planning,
      writingDrafts: writing.drafts,
      review,
      projectIds: [projectId],
      writingDraftIds: [],
    })

    addReportPacket(packet)
    selectProject(projectId)
    setAppView('reports')
  }

  function handleBindRepository(projectId: string, repository: GithubRepositorySummary) {
    const link = repositorySummaryToLink(repository)
    setWorkspace((currentWorkspace) => bindRepositoryToProject(currentWorkspace, projectId, link))
    selectProject(projectId)
  }

  function handleCreateInboxProject(repository: GithubRepositorySummary) {
    const result = createInboxProjectFromRepository(workspace, repository)
    setWorkspace(result.workspace)
    selectProject(result.projectId)
  }

  function handleUnbindRepository(projectId: string, repository: GithubRepositoryLink) {
    setWorkspace((currentWorkspace) =>
      unbindRepositoryFromProject(currentWorkspace, projectId, repository),
    )
  }

  function handleVerificationCadenceChange(
    projectId: string,
    verificationCadence: VerificationCadence,
  ) {
    setWorkspace((currentWorkspace) =>
      updateProjectVerificationCadence(currentWorkspace, projectId, verificationCadence),
    )
  }

  function handleMarkVerified(projectId: string, note: string) {
    setWorkspace((currentWorkspace) => markProjectVerified(currentWorkspace, projectId, note))
    selectProject(projectId)
  }

  function handleWritingRequest(projectId: string, templateId: WritingTemplateId) {
    setSelectedProjectId(projectId)
    setSelectedWritingTemplate(templateId)
    setSelectedWritingDraftId('')
    setAppView('writing')
  }

  function handleOpenPlanning(projectId: string) {
    selectProject(projectId)
    setAppView('planning')
  }

  function handleOpenReview(projectId?: string) {
    if (projectId) {
      selectProject(projectId)
    }
    setAppView('review')
  }

  function handleCreatePlanningNoteFromReview(projectId: string, title: string, detail: string) {
    const record = findProjectRecord(workspace, projectId)

    if (!record) {
      return
    }

    createPlanningItem({
      kind: 'note',
      record,
      title,
      detail,
      status: 'planned',
    })
  }

  function handleCreateWritingDraft(draft: WritingDraft) {
    addDraft(draft)
    setSelectedProjectId(draft.projectId)
    setSelectedWritingTemplate(draft.templateId)
    setSelectedWritingDraftId(draft.id)
  }

  function handleSelectWritingDraft(draftId: string) {
    const draft = writing.drafts.find((candidate) => candidate.id === draftId)

    if (!draft) {
      return
    }

    setSelectedProjectId(draft.projectId)
    setSelectedWritingTemplate(draft.templateId)
    setSelectedWritingDraftId(draft.id)
    setAppView('writing')
  }

  function handleRestoreStores(stores: AtlasBackupStores) {
    setWorkspace(stores.workspace)
    setDispatch(stores.dispatch)
    setWriting(stores.writing)
    setPlanning(stores.planning)
    setReports(stores.reports)
    setReview(stores.review)
    setSettings(stores.settings)
    setSync(stores.sync)
    setSelectedProjectId(flattenProjects(stores.workspace)[0]?.project.id ?? '')
    setSelectedWritingDraftId('')
  }

  function handleCreateSnapshot(label: string, note: string) {
    addSnapshot(
      createSyncSnapshot({
        stores: { workspace, dispatch, writing, planning, reports, review },
        settings,
        sync,
        label,
        note,
      }),
    )
  }

  function handleRestoreSnapshot(stores: AtlasSyncCoreStores) {
    setWorkspace(stores.workspace)
    setDispatch(stores.dispatch)
    setWriting(stores.writing)
    setPlanning(stores.planning)
    setReports(stores.reports)
    setReview(stores.review)
    setSelectedProjectId(flattenProjects(stores.workspace)[0]?.project.id ?? '')
    setSelectedWritingDraftId('')
  }

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
            onSelectProject={selectProject}
            onQueryChange={setQuery}
            onStatusFilterChange={setStatusFilter}
            onSectionFilterChange={setSectionFilter}
          />
        ) : appView === 'timeline' ? (
          <TimelineDashboard
            events={timelineEvents}
            projectRecords={projectRecords}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={selectProject}
          />
        ) : appView === 'github' ? (
          <GitHubIntakeDashboard
            projectRecords={projectRecords}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={selectProject}
            onBindRepository={handleBindRepository}
            onCreateInboxProject={handleCreateInboxProject}
          />
        ) : appView === 'planning' ? (
          <PlanningCenter
            planning={planning}
            projectRecords={projectRecords}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={selectProject}
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
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={selectProject}
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
            onSelectProject={selectProject}
            onAddReviewSession={addReviewSession}
            onAddReviewNote={addReviewNote}
            onCreatePlanningNote={handleCreatePlanningNoteFromReview}
            onOpenGitHub={() => setAppView('github')}
            onOpenPlanning={handleOpenPlanning}
          />
        ) : appView === 'verification' ? (
          <VerificationCenter
            projectRecords={projectRecords}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={selectProject}
          />
        ) : appView === 'writing' ? (
          <WritingWorkbench
            projectRecords={projectRecords}
            dispatch={dispatch}
            writing={writing}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            selectedTemplateId={selectedWritingTemplate}
            selectedDraftId={selectedWritingDraftId}
            onSelectProject={selectProject}
            onSelectTemplate={setSelectedWritingTemplate}
            onCreateDraft={handleCreateWritingDraft}
            onSelectDraft={handleSelectWritingDraft}
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
            settings={settings}
            sync={sync}
            onRestoreStores={handleRestoreStores}
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
            sync={sync}
            onSettingsChange={updateLocalSettings}
            onDispatchTargetChange={handleDispatchTargetChange}
            onCreateSnapshot={handleCreateSnapshot}
            onDeleteSnapshot={removeSnapshot}
            onRestoreSnapshot={handleRestoreSnapshot}
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
            onSelectProject={selectProject}
            onStartDeploySession={createDeploySession}
            onDeploymentArtifactChange={updateDeploymentArtifact}
            onRunDispatchPreflight={handleRunDispatchPreflight}
            preflightRunningTargetId={preflightRunningTargetId}
            onRunHostInspection={handleRunHostInspection}
            onRunHostInspections={handleRunHostInspections}
            hostInspectionRunningTargetIds={hostInspectionRunningTargetIds}
            onRunVerificationChecks={handleRunDeploymentVerification}
            verificationRunningTargetIds={verificationRunningTargetIds}
            onRunQueueEvidenceSweep={handleRunQueueEvidenceSweep}
            queueEvidenceSweepRunning={queueEvidenceSweepRunning}
            onCreateReadinessReport={handleCreateReadinessReport}
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
              writingDrafts={writing.drafts}
              timelineEvents={timelineEvents.filter(
                (event) => event.projectId === selectedRecord.project.id,
              )}
              onManualChange={updateManualState}
              onDispatchTargetChange={handleDispatchTargetChange}
              onDispatchReadinessChange={handleDispatchReadinessChange}
              onDispatchAutomationReadinessChange={handleDispatchAutomationReadinessChange}
              onDeploymentArtifactChange={updateDeploymentArtifact}
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
              onHostEvidenceRunAdd={(run: DispatchHostEvidenceRun) => addHostEvidenceRun(run)}
              onVerificationEvidenceRunAdd={(run: DispatchVerificationEvidenceRun) =>
                addVerificationEvidenceRun(run)
              }
              onRunDispatchPreflight={handleRunDispatchPreflight}
              preflightRunningTargetId={preflightRunningTargetId}
              onRepositoryUnbind={handleUnbindRepository}
              onVerificationCadenceChange={handleVerificationCadenceChange}
              onMarkVerified={handleMarkVerified}
              onWritingRequest={handleWritingRequest}
              onOpenWritingDraft={handleSelectWritingDraft}
              onOpenPlanning={handleOpenPlanning}
              onOpenReview={() => handleOpenReview(selectedRecord.project.id)}
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
