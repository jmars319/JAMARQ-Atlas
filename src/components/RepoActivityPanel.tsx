import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronDown,
  GitCommitHorizontal,
  GitPullRequest,
  PlayCircle,
  RadioTower,
  RefreshCw,
  SquareArrowOutUpRight,
  Tag,
  Workflow,
} from 'lucide-react'
import type { AtlasProject, GithubRepositoryLink } from '../domain/atlas'
import { formatDateTimeLabel } from '../domain/atlas'
import { useGithubResource } from '../hooks/useGithubResource'
import { buildGithubSignals, buildManualSignals } from '../services/automationSignals'
import type {
  GithubCheckRun,
  GithubCommit,
  GithubDeployment,
  GithubIssue,
  GithubPullRequest,
  GithubRelease,
  GithubRepositorySummary,
  GithubResourceName,
  GithubWorkflow,
  GithubWorkflowRun,
} from '../services/githubIntegration'
import { GitHubCacheMeta } from './GitHubCacheMeta'
import { SignalList } from './SignalList'

type RepoTab = {
  id: GithubResourceName
  label: string
}

const repoTabs: RepoTab[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'commits', label: 'Commits' },
  { id: 'pulls', label: 'PRs' },
  { id: 'issues', label: 'Issues' },
  { id: 'workflow-runs', label: 'Actions' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'releases', label: 'Releases' },
  { id: 'deployments', label: 'Deployments' },
  { id: 'checks', label: 'Checks' },
]

interface RepoActivityPanelProps {
  project: AtlasProject
}

function splitCommitMessage(message: string) {
  const [title, ...rest] = message.split('\n')

  return {
    title: title || 'Commit',
    detail: rest.join('\n').trim(),
  }
}

function itemLink(url: string | null | undefined) {
  if (!url) {
    return null
  }

  return (
    <a href={url} target="_blank" rel="noreferrer" aria-label="Open in GitHub">
      <SquareArrowOutUpRight size={14} />
    </a>
  )
}

function StatePill({ value }: { value: string | null }) {
  return <span className={`resource-pill state-${value ?? 'unknown'}`}>{value ?? 'unknown'}</span>
}

function RepoOverview({ repo }: { repo: GithubRepositorySummary | null }) {
  if (!repo) {
    return null
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

function CommitList({ commits }: { commits: GithubCommit[] }) {
  return (
    <ol className="resource-list">
      {commits.map((commit) => {
        const message = splitCommitMessage(commit.message)

        return (
          <li key={commit.sha}>
            <div className="resource-icon" aria-hidden="true">
              <GitCommitHorizontal size={15} />
            </div>
            <div>
              <div className="resource-line">
                <strong>{message.title}</strong>
                {itemLink(commit.htmlUrl)}
              </div>
              <p>{message.detail || commit.shortSha}</p>
              <div className="resource-meta">
                <span>{commit.shortSha}</span>
                <span>{commit.author ?? 'unknown author'}</span>
                <span>{formatDateTimeLabel(commit.date)}</span>
                {commit.verified !== null ? (
                  <span>{commit.verified ? 'verified' : commit.verificationReason ?? 'unverified'}</span>
                ) : null}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function PullList({ pulls }: { pulls: GithubPullRequest[] }) {
  return (
    <ol className="resource-list">
      {pulls.map((pull) => (
        <li key={pull.id}>
          <div className="resource-icon" aria-hidden="true">
            <GitPullRequest size={15} />
          </div>
          <div>
            <div className="resource-line">
              <strong>#{pull.number} {pull.title}</strong>
              {itemLink(pull.htmlUrl)}
            </div>
            <p>
              {pull.head ?? 'head'} into {pull.base ?? 'base'}
            </p>
            <div className="resource-meta">
              <StatePill value={pull.mergedAt ? 'merged' : pull.state} />
              {pull.draft ? <span>draft</span> : null}
              <span>{pull.user ?? 'unknown author'}</span>
              <span>{formatDateTimeLabel(pull.updatedAt)}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function IssueList({ issues }: { issues: GithubIssue[] }) {
  return (
    <ol className="resource-list">
      {issues.map((issue) => (
        <li key={issue.id}>
          <div className="resource-icon" aria-hidden="true">
            <AlertTriangle size={15} />
          </div>
          <div>
            <div className="resource-line">
              <strong>#{issue.number} {issue.title}</strong>
              {itemLink(issue.htmlUrl)}
            </div>
            <p>{issue.labels.length > 0 ? issue.labels.join(', ') : 'No labels'}</p>
            <div className="resource-meta">
              <StatePill value={issue.state} />
              <span>{issue.user ?? 'unknown author'}</span>
              <span>{issue.comments} comments</span>
              <span>{formatDateTimeLabel(issue.updatedAt)}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function WorkflowRunList({ runs }: { runs: GithubWorkflowRun[] }) {
  return (
    <ol className="resource-list">
      {runs.map((run) => (
        <li key={run.id}>
          <div className="resource-icon" aria-hidden="true">
            <PlayCircle size={15} />
          </div>
          <div>
            <div className="resource-line">
              <strong>{run.displayTitle || run.name || `Run ${run.runNumber}`}</strong>
              {itemLink(run.htmlUrl)}
            </div>
            <p>
              {run.name ?? 'Workflow'} on {run.branch ?? 'unknown branch'}
            </p>
            <div className="resource-meta">
              <StatePill value={run.conclusion ?? run.status} />
              <span>{run.event}</span>
              <span>{run.actor ?? 'unknown actor'}</span>
              <span>{formatDateTimeLabel(run.updatedAt)}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function WorkflowList({ workflows }: { workflows: GithubWorkflow[] }) {
  return (
    <ol className="resource-list">
      {workflows.map((workflow) => (
        <li key={workflow.id}>
          <div className="resource-icon" aria-hidden="true">
            <Workflow size={15} />
          </div>
          <div>
            <div className="resource-line">
              <strong>{workflow.name}</strong>
              {itemLink(workflow.htmlUrl)}
            </div>
            <p>{workflow.path}</p>
            <div className="resource-meta">
              <StatePill value={workflow.state} />
              <span>{formatDateTimeLabel(workflow.updatedAt)}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function ReleaseList({ releases }: { releases: GithubRelease[] }) {
  return (
    <ol className="resource-list">
      {releases.map((release) => (
        <li key={release.id}>
          <div className="resource-icon" aria-hidden="true">
            <Tag size={15} />
          </div>
          <div>
            <div className="resource-line">
              <strong>{release.name ?? release.tagName}</strong>
              {itemLink(release.htmlUrl)}
            </div>
            <p>{release.tagName}</p>
            <div className="resource-meta">
              {release.draft ? <span>draft</span> : null}
              {release.prerelease ? <span>prerelease</span> : null}
              <span>{release.author ?? 'unknown author'}</span>
              <span>{formatDateTimeLabel(release.publishedAt)}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function DeploymentList({ deployments }: { deployments: GithubDeployment[] }) {
  return (
    <ol className="resource-list">
      {deployments.map((deployment) => (
        <li key={deployment.id}>
          <div className="resource-icon" aria-hidden="true">
            <RadioTower size={15} />
          </div>
          <div>
            <div className="resource-line">
              <strong>{deployment.environment}</strong>
            </div>
            <p>{deployment.description || `${deployment.task} from ${deployment.ref}`}</p>
            <div className="resource-meta">
              <span>{deployment.shortSha}</span>
              <span>{deployment.creator ?? 'unknown creator'}</span>
              <span>{formatDateTimeLabel(deployment.updatedAt)}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function CheckList({ checks }: { checks: GithubCheckRun[] }) {
  return (
    <ol className="resource-list">
      {checks.map((check) => (
        <li key={check.id}>
          <div className="resource-icon" aria-hidden="true">
            <CheckCircle2 size={15} />
          </div>
          <div>
            <div className="resource-line">
              <strong>{check.name}</strong>
              {itemLink(check.htmlUrl || check.detailsUrl)}
            </div>
            <p>{check.app ?? 'GitHub check'}</p>
            <div className="resource-meta">
              <StatePill value={check.conclusion ?? check.status} />
              <span>{formatDateTimeLabel(check.completedAt ?? check.startedAt)}</span>
            </div>
          </div>
        </li>
      ))}
    </ol>
  )
}

function ResourceBody({
  activeTab,
  data,
}: {
  activeTab: GithubResourceName
  data: unknown
}) {
  if (!data || (Array.isArray(data) && data.length === 0)) {
    return <p className="empty-state">No GitHub records returned for this resource.</p>
  }

  if (activeTab === 'overview') {
    return <RepoOverview repo={data as GithubRepositorySummary} />
  }

  if (activeTab === 'commits') {
    return <CommitList commits={data as GithubCommit[]} />
  }

  if (activeTab === 'pulls') {
    return <PullList pulls={data as GithubPullRequest[]} />
  }

  if (activeTab === 'issues') {
    return <IssueList issues={data as GithubIssue[]} />
  }

  if (activeTab === 'workflow-runs') {
    return <WorkflowRunList runs={data as GithubWorkflowRun[]} />
  }

  if (activeTab === 'workflows') {
    return <WorkflowList workflows={data as GithubWorkflow[]} />
  }

  if (activeTab === 'releases') {
    return <ReleaseList releases={data as GithubRelease[]} />
  }

  if (activeTab === 'deployments') {
    return <DeploymentList deployments={data as GithubDeployment[]} />
  }

  return <CheckList checks={data as GithubCheckRun[]} />
}

function RepoActivityContent({
  project,
  repo,
}: {
  project: AtlasProject
  repo: GithubRepositoryLink
}) {
  const [activeTab, setActiveTab] = useState<GithubResourceName>('overview')
  const resource = useGithubResource({
    owner: repo.owner,
    repo: repo.name,
    resource: activeTab,
    ref: repo.defaultBranch ?? 'HEAD',
  })
  const loadedSignals = useMemo(() => {
    const githubErrors = resource.error ? [resource.error] : []
    const data = resource.data

    return [
      ...buildManualSignals(project),
      ...buildGithubSignals({
        project,
        commits: activeTab === 'commits' ? (data as GithubCommit[] | null) : null,
        pulls: activeTab === 'pulls' ? (data as GithubPullRequest[] | null) : null,
        workflowRuns: activeTab === 'workflow-runs' ? (data as GithubWorkflowRun[] | null) : null,
        errors: githubErrors,
      }),
    ]
  }, [activeTab, project, resource.data, resource.error])

  return (
    <div className="repo-activity">
      <div className="repo-tabs" role="tablist" aria-label="GitHub resources">
        {repoTabs.map((tab) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'is-selected' : ''}
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <SignalList signals={loadedSignals} />

      <div className="resource-panel">
        <div className="resource-panel-header">
          <div>
            <strong>
              {repo.owner}/{repo.name}
            </strong>
            <span>{activeTab === 'overview' ? 'Repository overview' : 'Latest 20 by default'}</span>
          </div>
          <button type="button" onClick={resource.reload} disabled={resource.loading}>
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>

        <GitHubCacheMeta
          metadata={resource.cacheMetadata}
          page={resource.page}
          hasNextPage={resource.hasNextPage}
        />

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
        ) : null}

        {!resource.error ? <ResourceBody activeTab={activeTab} data={resource.data} /> : null}

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
    </div>
  )
}

export function RepoActivityPanel({ project }: RepoActivityPanelProps) {
  const [selectedRepoKey, setSelectedRepoKey] = useState(
    () => project.repositories[0] ? `${project.repositories[0].owner}/${project.repositories[0].name}` : '',
  )
  const selectedRepo =
    project.repositories.find((repo) => `${repo.owner}/${repo.name}` === selectedRepoKey) ??
    project.repositories[0]

  if (project.repositories.length === 0 || !selectedRepo) {
    return (
      <div className="repo-activity">
        <p className="empty-state">No GitHub repository is bound to this Atlas project.</p>
      </div>
    )
  }

  return (
    <div className="repo-activity">
      <label className="repo-selector">
        <Boxes size={15} />
        <span className="sr-only">Repository</span>
        <select
          value={`${selectedRepo.owner}/${selectedRepo.name}`}
          onChange={(event) => setSelectedRepoKey(event.target.value)}
        >
          {project.repositories.map((repo) => (
            <option key={`${repo.owner}/${repo.name}`} value={`${repo.owner}/${repo.name}`}>
              {repo.owner}/{repo.name}
            </option>
          ))}
        </select>
      </label>

      <RepoActivityContent project={project} repo={selectedRepo} />
    </div>
  )
}
