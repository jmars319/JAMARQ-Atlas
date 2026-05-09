import { useMemo, useState } from 'react'
import { DatabaseZap, GitBranch, PanelRightOpen, Rocket } from 'lucide-react'
import './App.css'
import { Dashboard } from './components/Dashboard'
import { DispatchDashboard } from './components/DispatchDashboard'
import { GitHubIntakeDashboard } from './components/GitHubIntakeDashboard'
import { ProjectDetail } from './components/ProjectDetail'
import {
  findProjectRecord,
  flattenProjects,
  updateProject,
  type GithubRepositoryLink,
  type ManualOperationalState,
  type WorkStatus,
} from './domain/atlas'
import type { DeploymentTarget, DispatchReadiness } from './domain/dispatch'
import { useLocalDispatch } from './hooks/useLocalDispatch'
import { useLocalWorkspace } from './hooks/useLocalWorkspace'
import { createWritingAssistDraft, type AiWritingAction } from './services/aiWritingAssistant'
import { githubIngestionContract, type GithubRepositorySummary } from './services/githubIntegration'
import {
  bindRepositoryToProject,
  createInboxProjectFromRepository,
  repositorySummaryToLink,
  unbindRepositoryFromProject,
} from './services/repoBinding'

type StatusFilter = WorkStatus | 'All'
type SectionFilter = string | 'All'
type AppView = 'board' | 'github' | 'dispatch'

function App() {
  const { workspace, setWorkspace, resetWorkspace } = useLocalWorkspace()
  const { dispatch, updateTarget, updateReadiness } = useLocalDispatch()
  const projectRecords = useMemo(() => flattenProjects(workspace), [workspace])
  const [selectedProjectId, setSelectedProjectId] = useState(
    () => projectRecords[0]?.project.id ?? '',
  )
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All')
  const [sectionFilter, setSectionFilter] = useState<SectionFilter>('All')
  const [appView, setAppView] = useState<AppView>('board')
  const selectedRecord =
    findProjectRecord(workspace, selectedProjectId) ?? projectRecords[0]
  const [aiDraft, setAiDraft] = useState('')

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

  function handleDraftRequest(action: AiWritingAction) {
    if (!selectedRecord) {
      return
    }

    setAiDraft(createWritingAssistDraft(action, selectedRecord.project))
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

  function handleBindRepository(projectId: string, repository: GithubRepositorySummary) {
    const link = repositorySummaryToLink(repository)
    setWorkspace((currentWorkspace) => bindRepositoryToProject(currentWorkspace, projectId, link))
    setSelectedProjectId(projectId)
    setAiDraft('')
  }

  function handleCreateInboxProject(repository: GithubRepositorySummary) {
    const result = createInboxProjectFromRepository(workspace, repository)
    setWorkspace(result.workspace)
    setSelectedProjectId(result.projectId)
    setAiDraft('')
  }

  function handleUnbindRepository(projectId: string, repository: GithubRepositoryLink) {
    setWorkspace((currentWorkspace) =>
      unbindRepositoryFromProject(currentWorkspace, projectId, repository),
    )
    setAiDraft('')
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
            <GitBranch size={15} />
            GitHub-ready
          </span>
          <span>
            <Rocket size={15} />
            Dispatch-ready
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
          className={appView === 'github' ? 'is-selected' : ''}
          onClick={() => setAppView('github')}
        >
          GitHub
        </button>
        <button
          type="button"
          className={appView === 'dispatch' ? 'is-selected' : ''}
          onClick={() => setAppView('dispatch')}
        >
          Dispatch
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
            onSelectProject={(projectId) => {
              setSelectedProjectId(projectId)
              setAiDraft('')
            }}
            onQueryChange={setQuery}
            onStatusFilterChange={setStatusFilter}
            onSectionFilterChange={setSectionFilter}
          />
        ) : appView === 'github' ? (
          <GitHubIntakeDashboard
            projectRecords={projectRecords}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={(projectId) => {
              setSelectedProjectId(projectId)
              setAiDraft('')
            }}
            onBindRepository={handleBindRepository}
            onCreateInboxProject={handleCreateInboxProject}
          />
        ) : (
          <DispatchDashboard
            dispatch={dispatch}
            projectRecords={projectRecords}
            selectedProjectId={selectedRecord?.project.id ?? ''}
            onSelectProject={(projectId) => {
              setSelectedProjectId(projectId)
              setAiDraft('')
            }}
          />
        )}

        {selectedRecord ? (
          <ProjectDetail
            record={selectedRecord}
            aiDraft={aiDraft}
            dispatch={dispatch}
            onManualChange={updateManualState}
            onDispatchTargetChange={handleDispatchTargetChange}
            onDispatchReadinessChange={handleDispatchReadinessChange}
            onRepositoryUnbind={handleUnbindRepository}
            onDraftRequest={handleDraftRequest}
            onResetWorkspace={() => {
              resetWorkspace()
              setAiDraft('')
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
