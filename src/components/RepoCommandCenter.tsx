import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  FileJson,
  GitBranch,
  GitCommitHorizontal,
  Link2,
  NotebookPen,
  RefreshCcw,
  Search,
  UploadCloud,
} from 'lucide-react'
import { useMemo, useState, type ChangeEvent } from 'react'
import type { ProjectRecord } from '../domain/atlas'
import type { RepoWorkflowCommand, RepoWorkflowRun } from '../domain/repoWorkflowRuns'
import type {
  RepoOperationsFilters,
  RepoOperationsSnapshot,
  RepoOperationsState,
} from '../domain/repoOperations'
import { useGithubCommandSummaries } from '../hooks/useGithubCommandSummaries'
import {
  deriveRepoOperationsRows,
  filterRepoOperationsRows,
  parseRepoOperationsSnapshotJson,
  repoOperationsPlanningDetail,
  repoOperationsSourceLink,
  summarizeRepoOperationRows,
  type RepoOperationsGap,
  type RepoOperationsRow,
} from '../services/repoOperations'
import type { PlanningItemKind, PlanningSourceLink } from '../domain/planning'
import {
  fetchDefaultRepoOperationsSnapshot,
  runLocalGitWorkflow,
} from '../services/localGit'

interface RepoCommandCenterProps {
  repoOperations: RepoOperationsState
  projectRecords: ProjectRecord[]
  onImportSnapshot: (snapshot: RepoOperationsSnapshot) => void
  onUpdateFilters: (filters: Partial<RepoOperationsFilters>) => void
  onCreatePlanningItem: (input: {
    kind: PlanningItemKind
    record: ProjectRecord
    title: string
    detail: string
    sourceLinks?: PlanningSourceLink[]
    status?: 'planned'
  }) => string | void
  onRecordPlanningLink: (input: {
    repositoryId: string
    projectId: string
    planningItemId: string
    kind: 'note' | 'work-session'
  }) => void
  repoWorkflowRuns: RepoWorkflowRun[]
  onRecordWorkflowRun: (run: RepoWorkflowRun) => void
  onSelectProject: (projectId: string) => void
  onOpenPlanning: (projectId: string) => void
}

const GAP_LABELS: Array<{ id: 'all' | RepoOperationsGap; label: string }> = [
  { id: 'all', label: 'All gaps' },
  { id: 'dirty-local-clone', label: 'Dirty local clone' },
  { id: 'behind-upstream', label: 'Behind upstream' },
  { id: 'missing-local-clone', label: 'Missing local clone' },
  { id: 'missing-github-binding', label: 'Missing GitHub binding' },
  { id: 'missing-verification-command', label: 'Missing verification command' },
  { id: 'missing-planning-follow-up', label: 'Missing Planning follow-up' },
  { id: 'failed-workflow-run', label: 'Failed workflow run' },
  { id: 'stale-verification', label: 'Stale verification' },
  { id: 'never-run-verification', label: 'Never-run verification' },
]

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right))
}

function repoKey(row: RepoOperationsRow) {
  return `${row.repository.githubOwner}/${row.repository.githubRepo}`
}

function gapLabel(gap: RepoOperationsGap) {
  return GAP_LABELS.find((item) => item.id === gap)?.label ?? gap
}

function rowState(row: RepoOperationsRow) {
  if (
    row.gaps.some((gap) =>
      ['dirty-local-clone', 'behind-upstream', 'failed-workflow-run'].includes(gap),
    )
  ) {
    return 'danger'
  }

  if (row.gaps.length > 0) {
    return 'warning'
  }

  return 'ok'
}

function RepoCard({
  row,
  onRunWorkflow,
  onCreatePlanningHandoff,
  onOpenPlanning,
  onSelectProject,
}: {
  row: RepoOperationsRow
  onRunWorkflow: (
    row: RepoOperationsRow,
    command: RepoWorkflowCommand,
    confirmation?: string,
  ) => Promise<void>
  onCreatePlanningHandoff: (row: RepoOperationsRow, kind: 'note' | 'work-session') => void
  onOpenPlanning: (projectId: string) => void
  onSelectProject: (projectId: string) => void
}) {
  const state = rowState(row)
  const [pullConfirmation, setPullConfirmation] = useState('')
  const [runningLabel, setRunningLabel] = useState('')
  const canRun = Boolean(row.repository.githubOwner && row.repository.githubRepo)

  async function run(command: RepoWorkflowCommand, confirmation?: string) {
    setRunningLabel(command.command ?? command.kind)

    try {
      await onRunWorkflow(row, command, confirmation)
    } finally {
      setRunningLabel('')
    }
  }

  return (
    <article className={`repo-ops-card repo-ops-card-${state}`}>
      <div className="repo-ops-card-heading">
        <div>
          <h2>{row.repository.name}</h2>
          <span>
            {row.repository.suite} / {row.repository.product}
          </span>
        </div>
        <div className={`github-command-card-state command-${state === 'danger' ? 'danger' : state}`}>
          {state === 'ok' ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}
          <span>{state === 'ok' ? 'No loaded gaps' : `${row.gaps.length} gap(s)`}</span>
        </div>
      </div>

      <div className="github-repo-facts">
        <div>
          <span>Registry</span>
          <strong>
            {row.repository.lifecycle} / {row.repository.deployCategory || 'deploy model unset'}
          </strong>
        </div>
        <div>
          <span>GitHub</span>
          <strong>{repoKey(row)}</strong>
        </div>
        <div>
          <span>Local Git</span>
          <strong>{row.localStatusLabel}</strong>
        </div>
        <div>
          <span>Latest Commit</span>
          <strong>{row.latestCommitLabel}</strong>
        </div>
        <div>
          <span>Verify</span>
          <strong>{row.verificationLabel}</strong>
        </div>
        <div>
          <span>Atlas Project</span>
          <strong>{row.boundProject?.project.name ?? 'Not bound'}</strong>
        </div>
      </div>

      {row.gaps.length > 0 ? (
        <ul className="repo-ops-gap-list">
          {row.gaps.map((gap) => (
            <li key={gap}>{gapLabel(gap)}</li>
          ))}
        </ul>
      ) : null}

      {row.repository.verificationCommands.length > 0 ? (
        <div className="repo-ops-command-list" aria-label={`${row.repository.name} commands`}>
          {row.repository.verificationCommands.map((command) => (
            <div key={command} className="repo-ops-command-row">
              <code>{command}</code>
              <button
                type="button"
                disabled={!canRun || Boolean(runningLabel)}
                onClick={() => run({ kind: 'verify-command', command })}
              >
                {runningLabel === command ? 'Running' : 'Run verify'}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <div className="repo-ops-runner" aria-label={`${row.repository.name} safe workflow runner`}>
        <div className="repo-ops-runner-actions">
          <button
            type="button"
            disabled={!canRun || Boolean(runningLabel)}
            onClick={() => run({ kind: 'git-fetch-prune' })}
          >
            <RefreshCcw size={14} />
            {runningLabel === 'git-fetch-prune' ? 'Fetching' : 'Fetch'}
          </button>
          <label>
            <span>Pull confirmation</span>
            <input
              value={pullConfirmation}
              onChange={(event) => setPullConfirmation(event.target.value)}
              placeholder={`PULL ${repoKey(row)}`}
            />
          </label>
          <button
            type="button"
            disabled={!canRun || Boolean(runningLabel)}
            onClick={() => run({ kind: 'git-pull-ff-only' }, pullConfirmation)}
          >
            {runningLabel === 'git-pull-ff-only' ? 'Pulling' : 'Pull FF'}
          </button>
        </div>
        {row.latestWorkflowRun ? (
          <div className={`repo-ops-run-status repo-ops-run-status-${row.latestWorkflowRun.status}`}>
            <strong>
              {row.latestWorkflowRun.commandLabel}: {row.latestWorkflowRun.status}
            </strong>
            <span>
              {new Date(row.latestWorkflowRun.endedAt).toLocaleString()} / exit{' '}
              {row.latestWorkflowRun.exitCode ?? 'n/a'}
            </span>
            {row.latestWorkflowRun.diagnostic ? <p>{row.latestWorkflowRun.diagnostic}</p> : null}
            {row.latestWorkflowRun.outputExcerpt ? <pre>{row.latestWorkflowRun.outputExcerpt}</pre> : null}
          </div>
        ) : (
          <div className="repo-ops-run-status">
            <span>No Atlas workflow run recorded yet.</span>
          </div>
        )}
      </div>

      <div className="github-card-actions">
        {row.boundProject ? (
          <>
            <button type="button" onClick={() => onSelectProject(row.boundProject!.project.id)}>
              <Link2 size={14} />
              Open project
            </button>
            <button
              type="button"
              onClick={() => onCreatePlanningHandoff(row, 'note')}
            >
              <NotebookPen size={14} />
              {row.latestWorkflowRun?.status === 'failed' ? 'Failed-run note' : 'Planning note'}
            </button>
            <button
              type="button"
              onClick={() => onCreatePlanningHandoff(row, 'work-session')}
            >
              <ClipboardList size={14} />
              Work session
            </button>
            <button type="button" onClick={() => onOpenPlanning(row.boundProject!.project.id)}>
              Planning
            </button>
          </>
        ) : (
          <button type="button" disabled>
            Bind before Planning handoff
          </button>
        )}
      </div>
    </article>
  )
}

export function RepoCommandCenter({
  repoOperations,
  projectRecords,
  onImportSnapshot,
  onUpdateFilters,
  onCreatePlanningItem,
  onRecordPlanningLink,
  repoWorkflowRuns,
  onRecordWorkflowRun,
  onSelectProject,
  onOpenPlanning,
}: RepoCommandCenterProps) {
  const [message, setMessage] = useState('')
  const [defaultSnapshotLoading, setDefaultSnapshotLoading] = useState(false)
  const selectedSnapshot = repoOperations.snapshots.find(
    (snapshot) => snapshot.id === repoOperations.selectedSnapshotId,
  )
  const repoKeys = useMemo(
    () =>
      selectedSnapshot
        ? selectedSnapshot.repositories
            .map((repository) =>
              repository.githubOwner && repository.githubRepo
                ? `${repository.githubOwner}/${repository.githubRepo}`
                : '',
            )
            .filter(Boolean)
        : [],
    [selectedSnapshot],
  )
  const commandSummaries = useGithubCommandSummaries(repoKeys)
  const rows = useMemo(
    () =>
      deriveRepoOperationsRows({
        state: repoOperations,
        projectRecords,
        commandSummaries: commandSummaries.data,
        workflowRuns: repoWorkflowRuns,
      }),
    [commandSummaries.data, projectRecords, repoOperations, repoWorkflowRuns],
  )
  const filteredRows = useMemo(
    () => filterRepoOperationsRows(rows, repoOperations.filters),
    [repoOperations.filters, rows],
  )
  const summary = useMemo(() => summarizeRepoOperationRows(rows), [rows])
  const suites = useMemo(
    () => unique(rows.map((row) => row.repository.suite)),
    [rows],
  )
  const lifecycles = useMemo(
    () => unique(rows.map((row) => row.repository.lifecycle)),
    [rows],
  )

  async function importSnapshot(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) {
      return
    }

    const result = parseRepoOperationsSnapshotJson(await file.text())

    if (!result.ok || !result.snapshot) {
      setMessage(result.errors.join(' '))
      return
    }

    onImportSnapshot(result.snapshot)
    setMessage(`Imported ${result.snapshot.repositories.length} repo operation records.`)
  }

  async function loadDefaultSnapshot() {
    setDefaultSnapshotLoading(true)
    setMessage('')

    try {
      const response = await fetchDefaultRepoOperationsSnapshot()
      const result = parseRepoOperationsSnapshotJson(JSON.stringify(response.snapshot))

      if (!result.ok || !result.snapshot) {
        setMessage('Default repo operations snapshot could not be normalized.')
        return
      }

      onImportSnapshot(result.snapshot)
      setMessage(`Loaded default snapshot with ${result.snapshot.repositories.length} repo records.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Default snapshot load failed.')
    } finally {
      setDefaultSnapshotLoading(false)
    }
  }

  function createPlanningHandoff(row: RepoOperationsRow, kind: 'note' | 'work-session') {
    if (!row.boundProject) {
      return
    }

    const planningItemId =
      onCreatePlanningItem({
        kind,
        record: row.boundProject,
        title:
          kind === 'work-session'
            ? `Repo workflow session: ${row.repository.name}`
            : `Repo workflow follow-up: ${row.repository.name}`,
        detail: repoOperationsPlanningDetail(row),
        status: 'planned',
        sourceLinks: [repoOperationsSourceLink(row.repository)],
      }) || `${row.repository.id}-${kind}-${Date.now()}`

    onRecordPlanningLink({
      repositoryId: row.repository.id,
      projectId: row.boundProject.project.id,
      planningItemId,
      kind,
    })
    onSelectProject(row.boundProject.project.id)
    setMessage(`Planning ${kind === 'note' ? 'note' : 'work session'} created for ${row.repository.name}.`)
  }

  async function runWorkflow(
    row: RepoOperationsRow,
    command: RepoWorkflowCommand,
    confirmation?: string,
  ) {
    setMessage(`Running ${command.command ?? command.kind} for ${row.repository.name}.`)

    try {
      const response = await runLocalGitWorkflow({
        repositoryId: row.repository.id,
        owner: row.repository.githubOwner,
        repo: row.repository.githubRepo,
        command,
        confirmation,
        planningItemId: row.boundProject
          ? repoOperations.planningLinks.find((link) => link.repositoryId === row.repository.id)
              ?.planningItemId
          : undefined,
      })

      if (response.run) {
        onRecordWorkflowRun(response.run)
      }

      setMessage(
        response.run
          ? `${response.run.commandLabel} ${response.run.status} for ${row.repository.name}.`
          : response.error?.message ?? 'Workflow run returned no evidence.',
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Workflow run failed.')
    }
  }

  if (!selectedSnapshot) {
    return (
      <section className="github-intake repo-ops-center">
        <div className="dashboard-header">
          <div>
            <span className="section-label">Repo Operations</span>
            <h1>Repos</h1>
            <p>
              Import the Repo Operations Snapshot v1 packet from agentic-instructions to make Atlas
              the safe command center for Git repos and workflow follow-up.
            </p>
          </div>
          <label className="repo-ops-import">
            <UploadCloud size={15} />
            Import snapshot
            <input
              aria-label="Import Repo Operations Snapshot JSON"
              type="file"
              accept="application/json"
              onChange={importSnapshot}
            />
          </label>
          <button
            className="repo-ops-import"
            type="button"
            disabled={defaultSnapshotLoading}
            onClick={loadDefaultSnapshot}
          >
            <FileJson size={15} />
            {defaultSnapshotLoading ? 'Loading' : 'Load default'}
          </button>
        </div>
        {message ? <div className="github-error">{message}</div> : null}
        <div className="empty-state">
          <FileJson size={20} />
          <span>No repo operations snapshot is imported yet.</span>
        </div>
      </section>
    )
  }

  return (
    <section className="github-intake repo-ops-center">
      <div className="dashboard-header">
        <div>
          <span className="section-label">Repo Operations</span>
          <h1>Repos</h1>
          <p>
            Registry, local Git, and GitHub workflow interpretation. Atlas can run allowlisted
            fetch, fast-forward pull, and repo-owned verification commands with local evidence.
          </p>
        </div>
        <label className="repo-ops-import">
          <UploadCloud size={15} />
          Import snapshot
          <input
            aria-label="Import Repo Operations Snapshot JSON"
            type="file"
            accept="application/json"
            onChange={importSnapshot}
          />
        </label>
        <button
          className="repo-ops-import"
          type="button"
          disabled={defaultSnapshotLoading}
          onClick={loadDefaultSnapshot}
        >
          <FileJson size={15} />
          {defaultSnapshotLoading ? 'Loading' : 'Load default'}
        </button>
      </div>

      <div className="github-command-bands" aria-label="Repo operations summary">
        <div>
          <GitBranch size={16} />
          <strong>{summary.total}</strong>
          <span>Registry repos</span>
        </div>
        <div>
          <Link2 size={16} />
          <strong>{summary.bound}</strong>
          <span>Atlas bindings</span>
        </div>
        <div>
          <AlertTriangle size={16} />
          <strong>{summary.dirty}</strong>
          <span>Dirty clones</span>
        </div>
        <div>
          <RefreshCcw size={16} />
          <strong>{summary.behind}</strong>
          <span>Behind upstream</span>
        </div>
        <div>
          <GitBranch size={16} />
          <strong>{summary.missingClone}</strong>
          <span>Missing local clones</span>
        </div>
        <div>
          <ClipboardList size={16} />
          <strong>{summary.missingVerification}</strong>
          <span>Missing verify</span>
        </div>
        <div>
          <AlertTriangle size={16} />
          <strong>{summary.failedWorkflowRuns}</strong>
          <span>Failed runs</span>
        </div>
        <div>
          <RefreshCcw size={16} />
          <strong>{summary.staleVerification + summary.neverRunVerification}</strong>
          <span>Stale/never verified</span>
        </div>
        <div>
          <NotebookPen size={16} />
          <strong>{summary.needsPlanning}</strong>
          <span>Need Planning</span>
        </div>
      </div>

      <div className="github-source-grid">
        <div className="github-source-state">
          <FileJson size={15} />
          <span>
            {selectedSnapshot.title}: {selectedSnapshot.summary.repoCount} repos from{' '}
            {selectedSnapshot.source}
          </span>
        </div>
        <div className="github-source-state">
          <GitCommitHorizontal size={15} />
          <span>
            GitHub/local status {commandSummaries.loading ? 'loading' : 'loaded'} for{' '}
            {commandSummaries.repoKeys.length} repo keys
          </span>
        </div>
      </div>

      <div className="github-intake-controls repo-ops-controls">
        <label className="search-box">
          <Search size={16} />
          <input
            aria-label="Search repositories"
            value={repoOperations.filters.query}
            onChange={(event) => onUpdateFilters({ query: event.target.value })}
            placeholder="Search repositories"
          />
        </label>
        <div className="repo-tabs" aria-label="Repo operations filters">
          <select
            aria-label="Filter by suite"
            value={repoOperations.filters.suite}
            onChange={(event) => onUpdateFilters({ suite: event.target.value })}
          >
            <option value="all">All suites</option>
            {suites.map((suite) => (
              <option key={suite} value={suite}>
                {suite}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by lifecycle"
            value={repoOperations.filters.lifecycle}
            onChange={(event) => onUpdateFilters({ lifecycle: event.target.value })}
          >
            <option value="all">All lifecycle states</option>
            {lifecycles.map((lifecycle) => (
              <option key={lifecycle} value={lifecycle}>
                {lifecycle}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by repo gap"
            value={repoOperations.filters.gap}
            onChange={(event) => onUpdateFilters({ gap: event.target.value })}
          >
            {GAP_LABELS.map((gap) => (
              <option key={gap.id} value={gap.id}>
                {gap.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {message ? <div className="github-source-state">{message}</div> : null}

      <div className="github-intake-grid" aria-label="Repo operations cards">
        {filteredRows.map((row) => (
          <RepoCard
            key={row.repository.id}
            row={row}
            onRunWorkflow={runWorkflow}
            onCreatePlanningHandoff={createPlanningHandoff}
            onOpenPlanning={onOpenPlanning}
            onSelectProject={onSelectProject}
          />
        ))}
      </div>
    </section>
  )
}
