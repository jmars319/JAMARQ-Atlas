import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  RefreshCw,
  SquareArrowOutUpRight,
  Tag,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatDateTimeLabel } from '../domain/atlas'
import { useGithubResource } from '../hooks/useGithubResource'
import type {
  GithubBranch,
  GithubCheckRun,
  GithubCommit,
  GithubDeployment,
  GithubIssue,
  GithubPullRequest,
  GithubRelease,
  GithubRepositorySummary,
  GithubResourceName,
  GithubTag,
  GithubWorkflow,
  GithubWorkflowRun,
} from '../services/githubIntegration'
import { GitHubHealthSummary } from './GitHubHealthSummary'

const deepDiveTabs: Array<{ id: GithubResourceName; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'commits', label: 'Commits' },
  { id: 'pulls', label: 'PRs' },
  { id: 'issues', label: 'Issues' },
  { id: 'workflow-runs', label: 'Runs' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'checks', label: 'Checks' },
  { id: 'releases', label: 'Releases' },
  { id: 'deployments', label: 'Deployments' },
  { id: 'branches', label: 'Branches' },
  { id: 'tags', label: 'Tags' },
]

interface ResourceRow {
  id: string
  title: string
  detail: string
  meta: string[]
  url?: string
}

function splitCommitMessage(message: string) {
  const [title, ...rest] = message.split('\n')

  return {
    title: title || 'Commit',
    detail: rest.join('\n').trim(),
  }
}

function shortSha(value: string) {
  return value.slice(0, 7)
}

function rowsForResource(resource: GithubResourceName, data: unknown): ResourceRow[] {
  if (!Array.isArray(data)) {
    return []
  }

  if (resource === 'commits') {
    return (data as GithubCommit[]).map((commit) => {
      const message = splitCommitMessage(commit.message)

      return {
        id: commit.sha,
        title: message.title,
        detail: message.detail || commit.shortSha,
        meta: [commit.shortSha, commit.author ?? 'unknown author', formatDateTimeLabel(commit.date)],
        url: commit.htmlUrl,
      }
    })
  }

  if (resource === 'pulls') {
    return (data as GithubPullRequest[]).map((pull) => ({
      id: String(pull.id),
      title: `#${pull.number} ${pull.title}`,
      detail: `${pull.head ?? 'head'} into ${pull.base ?? 'base'}`,
      meta: [pull.mergedAt ? 'merged' : pull.state, pull.draft ? 'draft' : '', formatDateTimeLabel(pull.updatedAt)].filter(Boolean),
      url: pull.htmlUrl,
    }))
  }

  if (resource === 'issues') {
    return (data as GithubIssue[]).map((issue) => ({
      id: String(issue.id),
      title: `#${issue.number} ${issue.title}`,
      detail: issue.labels.length > 0 ? issue.labels.join(', ') : 'No labels',
      meta: [issue.state, `${issue.comments} comments`, formatDateTimeLabel(issue.updatedAt)],
      url: issue.htmlUrl,
    }))
  }

  if (resource === 'workflow-runs') {
    return (data as GithubWorkflowRun[]).map((run) => ({
      id: String(run.id),
      title: run.displayTitle || run.name || `Run ${run.runNumber}`,
      detail: `${run.name ?? 'Workflow'} on ${run.branch ?? 'unknown branch'}`,
      meta: [run.conclusion ?? run.status, run.event, formatDateTimeLabel(run.updatedAt)],
      url: run.htmlUrl,
    }))
  }

  if (resource === 'workflows') {
    return (data as GithubWorkflow[]).map((workflow) => ({
      id: String(workflow.id),
      title: workflow.name,
      detail: workflow.path,
      meta: [workflow.state, formatDateTimeLabel(workflow.updatedAt)],
      url: workflow.htmlUrl,
    }))
  }

  if (resource === 'checks') {
    return (data as GithubCheckRun[]).map((check) => ({
      id: String(check.id),
      title: check.name,
      detail: check.app ?? 'GitHub check',
      meta: [check.conclusion ?? check.status, formatDateTimeLabel(check.completedAt ?? check.startedAt)],
      url: check.htmlUrl || check.detailsUrl || undefined,
    }))
  }

  if (resource === 'releases') {
    return (data as GithubRelease[]).map((release) => ({
      id: String(release.id),
      title: release.name ?? release.tagName,
      detail: release.tagName,
      meta: [release.draft ? 'draft' : '', release.prerelease ? 'prerelease' : '', formatDateTimeLabel(release.publishedAt)].filter(Boolean),
      url: release.htmlUrl,
    }))
  }

  if (resource === 'deployments') {
    return (data as GithubDeployment[]).map((deployment) => ({
      id: String(deployment.id),
      title: deployment.environment,
      detail: deployment.description || `${deployment.task} from ${deployment.ref}`,
      meta: [deployment.shortSha, deployment.creator ?? 'unknown creator', formatDateTimeLabel(deployment.updatedAt)],
    }))
  }

  if (resource === 'branches') {
    return (data as GithubBranch[]).map((branch) => ({
      id: branch.name,
      title: branch.name,
      detail: branch.protected ? 'Protected branch' : 'Unprotected branch',
      meta: [shortSha(branch.commitSha), branch.protected ? 'protected' : 'not protected'],
    }))
  }

  if (resource === 'tags') {
    return (data as GithubTag[]).map((tag) => ({
      id: tag.name,
      title: tag.name,
      detail: shortSha(tag.commitSha),
      meta: [tag.zipballUrl ? 'zipball' : '', tag.tarballUrl ? 'tarball' : ''].filter(Boolean),
    }))
  }

  return []
}

function RepoOverview({ repo }: { repo: GithubRepositorySummary | null }) {
  if (!repo) {
    return <p className="empty-state">Repository overview unavailable.</p>
  }

  return (
    <div className="repo-overview-grid">
      <div>
        <span>Visibility</span>
        <strong>{repo.private ? 'Private' : repo.visibility}</strong>
      </div>
      <div>
        <span>Default branch</span>
        <strong>{repo.defaultBranch}</strong>
      </div>
      <div>
        <span>Language</span>
        <strong>{repo.language ?? 'Not set'}</strong>
      </div>
      <div>
        <span>Open issues</span>
        <strong>{repo.openIssuesCount}</strong>
      </div>
      <div>
        <span>Pushed</span>
        <strong>{formatDateTimeLabel(repo.pushedAt)}</strong>
      </div>
      <div>
        <span>Updated</span>
        <strong>{formatDateTimeLabel(repo.updatedAt)}</strong>
      </div>
    </div>
  )
}

function ResourceRows({ rows }: { rows: ResourceRow[] }) {
  if (rows.length === 0) {
    return <p className="empty-state">No GitHub records returned for this resource.</p>
  }

  return (
    <ol className="resource-list">
      {rows.map((row) => (
        <li key={row.id}>
          <div className="resource-icon" aria-hidden="true">
            <GitCommitHorizontal size={15} />
          </div>
          <div>
            <div className="resource-line">
              <strong>{row.title}</strong>
              {row.url ? (
                <a href={row.url} target="_blank" rel="noreferrer" aria-label="Open in GitHub">
                  <SquareArrowOutUpRight size={14} />
                </a>
              ) : null}
            </div>
            <p>{row.detail}</p>
            <div className="resource-meta">
              {row.meta.map((item) => (
                <span key={`${row.id}-${item}`}>{item}</span>
              ))}
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function GitHubRepoDeepDiveContent({
  repository,
  boundProjectName,
}: {
  repository: GithubRepositorySummary
  boundProjectName: string | null
}) {
  const [activeTab, setActiveTab] = useState<GithubResourceName>('overview')
  const [owner] = repository.fullName.split('/')
  const resource = useGithubResource({
    owner,
    repo: repository.name,
    resource: activeTab,
    ref: repository.defaultBranch,
  })
  const rows = useMemo(() => rowsForResource(activeTab, resource.data), [activeTab, resource.data])

  return (
    <section className="github-deep-dive" aria-label="GitHub repo deep dive">
      <div className="resource-panel-header">
        <div>
          <strong>{repository.fullName}</strong>
          <span>
            {boundProjectName ? `Bound to ${boundProjectName}` : 'Unbound repository'} / read-only
            deep dive
          </span>
        </div>
        <a href={repository.htmlUrl} target="_blank" rel="noreferrer" className="load-more">
          <SquareArrowOutUpRight size={15} />
          Open in GitHub
        </a>
      </div>

      <div className="github-deep-summary">
        <div>
          <Boxes size={16} />
          <strong>{repository.visibility}</strong>
          <span>Visibility</span>
        </div>
        <div>
          <GitBranch size={16} />
          <strong>{repository.defaultBranch}</strong>
          <span>Default branch</span>
        </div>
        <div>
          <GitPullRequest size={16} />
          <strong>{repository.openIssuesCount}</strong>
          <span>Open issues</span>
        </div>
        <div>
          <Tag size={16} />
          <strong>{repository.language ?? 'Unknown'}</strong>
          <span>Language</span>
        </div>
      </div>

      <GitHubHealthSummary
        repository={{
          owner,
          name: repository.name,
          defaultBranch: repository.defaultBranch,
        }}
      />

      <div className="repo-tabs" role="tablist" aria-label="GitHub deep dive resources">
        {deepDiveTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'is-selected' : ''}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="resource-panel">
        <div className="resource-panel-header">
          <div>
            <strong>{deepDiveTabs.find((tab) => tab.id === activeTab)?.label}</strong>
            <span>{activeTab === 'overview' ? 'Repository overview' : 'Latest 20 by default'}</span>
          </div>
          <button type="button" onClick={resource.reload} disabled={resource.loading}>
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        {resource.loading && !resource.data ? (
          <p className="empty-state">Loading GitHub data...</p>
        ) : null}

        {resource.error ? (
          <div className="github-error">
            <AlertTriangle size={16} />
            <div>
              <strong>{resource.error.type}</strong>
              <span>{resource.error.message}</span>
            </div>
          </div>
        ) : activeTab === 'overview' ? (
          <RepoOverview repo={resource.data as GithubRepositorySummary | null} />
        ) : (
          <ResourceRows rows={rows} />
        )}

        {resource.hasNextPage && activeTab !== 'overview' ? (
          <button
            type="button"
            className="load-more"
            onClick={resource.loadMore}
            disabled={resource.loading}
          >
            <ChevronDown size={16} />
            {resource.loading ? 'Loading' : 'Load more'}
          </button>
        ) : null}
      </div>

      <p className="empty-state">
        GitHub deep dive is read-only. Permission gaps are scoped to the selected resource and do
        not change Atlas status, Dispatch readiness, or project planning.
      </p>
    </section>
  )
}

export function GitHubRepoDeepDive({
  repository,
  boundProjectName,
}: {
  repository: GithubRepositorySummary | null
  boundProjectName: string | null
}) {
  if (!repository) {
    return (
      <section className="github-deep-dive" aria-label="GitHub repo deep dive">
        <p className="empty-state">No repository is available for deep dive.</p>
      </section>
    )
  }

  return <GitHubRepoDeepDiveContent repository={repository} boundProjectName={boundProjectName} />
}
