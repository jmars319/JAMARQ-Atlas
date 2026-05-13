import { useMemo, useState } from 'react'
import {
  ArchiveRestore,
  CalendarCheck,
  ClipboardList,
  DatabaseZap,
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
import { DataCenter } from './components/DataCenter'
import { Dashboard } from './components/Dashboard'
import { DispatchDashboard } from './components/DispatchDashboard'
import { GitHubIntakeDashboard } from './components/GitHubIntakeDashboard'
import { PlanningCenter } from './components/PlanningCenter'
import { ProjectDetail } from './components/ProjectDetail'
import { ReportsCenter } from './components/ReportsCenter'
import { SettingsCenter } from './components/SettingsCenter'
import { TimelineDashboard } from './components/TimelineDashboard'
import { VerificationCenter } from './components/VerificationCenter'
import { WritingWorkbench } from './components/WritingWorkbench'
import {
  findProjectRecord,
  flattenProjects,
  updateProject,
  type GithubRepositoryLink,
  type ManualOperationalState,
  type VerificationCadence,
  type WorkStatus,
} from './domain/atlas'
import type {
  DeploymentTarget,
  DispatchAutomationReadiness,
  DispatchReadiness,
} from './domain/dispatch'
import type { AtlasBackupStores } from './domain/dataPortability'
import type { AtlasSyncCoreStores } from './domain/sync'
import type { WritingDraft, WritingTemplateId } from './domain/writing'
import { useLocalDispatch } from './hooks/useLocalDispatch'
import { useLocalPlanning } from './hooks/useLocalPlanning'
import { useLocalReports } from './hooks/useLocalReports'
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
import { createSyncSnapshot } from './services/syncSnapshots'
import { deriveTimelineEvents } from './services/timeline'
import { markProjectVerified, updateProjectVerificationCadence } from './services/verification'

type StatusFilter = WorkStatus | 'All'
type SectionFilter = string | 'All'
type AppView =
  | 'board'
  | 'timeline'
  | 'github'
  | 'planning'
  | 'reports'
  | 'verification'
  | 'dispatch'
  | 'writing'
  | 'data'
  | 'settings'

function App() {
  const { workspace, setWorkspace, resetWorkspace } = useLocalWorkspace()
  const {
    dispatch,
    setDispatch,
    updateTarget,
    updateReadiness,
    updateAutomationReadiness,
    updateDeploymentArtifact,
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
  const projectRecords = useMemo(() => flattenProjects(workspace), [workspace])
  const timelineEvents = useMemo(
    () => deriveTimelineEvents({ projectRecords, dispatch, writing, planning, reports, sync }),
    [dispatch, planning, projectRecords, reports, sync, writing],
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
    setSettings(stores.settings)
    setSync(stores.sync)
    setSelectedProjectId(flattenProjects(stores.workspace)[0]?.project.id ?? '')
    setSelectedWritingDraftId('')
  }

  function handleCreateSnapshot(label: string, note: string) {
    addSnapshot(
      createSyncSnapshot({
        stores: { workspace, dispatch, writing, planning, reports },
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
            projectRecords={projectRecords}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={selectProject}
          />
        )}

        {selectedRecord ? (
          <ProjectDetail
            record={selectedRecord}
            dispatch={dispatch}
            planning={planning}
            writingDrafts={writing.drafts}
            timelineEvents={timelineEvents.filter(
              (event) => event.projectId === selectedRecord.project.id,
            )}
            onManualChange={updateManualState}
            onDispatchTargetChange={handleDispatchTargetChange}
            onDispatchReadinessChange={handleDispatchReadinessChange}
            onDispatchAutomationReadinessChange={handleDispatchAutomationReadinessChange}
            onDeploymentArtifactChange={updateDeploymentArtifact}
            onRunDispatchPreflight={handleRunDispatchPreflight}
            preflightRunningTargetId={preflightRunningTargetId}
            onRepositoryUnbind={handleUnbindRepository}
            onVerificationCadenceChange={handleVerificationCadenceChange}
            onMarkVerified={handleMarkVerified}
            onWritingRequest={handleWritingRequest}
            onOpenWritingDraft={handleSelectWritingDraft}
            onOpenPlanning={handleOpenPlanning}
            onResetWorkspace={() => {
              resetWorkspace()
            }}
          />
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
