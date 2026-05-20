import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  GitCommitHorizontal,
  Inbox,
  Lightbulb,
  Link2,
  RefreshCcw,
  Search,
  ShieldAlert,
  SquareArrowOutUpRight,
  Target,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type {
  GithubConnectionState,
  GithubRepositorySource,
  GithubRepositorySummary,
} from '../services/githubIntegration'
import type { ProjectRecord } from '../domain/atlas'
import { formatDateTimeLabel } from '../domain/atlas'
import { useGithubCommandSummaries } from '../hooks/useGithubCommandSummaries'
import { useGithubRepositories } from '../hooks/useGithubRepositories'
import type { GithubRepoCommandSummary } from '../services/githubCommand'
import { deriveAtlasActionIntents } from '../services/actionPlanner'
import { findRepositoryBinding, repositorySummaryToLink } from '../services/repoBinding'
import { deriveRepoPlacementSuggestions } from '../services/repoSuggestions'
import { ActionPlannerPanel } from './ActionPlannerPanel'
import { GitHubCacheMeta } from './GitHubCacheMeta'
import { GitHubRepoDeepDive } from './GitHubRepoDeepDive'

type IntakeFilter = 'all' | GithubRepositorySource | 'unbound'

interface IntakeRepository {
  repository: GithubRepositorySummary
  sources: GithubRepositorySource[]
}

interface GitHubIntakeDashboardProps {
  projectRecords: ProjectRecord[]
  selectedProjectId: string
  onSelectProject: (projectId: string) => void
  onBindRepository: (projectId: string, repository: GithubRepositorySummary) => void
  onCreateInboxProject: (repository: GithubRepositorySummary) => void
}

function mergeRepositories(
  configured: GithubRepositorySummary[],
  viewer: GithubRepositorySummary[],
) {
  const repositories = new Map<string, IntakeRepository>()

  function add(repository: GithubRepositorySummary, source: GithubRepositorySource) {
    const key = repository.fullName.toLowerCase()
    const existing = repositories.get(key)

    if (existing) {
      if (!existing.sources.includes(source)) {
        existing.sources.push(source)
      }
      return
    }

    repositories.set(key, {
      repository,
      sources: [source],
    })
  }

  configured.forEach((repository) => add(repository, 'configured'))
  viewer.forEach((repository) => add(repository, 'viewer'))

  return [...repositories.values()].sort((left, right) =>
    left.repository.fullName.localeCompare(right.repository.fullName),
  )
}

function sourceLabel(sources: GithubRepositorySource[], viewerLabel: string) {
  if (sources.length > 1) {
    return `Configured + ${viewerLabel}`
  }

  return sources[0] === 'configured' ? 'Configured' : viewerLabel
}

function uniqueRepoKeys(repoKeys: string[]) {
  return repoKeys
    .filter(Boolean)
    .filter(
      (repoKey, index, keys) =>
        keys.findIndex((candidate) => candidate.toLowerCase() === repoKey.toLowerCase()) === index,
    )
}

function summaryFor(
  summaries: GithubRepoCommandSummary[],
  fullName: string,
) {
  return summaries.find((summary) => summary.fullName.toLowerCase() === fullName.toLowerCase())
}

function localGitSummaryLabel(summary: GithubRepoCommandSummary) {
  if (summary.localGit.status !== 'available' || !summary.localGit.data) {
    return summary.localGit.status
  }

  const { data } = summary.localGit
  const dirty = data.dirty ? `${data.changedFiles} changed` : 'clean'
  const sync =
    data.ahead !== null && data.behind !== null
      ? `${data.ahead} ahead / ${data.behind} behind`
      : 'upstream unknown'

  return `${data.branch} / ${dirty} / ${sync}`
}

function isRecentlyPushed(repository: GithubRepositorySummary) {
  if (!repository.pushedAt) {
    return false
  }

  const pushedAt = new Date(repository.pushedAt).getTime()

  return Number.isFinite(pushedAt) && Date.now() - pushedAt <= 14 * 86_400_000
}

interface SourceNoticeProps {
  label: string
  loading: boolean
  error: ReturnType<typeof useGithubRepositories>['error']
  count: number
  cacheMetadata: ReturnType<typeof useGithubRepositories>['cacheMetadata']
  page: number
  hasNextPage: boolean
  onReload: () => void
}

function SourceNotice({
  label,
  loading,
  error,
  count,
  cacheMetadata,
  page,
  hasNextPage,
  onReload,
}: SourceNoticeProps) {
  if (loading) {
    return (
      <div className="github-source-state">
        <RefreshCcw size={15} />
        <span>{label} loading...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="github-error">
        <AlertTriangle size={16} />
        <div>
          <strong>{label} unavailable</strong>
          <span>{error.message}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="github-source-state">
      <GitBranch size={15} />
      <span>
        {label}: {count} repos
      </span>
      <GitHubCacheMeta
        metadata={cacheMetadata}
        page={page}
        hasNextPage={hasNextPage}
        onReload={onReload}
        loading={loading}
      />
    </div>
  )
}

export function GitHubIntakeDashboard({
  projectRecords,
  selectedProjectId,
  onSelectProject,
  onBindRepository,
  onCreateInboxProject,
}: GitHubIntakeDashboardProps) {
  const configuredRepos = useGithubRepositories('configured')
  const viewerRepos = useGithubRepositories('viewer')
  const [githubStatus, setGithubStatus] = useState<GithubConnectionState | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<IntakeFilter>('all')
  const [targetProjectId, setTargetProjectId] = useState(selectedProjectId)
  const [deepDiveRepo, setDeepDiveRepo] = useState('')
  const [suggestionTargets, setSuggestionTargets] = useState<Record<string, string>>({})
  const viewerLabel = githubStatus?.authMode === 'github-app-user' ? 'Installed' : 'Viewer'

  useEffect(() => {
    const controller = new AbortController()

    void fetch('/api/github/status', { signal: controller.signal })
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

  return (
    <section className="github-intake" aria-labelledby="github-intake-title">
      <div className="dashboard-header">
        <div>
          <p className="section-label">GitHub Command</p>
          <h1 id="github-intake-title">Command Center</h1>
          <p>
            See which bound or selected repositories need attention, why, and what evidence backs
            the signal. Binding and Inbox import remain explicit manual actions.
          </p>
        </div>
        <div className="dashboard-stats" aria-label="GitHub intake counts">
          <div>
            <GitBranch size={17} />
            <strong>{repositories.length}</strong>
            <span>Repos</span>
          </div>
          <div>
            <Link2 size={17} />
            <strong>{boundCount}</strong>
            <span>Bound</span>
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
          <span>Bound repos</span>
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
                exposes read-only inventory, binding, import, and deep-dive views only.
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
        </div>
      </section>

      <ActionPlannerPanel
        intents={actionIntents}
        loading={commandSummaries.loading}
        error={commandSummaries.error}
        onRefresh={commandSummaries.reload}
      />

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

        <div className="repo-tabs" role="tablist" aria-label="GitHub intake filters">
          {[
            ['all', 'All'],
            ['configured', 'Configured'],
            ['viewer', viewerLabel],
            ['unbound', 'Unbound'],
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
          <span className="sr-only">Target project</span>
          <select
            value={bindTarget}
            onChange={(event) => setTargetProjectId(event.target.value)}
            aria-label="Target project"
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
          <span className="sr-only">Deep dive repository</span>
          <select
            aria-label="Deep dive repository"
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

      <GitHubRepoDeepDive
        repository={selectedDeepDive?.repository ?? null}
        boundProjectName={selectedDeepDiveBinding?.project.name ?? null}
        commandSummary={selectedCommandSummary ?? null}
        commandLoading={commandSummaries.loading}
        commandError={commandSummaries.error}
        commandCacheMetadata={commandSummaries.cacheMetadata}
        onCommandRefresh={commandSummaries.reload}
      />

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
                Deterministic local matches for unbound repos. Atlas will not bind or import until
                you choose an action.
              </p>
            </div>
          </div>
          <span className="resource-pill">{placementSuggestions.length} unbound</span>
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
                          ? `Bind to ${suggestion.suggestedProjectName}`
                          : 'Bind selected project'}
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
            No unbound repositories are available for placement suggestions in the current GitHub
            inventory.
          </p>
        )}
      </section>

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
                  <span>Bound to {binding.project.name}</span>
                </div>
              ) : (
                <div className="github-binding-state is-unbound">
                  <Inbox size={15} />
                  <span>Not bound to Atlas yet</span>
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
                      Bind to selected
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
          intake surface.
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
    </section>
  )
}
