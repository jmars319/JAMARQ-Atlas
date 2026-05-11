import {
  AlertTriangle,
  GitBranch,
  Inbox,
  Link2,
  RefreshCcw,
  Search,
  SquareArrowOutUpRight,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { GithubRepositorySource, GithubRepositorySummary } from '../services/githubIntegration'
import type { ProjectRecord } from '../domain/atlas'
import { formatDateTimeLabel } from '../domain/atlas'
import { useGithubRepositories } from '../hooks/useGithubRepositories'
import { findRepositoryBinding, repositorySummaryToLink } from '../services/repoBinding'
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

function sourceLabel(sources: GithubRepositorySource[]) {
  if (sources.length > 1) {
    return 'Configured + Viewer'
  }

  return sources[0] === 'configured' ? 'Configured' : 'Viewer'
}

interface SourceNoticeProps {
  label: string
  loading: boolean
  error: ReturnType<typeof useGithubRepositories>['error']
  count: number
}

function SourceNotice({ label, loading, error, count }: SourceNoticeProps) {
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
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<IntakeFilter>('all')
  const [targetProjectId, setTargetProjectId] = useState(selectedProjectId)
  const [deepDiveRepo, setDeepDiveRepo] = useState('')

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

  const boundCount = repositories.filter(({ repository }) =>
    findRepositoryBinding(projectRecords, repositorySummaryToLink(repository)),
  ).length
  const unboundCount = repositories.length - boundCount
  const targetProjectExists = projectRecords.some((record) => record.project.id === targetProjectId)
  const bindTarget = targetProjectExists ? targetProjectId : projectRecords[0]?.project.id ?? ''
  const selectedDeepDive =
    repositories.find(({ repository }) => repository.fullName === deepDiveRepo) ?? repositories[0]
  const selectedDeepDiveBinding = selectedDeepDive
    ? findRepositoryBinding(projectRecords, repositorySummaryToLink(selectedDeepDive.repository))
    : null

  return (
    <section className="github-intake" aria-labelledby="github-intake-title">
      <div className="dashboard-header">
        <div>
          <p className="section-label">GitHub Intake</p>
          <h1 id="github-intake-title">Repository Intake</h1>
          <p>
            Discover available repositories, bind them to Atlas projects, or create explicit Inbox
            records for manual triage.
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
            <Inbox size={17} />
            <strong>{unboundCount}</strong>
            <span>Unbound</span>
          </div>
        </div>
      </div>

      <div className="github-source-grid">
        <SourceNotice
          label="Configured repos"
          loading={configuredRepos.loading}
          error={configuredRepos.error}
          count={configuredRepos.data.length}
        />
        <SourceNotice
          label="Viewer repos"
          loading={viewerRepos.loading}
          error={viewerRepos.error}
          count={viewerRepos.data.length}
        />
      </div>

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
            ['viewer', 'Viewer'],
            ['unbound', 'Unbound'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
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
      />

      <div className="github-intake-grid">
        {visibleRepositories.map(({ repository, sources }) => {
          const link = repositorySummaryToLink(repository)
          const binding = findRepositoryBinding(projectRecords, link)

          return (
            <article
              key={repository.fullName}
              className={`github-intake-card ${binding ? 'is-bound' : ''}`}
            >
              <div className="card-topline">
                <span className="resource-pill">{sourceLabel(sources)}</span>
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
            Load more viewer repos
          </button>
        ) : null}
      </div>
    </section>
  )
}
