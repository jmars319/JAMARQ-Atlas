import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  GitCommitHorizontal,
  Inbox,
  Lightbulb,
  Link2,
  RefreshCcw,
  Rocket,
  Search,
  ShieldAlert,
  SquareArrowOutUpRight,
  Target,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { GithubConnectionState } from '../services/githubIntegration'
import { formatDateTimeLabel } from '../domain/atlas'
import { useGithubCommandSummaries } from '../hooks/useGithubCommandSummaries'
import { useGithubRepositories } from '../hooks/useGithubRepositories'
import { useVercelCommandSummaries } from '../hooks/useVercelCommandSummaries'
import { deriveAtlasActionIntents } from '../services/actionPlanner'
import {
  createGithubIssueDraftFromIntent,
  githubWritePilotReviewNoteInput,
  type GithubWritePilotDraft,
  type GithubWritePilotResult,
} from '../services/githubWritePilot'
import { findRepositoryBinding, repositorySummaryToLink } from '../services/repoBinding'
import { deriveRepoPlacementSuggestions } from '../services/repoSuggestions'
import { createReviewNote } from '../services/review'
import { ActionPlannerPanel } from './ActionPlannerPanel'
import { GitHubRepoDeepDive } from './GitHubRepoDeepDive'
import { GitHubWritePilotDialog } from './GitHubWritePilotDialog'
import {
  deriveVercelReadinessSignals,
  vercelDeploymentLabel,
} from '../services/vercelIntegration'
import { atlasApiUrl } from '../services/apiBase'
import { SourceNotice } from './githubIntake/SourceNotice'
import type { GitHubIntakeDashboardProps, IntakeFilter } from './githubIntake/types'
import {
  isRecentlyPushed,
  localGitSummaryLabel,
  mergeRepositories,
  sourceLabel,
  summaryFor,
  uniqueRepoKeys,
} from './githubIntake/helpers'

export function GitHubIntakeDashboard({
  projectRecords,
  dispatch,
  selectedProjectId,
  onSelectProject,
  onBindRepository,
  onCreateInboxProject,
  onAddReviewNote,
}: GitHubIntakeDashboardProps) {
  const configuredRepos = useGithubRepositories('configured')
  const viewerRepos = useGithubRepositories('viewer')
  const [githubStatus, setGithubStatus] = useState<GithubConnectionState | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<IntakeFilter>('all')
  const [targetProjectId, setTargetProjectId] = useState(selectedProjectId)
  const [deepDiveRepo, setDeepDiveRepo] = useState('')
  const [suggestionTargets, setSuggestionTargets] = useState<Record<string, string>>({})
  const [writeDraft, setWriteDraft] = useState<GithubWritePilotDraft | null>(null)
  const [writeRefreshToken, setWriteRefreshToken] = useState(0)
  const viewerLabel = githubStatus?.authMode === 'github-app-user' ? 'Installed' : 'Viewer'

  useEffect(() => {
    const controller = new AbortController()

    void fetch(atlasApiUrl('/api/github/status'), { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((status: GithubConnectionState | null) => {
        if (status) {
          setGithubStatus(status)
        }
      })
      .catch(() => undefined)

    return () => controller.abort()
  }, [])

  const repositories = useMemo(
    () => mergeRepositories(configuredRepos.data, viewerRepos.data),
    [configuredRepos.data, viewerRepos.data],
  )

  const visibleRepositories = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    return repositories.filter(({ repository, sources }) => {
      const link = repositorySummaryToLink(repository)
      const binding = findRepositoryBinding(projectRecords, link)
      const matchesFilter =
        filter === 'all' ? true : filter === 'unbound' ? !binding : sources.includes(filter)
      const matchesQuery =
        normalizedQuery.length === 0 ||
        repository.fullName.toLowerCase().includes(normalizedQuery) ||
        (repository.description ?? '').toLowerCase().includes(normalizedQuery) ||
        (repository.language ?? '').toLowerCase().includes(normalizedQuery)

      return matchesFilter && matchesQuery
    })
  }, [filter, projectRecords, query, repositories])

  const placementSuggestions = useMemo(
    () =>
      deriveRepoPlacementSuggestions(
        projectRecords,
        repositories.map(({ repository }) => repository),
      ),
    [projectRecords, repositories],
  )

  const boundCount = repositories.filter(({ repository }) =>
    findRepositoryBinding(projectRecords, repositorySummaryToLink(repository)),
  ).length
  const targetProjectExists = projectRecords.some((record) => record.project.id === targetProjectId)
  const bindTarget = targetProjectExists ? targetProjectId : projectRecords[0]?.project.id ?? ''
  const selectedDeepDive =
    repositories.find(({ repository }) => repository.fullName === deepDiveRepo) ?? repositories[0]
  const selectedDeepDiveBinding = selectedDeepDive
    ? findRepositoryBinding(projectRecords, repositorySummaryToLink(selectedDeepDive.repository))
    : null
  const boundRepoKeys = useMemo(
    () =>
      uniqueRepoKeys(
        projectRecords.flatMap((record) =>
          record.project.repositories.map((repository) => `${repository.owner}/${repository.name}`),
        ),
      ),
    [projectRecords],
  )
  const commandRepoKeys = useMemo(
    () =>
      uniqueRepoKeys([
        ...boundRepoKeys,
        selectedDeepDive?.repository.fullName ?? '',
        visibleRepositories[0]?.repository.fullName ?? '',
      ]),
    [boundRepoKeys, selectedDeepDive?.repository.fullName, visibleRepositories],
  )
  const commandSummaries = useGithubCommandSummaries(commandRepoKeys)
  const actionIntents = useMemo(
    () =>
      deriveAtlasActionIntents({
        projectRecords,
        summaries: commandSummaries.data,
      }),
    [commandSummaries.data, projectRecords],
  )
  const selectedCommandSummary = selectedDeepDive
    ? summaryFor(commandSummaries.data, selectedDeepDive.repository.fullName)
    : null
  const selectedVercelTargets = useMemo(
    () =>
      selectedDeepDiveBinding
        ? dispatch.targets.filter(
            (target) =>
              target.projectId === selectedDeepDiveBinding.project.id &&
              target.hostType === 'vercel',
          )
        : [],
    [dispatch.targets, selectedDeepDiveBinding],
  )
  const selectedVercelSummaries = useVercelCommandSummaries(
    selectedVercelTargets.map((target) => target.id),
  )
  const selectedVercelSignals = useMemo(
    () =>
      selectedVercelSummaries.data.flatMap((summary) => {
        const target = selectedVercelTargets.find((candidate) => candidate.id === summary.targetId)

        return deriveVercelReadinessSignals({
          summary,
          target,
          repositoryKeys: selectedDeepDive ? [selectedDeepDive.repository.fullName] : [],
        })
      }),
    [selectedDeepDive, selectedVercelSummaries.data, selectedVercelTargets],
  )
  const attentionSummaries = commandSummaries.data.filter((summary) =>
    ['attention', 'stale', 'unknown'].includes(summary.state),
  )
  const dirtyLocalClones = commandSummaries.data.filter((summary) => summary.localGit.data?.dirty)
  const failedSummaries = commandSummaries.data.filter((summary) =>
    summary.signals.some((signal) => signal.category === 'workflow' || signal.category === 'checks')
      ? summary.signals.some(
          (signal) =>
            ['workflow', 'checks'].includes(signal.category) && signal.severity === 'danger',
        )
      : false,
  )
  const openGithubItems = commandSummaries.data.reduce(
    (total, summary) => total + summary.counts.openPullRequests + summary.counts.openIssues,
    0,
  )
  const recentlyPushed = repositories.filter(({ repository }) => isRecentlyPushed(repository)).length
  const missingLocalClones = commandSummaries.data.filter(
    (summary) => summary.localGit.status === 'not-found',
  )
  const repoSourcesSettled = !configuredRepos.loading && !viewerRepos.loading
  const githubConnectionRequired =
    repoSourcesSettled &&
    repositories.length === 0 &&
    (!githubStatus?.authenticated || Boolean(configuredRepos.error || viewerRepos.error))
  const githubConnectionDetail =
    githubStatus?.message ||
    configuredRepos.error?.message ||
    viewerRepos.error?.message ||
    'Connect GitHub App sign-in or configure a local read token before treating repository counts as product data.'

  function selectProjectBoundRepository(projectId: string) {
    const record = projectRecords.find((candidate) => candidate.project.id === projectId)
    const firstRepository = record?.project.repositories[0]

    if (!firstRepository) {
      return
    }

    const fullName = `${firstRepository.owner}/${firstRepository.name}`
    const loadedRepository = repositories.find(
      ({ repository }) => repository.fullName.toLowerCase() === fullName.toLowerCase(),
    )

    if (!loadedRepository) {
      return
    }

    setFilter('all')
    setQuery(loadedRepository.repository.fullName)
    setDeepDiveRepo(loadedRepository.repository.fullName)
  }

  function handleTargetProjectChange(projectId: string) {
    setTargetProjectId(projectId)
    selectProjectBoundRepository(projectId)
  }

  function handleWriteSuccess(result: GithubWritePilotResult, draft: GithubWritePilotDraft) {
    onAddReviewNote(createReviewNote(githubWritePilotReviewNoteInput(result, draft)))
    setWriteRefreshToken((current) => current + 1)
    commandSummaries.reload()
  }

  return (
    <section className="github-intake" aria-labelledby="github-intake-title">
      <div className="dashboard-header">
        <div>
          <p className="section-label">GitHub Command</p>
          <h1 id="github-intake-title">Command Center</h1>
          <p>
            See which connected or selected repositories need attention, why, and what evidence
            backs the signal. Repo connection and Inbox import remain explicit manual actions.
          </p>
        </div>
        <div className="dashboard-stats" aria-label="GitHub command counts">
          <div>
            <GitBranch size={17} />
            <strong>{repositories.length}</strong>
            <span>{githubConnectionRequired ? 'Connection required' : 'Repos'}</span>
          </div>
          <div>
            <Link2 size={17} />
            <strong>{boundCount}</strong>
            <span>Connected</span>
          </div>
          <div>
            <ShieldAlert size={17} />
            <strong>{attentionSummaries.length}</strong>
            <span>Attention</span>
          </div>
        </div>
      </div>

      <div className="github-command-bands" aria-label="GitHub command bands">
        <div>
          <ShieldAlert size={16} />
          <strong>{attentionSummaries.length}</strong>
          <span>Attention needed</span>
        </div>
        <div>
          <Link2 size={16} />
          <strong>{boundCount}</strong>
          <span>Connected repos</span>
        </div>
        <div>
          <GitBranch size={16} />
          <strong>{dirtyLocalClones.length}</strong>
          <span>Local dirty clones</span>
        </div>
        <div>
          <CheckCircle2 size={16} />
          <strong>{failedSummaries.length}</strong>
          <span>CI/check failures</span>
        </div>
        <div>
          <AlertTriangle size={16} />
          <strong>{openGithubItems}</strong>
          <span>Open PRs/issues</span>
        </div>
        <div>
          <GitCommitHorizontal size={16} />
          <strong>{recentlyPushed}</strong>
          <span>Recently pushed</span>
        </div>
        <div>
          <Inbox size={16} />
          <strong>{missingLocalClones.length}</strong>
          <span>Missing local clone</span>
        </div>
      </div>

      {githubConnectionRequired ? (
        <section className="github-setup-state" aria-label="GitHub connection required">
          <div>
            <ShieldAlert size={17} />
            <div>
              <strong>Connection required</strong>
              <span>
                0 repositories means Atlas could not read GitHub yet, not that the product has no
                repositories.
              </span>
            </div>
          </div>
          <div className="resource-meta">
            <span>{githubConnectionDetail}</span>
            <span>
              Status:{' '}
              {githubStatus?.authenticated
                ? 'authenticated but no repositories visible'
                : 'sign-in or token required'}
            </span>
            <span>writeControlsEnabled: false</span>
          </div>
        </section>
      ) : null}

      <details className="github-disclosure">
        <summary>
          <span>Connection and permission details</span>
          <strong>
            {viewerLabel} repos: {viewerRepos.data.length} repos / issue comments{' '}
            {githubStatus?.issueCommentPilotEnabled ? 'enabled' : 'locked'}
          </strong>
        </summary>
        <div className="github-source-grid">
          <SourceNotice
            label="Configured repos"
            loading={configuredRepos.loading}
            error={configuredRepos.error}
            count={configuredRepos.data.length}
            cacheMetadata={configuredRepos.cacheMetadata}
            page={configuredRepos.page}
            hasNextPage={configuredRepos.hasNextPage}
            onReload={configuredRepos.reload}
          />
          <SourceNotice
            label={`${viewerLabel} repos`}
            loading={viewerRepos.loading}
            error={viewerRepos.error}
            count={viewerRepos.data.length}
            cacheMetadata={viewerRepos.cacheMetadata}
            page={viewerRepos.page}
            hasNextPage={viewerRepos.hasNextPage}
            onReload={viewerRepos.reload}
          />
        </div>

        <section className="github-suggestion-panel" aria-label="GitHub future controls locked">
          <div className="resource-panel-header">
            <div>
              <AlertTriangle size={17} />
              <div>
                <h2>Future Controls Locked</h2>
                <p>
                  Atlas can request operator-grade GitHub App permissions now, but this checkpoint
                  exposes only the issue/comment write pilot; all broader repo controls stay locked.
                </p>
              </div>
            </div>
            <span className="resource-pill">
              writeControlsEnabled: {String(githubStatus?.writeControlsEnabled ?? false)}
            </span>
          </div>
          <div className="resource-meta">
            {(githubStatus?.permissionPlan ?? []).map((permission) => (
              <span key={permission.key}>
                {permission.label}: {permission.access}
              </span>
            ))}
            <span>
              Issue/comment pilot: {String(githubStatus?.issueCommentPilotEnabled ?? false)}
            </span>
          </div>
        </section>
      </details>

      <div className="github-intake-controls">
        <label className="search-control">
          <Search size={16} />
          <input
            type="search"
            placeholder="Search repositories"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <div className="repo-tabs" role="tablist" aria-label="GitHub repository filters">
          {[
            ['all', 'All'],
            ['configured', 'Configured'],
            ['viewer', viewerLabel],
            ['unbound', 'Unconnected'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={filter === id ? 'is-selected' : ''}
              onClick={() => setFilter(id as IntakeFilter)}
            >
              {label}
            </button>
          ))}
        </div>

        <label className="repo-selector">
          <Link2 size={16} />
          <span>Project</span>
          <select
            value={bindTarget}
            onChange={(event) => handleTargetProjectChange(event.target.value)}
            aria-label="Project to show or connect"
          >
            {projectRecords.map((record) => (
              <option key={record.project.id} value={record.project.id}>
                {record.project.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="github-intake-controls">
        <label className="repo-selector">
          <GitBranch size={16} />
          <span className="sr-only">Selected repository menu</span>
          <select
            aria-label="Selected repository menu"
            value={selectedDeepDive?.repository.fullName ?? ''}
            onChange={(event) => setDeepDiveRepo(event.target.value)}
          >
            {repositories.map(({ repository }) => (
              <option key={repository.fullName} value={repository.fullName}>
                {repository.fullName}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedDeepDive ? (
        <section className="github-connection-panel" aria-label="Selected repository connection">
          <div>
            <Link2 size={17} />
            <div>
              <strong>{selectedDeepDive.repository.fullName}</strong>
              <span>
                {selectedDeepDiveBinding
                  ? `Connected to ${selectedDeepDiveBinding.project.name}`
                  : 'Not connected to an Atlas project yet'}
              </span>
            </div>
          </div>
          {selectedDeepDiveBinding ? (
            <button type="button" onClick={() => onSelectProject(selectedDeepDiveBinding.project.id)}>
              <Link2 size={15} />
              Open connected project
            </button>
          ) : (
            <div className="github-connection-actions">
              <label className="repo-selector">
                <Link2 size={16} />
                <span>Project</span>
                <select
                  value={bindTarget}
                  onChange={(event) => handleTargetProjectChange(event.target.value)}
                  aria-label="Project to connect selected repository to"
                >
                  {projectRecords.map((record) => (
                    <option key={record.project.id} value={record.project.id}>
                      {record.project.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={!bindTarget}
                onClick={() => onBindRepository(bindTarget, selectedDeepDive.repository)}
              >
                <Link2 size={15} />
                Connect repo to project
              </button>
            </div>
          )}
        </section>
      ) : null}

      {selectedDeepDiveBinding ? (
        <section className="github-connection-panel" aria-label="Selected repository deployment evidence">
          <div>
            <Rocket size={17} />
            <div>
              <strong>Deployment evidence</strong>
              <span>
                {selectedVercelTargets.length} Vercel target(s) linked through the connected
                project.
              </span>
            </div>
          </div>
          <div className="resource-meta">
            {selectedVercelSummaries.data.length > 0 ? (
              selectedVercelSummaries.data.map((summary) => (
                <span key={summary.targetId}>
                  {summary.project?.name ?? summary.projectIdOrName ?? summary.targetId}:{' '}
                  {vercelDeploymentLabel(summary.latestProduction)}
                </span>
              ))
            ) : (
              <span>
                {selectedVercelSummaries.loading
                  ? 'Loading Vercel evidence'
                  : 'No Vercel evidence loaded'}
              </span>
            )}
            <span>{selectedVercelSignals.filter((signal) => signal.severity !== 'ok').length} deployment signal(s)</span>
            <span>writeControlsEnabled: false</span>
          </div>
        </section>
      ) : null}

      <GitHubRepoDeepDive
        repository={selectedDeepDive?.repository ?? null}
        boundProjectId={selectedDeepDiveBinding?.project.id ?? null}
        boundProjectName={selectedDeepDiveBinding?.project.name ?? null}
        commandSummary={selectedCommandSummary ?? null}
        commandLoading={commandSummaries.loading}
        commandError={commandSummaries.error}
        commandCacheMetadata={commandSummaries.cacheMetadata}
        onCommandRefresh={commandSummaries.reload}
        onDraftComment={setWriteDraft}
        writeRefreshToken={writeRefreshToken}
      />

      <details className="github-disclosure">
        <summary>
          <span>Action planner</span>
          <strong>{actionIntents.length} advisory actions</strong>
        </summary>
        <ActionPlannerPanel
          intents={actionIntents}
          loading={commandSummaries.loading}
          error={commandSummaries.error}
          onRefresh={commandSummaries.reload}
          onDraftIssue={(intent) => setWriteDraft(createGithubIssueDraftFromIntent(intent))}
        />
      </details>

      <details className="github-disclosure">
        <summary>
          <span>Suggested placement</span>
          <strong>{placementSuggestions.length} unconnected repos</strong>
        </summary>
        <section
          className="github-suggestion-panel"
          aria-label="Suggested repository placement"
        >
          <div className="resource-panel-header">
            <div>
              <Lightbulb size={17} />
              <div>
                <h2>Suggested Placement</h2>
                <p>
                  Deterministic local matches for unconnected repos. Atlas will not connect or
                  import until you choose an action.
                </p>
              </div>
            </div>
            <span className="resource-pill">{placementSuggestions.length} unconnected</span>
          </div>

          {placementSuggestions.length > 0 ? (
            <div className="github-suggestion-list">
            {placementSuggestions.map((suggestion) => {
              const selectedSuggestionTarget =
                suggestionTargets[suggestion.repositoryKey] ??
                suggestion.suggestedProjectId ??
                bindTarget
              const suggestedLabel = suggestion.suggestedProjectName
                ? suggestion.suggestedProjectName
                : [suggestion.suggestedSectionName, suggestion.suggestedGroupName]
                    .filter(Boolean)
                    .join(' / ') || 'Outliers / One-off tools'

              return (
                <article
                  key={suggestion.repositoryKey}
                  className="github-suggestion-card"
                >
                  <div className="github-suggestion-summary">
                    <div>
                      <div className="card-topline">
                        <span className={`confidence-chip confidence-${suggestion.confidence}`}>
                          {suggestion.confidence}
                        </span>
                      </div>
                      <h3>{suggestion.repository.fullName}</h3>
                      <p>{suggestion.repository.description ?? 'No repository description provided.'}</p>
                    </div>

                    <div className="github-suggestion-target">
                      <Target size={16} />
                      <div>
                        <span>Suggested</span>
                        <strong>{suggestedLabel}</strong>
                      </div>
                    </div>
                  </div>

                  <ul className="suggestion-reasons">
                    {suggestion.reasons.map((reason) => (
                      <li key={`${suggestion.repositoryKey}-${reason.type}-${reason.detail}`}>
                        {reason.detail}
                      </li>
                    ))}
                  </ul>

                  <div className="github-suggestion-actions">
                    <label className="repo-selector">
                      <Link2 size={16} />
                      <span className="sr-only">
                        Suggested target for {suggestion.repository.fullName}
                      </span>
                      <select
                        value={selectedSuggestionTarget}
                        onChange={(event) =>
                          setSuggestionTargets((current) => ({
                            ...current,
                            [suggestion.repositoryKey]: event.target.value,
                          }))
                        }
                        aria-label={`Suggested target for ${suggestion.repository.fullName}`}
                      >
                        {projectRecords.map((record) => (
                          <option key={record.project.id} value={record.project.id}>
                            {record.project.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="github-card-actions">
                      <button
                        type="button"
                        disabled={!selectedSuggestionTarget}
                        onClick={() =>
                          onBindRepository(selectedSuggestionTarget, suggestion.repository)
                        }
                      >
                        <Link2 size={15} />
                        {suggestion.suggestedProjectId
                          ? `Connect to ${suggestion.suggestedProjectName}`
                          : 'Connect selected project'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onCreateInboxProject(suggestion.repository)}
                      >
                        <Inbox size={15} />
                        Create Inbox project
                      </button>
                      {suggestion.repository.htmlUrl ? (
                        <a href={suggestion.repository.htmlUrl} target="_blank" rel="noreferrer">
                          <SquareArrowOutUpRight size={15} />
                          GitHub
                        </a>
                      ) : null}
                    </div>
                  </div>
                </article>
              )
            })}
            </div>
          ) : (
            <p className="empty-state">
              No unconnected repositories are available for placement suggestions in the current
              GitHub inventory.
            </p>
          )}
        </section>
      </details>

      <details className="github-disclosure" open={query.trim().length > 0}>
        <summary>
          <span>Repository inventory</span>
          <strong>{visibleRepositories.length} matching repos</strong>
        </summary>
        <div className="github-intake-grid">
          {visibleRepositories.map(({ repository, sources }) => {
            const link = repositorySummaryToLink(repository)
            const binding = findRepositoryBinding(projectRecords, link)
            const commandSummary = summaryFor(commandSummaries.data, repository.fullName)

            return (
              <article
                key={repository.fullName}
                className={`github-intake-card ${binding ? 'is-bound' : ''}`}
              >
              <div className="card-topline">
                <span className="resource-pill">{sourceLabel(sources, viewerLabel)}</span>
                <span className="resource-pill">{repository.visibility}</span>
              </div>

              <div>
                <h2>{repository.fullName}</h2>
                <p>{repository.description ?? 'No repository description provided.'}</p>
              </div>

              <div className="github-repo-facts">
                <div>
                  <span>Language</span>
                  <strong>{repository.language ?? 'Unknown'}</strong>
                </div>
                <div>
                  <span>Default branch</span>
                  <strong>{repository.defaultBranch}</strong>
                </div>
                <div>
                  <span>Pushed</span>
                  <strong>{formatDateTimeLabel(repository.pushedAt)}</strong>
                </div>
                <div>
                  <span>Updated</span>
                  <strong>{formatDateTimeLabel(repository.updatedAt)}</strong>
                </div>
              </div>

              {binding ? (
                <div className="github-binding-state">
                  <Link2 size={15} />
                  <span>Connected to {binding.project.name}</span>
                </div>
              ) : (
                <div className="github-binding-state is-unbound">
                  <Inbox size={15} />
                  <span>Not connected to Atlas yet</span>
                </div>
              )}

              {commandSummary ? (
                <div className={`github-command-card-state command-${commandSummary.severity}`}>
                  <ShieldAlert size={15} />
                  <span>
                    {commandSummary.state} / {localGitSummaryLabel(commandSummary)}
                  </span>
                </div>
              ) : null}

              <div className="github-card-actions">
                {binding ? (
                  <button type="button" onClick={() => onSelectProject(binding.project.id)}>
                    <Link2 size={15} />
                    Open project
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={!bindTarget}
                      onClick={() => onBindRepository(bindTarget, repository)}
                    >
                      <Link2 size={15} />
                      Connect to selected project
                    </button>
                    <button type="button" onClick={() => onCreateInboxProject(repository)}>
                      <Inbox size={15} />
                      Create Inbox project
                    </button>
                  </>
                )}
                {repository.htmlUrl ? (
                  <a href={repository.htmlUrl} target="_blank" rel="noreferrer">
                    <SquareArrowOutUpRight size={15} />
                    GitHub
                  </a>
                ) : null}
              </div>
              </article>
            )
          })}
        </div>

        {visibleRepositories.length === 0 ? (
          <p className="empty-state">
            No repositories match this view. Missing credentials or permission gaps only affect this
            command center view.
          </p>
        ) : null}

        <div className="github-load-actions">
          {configuredRepos.hasNextPage ? (
            <button type="button" className="load-more" onClick={configuredRepos.loadMore}>
              <RefreshCcw size={15} />
              Load more configured repos
            </button>
          ) : null}
          {viewerRepos.hasNextPage ? (
            <button type="button" className="load-more" onClick={viewerRepos.loadMore}>
              <RefreshCcw size={15} />
              Load more {viewerLabel.toLowerCase()} repos
            </button>
          ) : null}
        </div>
      </details>

      <GitHubWritePilotDialog
        draft={writeDraft}
        onClose={() => setWriteDraft(null)}
        onSuccess={handleWriteSuccess}
      />
    </section>
  )
}
