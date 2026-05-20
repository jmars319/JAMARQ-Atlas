import {
  AlertTriangle,
  Boxes,
  ChevronDown,
  ClipboardList,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  RefreshCw,
  SquareArrowOutUpRight,
  Tag,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { formatDateTimeLabel } from '../domain/atlas'
import { useGithubCommandDetail, type GithubCommandDetailKind } from '../hooks/useGithubCommandDetail'
import { useGithubResource } from '../hooks/useGithubResource'
import type {
  GithubApiError,
  GithubBranch,
  GithubCheckRun,
  GithubCommit,
  GithubDeployment,
  GithubFetchCacheMetadata,
  GithubIssue,
  GithubIssueCommandDetail,
  GithubPullRequest,
  GithubPullRequestCommandDetail,
  GithubRelease,
  GithubRepositorySummary,
  GithubResourceName,
  GithubTag,
  GithubWorkflow,
  GithubWorkflowRun,
} from '../services/githubIntegration'
import type { GithubRepoCommandSummary } from '../services/githubCommand'
import {
  createGithubCommentDraftFromDetail,
  type GithubWritePilotDraft,
} from '../services/githubWritePilot'
import { GitHubCacheMeta } from './GitHubCacheMeta'
import { GitHubCommandPanel } from './GitHubCommandPanel'
import { LocalGitPreviewPanel } from './LocalGitPreviewPanel'

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
  commandDetail?: {
    kind: GithubCommandDetailKind
    number: number
  }
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
      commandDetail: { kind: 'pulls', number: pull.number },
    }))
  }

  if (resource === 'issues') {
    return (data as GithubIssue[]).map((issue) => ({
      id: String(issue.id),
      title: `#${issue.number} ${issue.title}`,
      detail: issue.labels.length > 0 ? issue.labels.join(', ') : 'No labels',
      meta: [issue.state, `${issue.comments} comments`, formatDateTimeLabel(issue.updatedAt)],
      url: issue.htmlUrl,
      commandDetail: { kind: 'issues', number: issue.number },
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

function ResourceRows({
  rows,
  onInspectDetail,
}: {
  rows: ResourceRow[]
  onInspectDetail?: (detail: NonNullable<ResourceRow['commandDetail']>) => void
}) {
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
              {row.commandDetail && onInspectDetail ? (
                <button type="button" onClick={() => onInspectDetail(row.commandDetail!)}>
                  <ClipboardList size={14} />
                  Detail
                </button>
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

function PullRequestDetail({ detail }: { detail: GithubPullRequestCommandDetail }) {
  return (
    <div className="github-command-detail-grid">
      <div>
        <span>Review state</span>
        <strong>{detail.latestReviewState ?? 'Unavailable'}</strong>
      </div>
      <div>
        <span>Head</span>
        <strong>{detail.headRef ?? 'unknown'} / {detail.headSha?.slice(0, 7) ?? 'unknown'}</strong>
      </div>
      <div>
        <span>Base</span>
        <strong>{detail.baseRef ?? 'unknown'} / {detail.baseSha?.slice(0, 7) ?? 'unknown'}</strong>
      </div>
      <div>
        <span>Diff</span>
        <strong>
          {detail.changedFiles} files / +{detail.additions} / -{detail.deletions}
        </strong>
      </div>
      <div>
        <span>Checks</span>
        <strong>{Object.entries(detail.checkConclusionCounts).map(([key, value]) => `${key}: ${value}`).join(', ') || 'Unavailable'}</strong>
      </div>
      <div>
        <span>Comments</span>
        <strong>{detail.comments} issue / {detail.reviewComments} review</strong>
      </div>
    </div>
  )
}

function IssueDetail({ detail }: { detail: GithubIssueCommandDetail }) {
  return (
    <div className="github-command-detail-grid">
      <div>
        <span>Assignees</span>
        <strong>{detail.assignees.join(', ') || 'Unassigned'}</strong>
      </div>
      <div>
        <span>Milestone</span>
        <strong>{detail.milestone ?? 'None'}</strong>
      </div>
      <div>
        <span>Comments</span>
        <strong>{detail.comments}</strong>
      </div>
      <div>
        <span>Latest comment</span>
        <strong>{formatDateTimeLabel(detail.latestCommentAt)}</strong>
      </div>
      <div>
        <span>Locked</span>
        <strong>{String(detail.locked)}</strong>
      </div>
      <div>
        <span>Labels</span>
        <strong>{detail.labels.join(', ') || 'None'}</strong>
      </div>
    </div>
  )
}

function CommandDetailPanel({
  owner,
  repo,
  kind,
  number,
  detail,
  loading,
  error,
  projectId,
  projectName,
  onDraftComment,
}: {
  owner: string
  repo: string
  kind: GithubCommandDetailKind
  number: number | null
  detail: GithubPullRequestCommandDetail | GithubIssueCommandDetail | null
  loading: boolean
  error: GithubApiError | null
  projectId: string | null
  projectName: string | null
  onDraftComment?: (draft: GithubWritePilotDraft) => void
}) {
  if (!detail && !loading && !error) {
    return null
  }

  return (
    <section className="github-command-detail-panel" aria-label="GitHub PR or issue detail">
      <div className="resource-panel-header">
        <div>
          <strong>{kind === 'pulls' ? 'Pull Request Detail' : 'Issue Detail'}</strong>
          <span>{loading ? 'Loading read-only detail...' : 'Read-only command detail'}</span>
        </div>
        <div className="github-command-detail-actions">
          {detail && number && onDraftComment ? (
            <button
              type="button"
              onClick={() =>
                onDraftComment(
                  createGithubCommentDraftFromDetail({
                    owner,
                    repo,
                    kind,
                    number,
                    detail,
                    projectId,
                    projectName,
                  }),
                )
              }
            >
              <ClipboardList size={14} />
              Draft comment
            </button>
          ) : null}
          <span className="resource-pill">GET-only detail</span>
        </div>
      </div>
      {error ? (
        <div className="github-error">
          <AlertTriangle size={16} />
          <div>
            <strong>{error.type}</strong>
            <span>{error.message}</span>
          </div>
        </div>
      ) : null}
      {detail ? (
        <>
          <p className="empty-state">{detail.bodyExcerpt || 'No body text returned.'}</p>
          {kind === 'pulls' ? (
            <PullRequestDetail detail={detail as GithubPullRequestCommandDetail} />
          ) : (
            <IssueDetail detail={detail as GithubIssueCommandDetail} />
          )}
          {detail.permissionGaps.length > 0 ? (
            <ol className="github-command-signals">
              {detail.permissionGaps.map((gap) => (
                <li key={`${gap.resource}-${gap.type}`}>
                  <span className="review-chip review-chip-warning">{gap.resource}</span>
                  <strong>{gap.type}</strong>
                  <p>{gap.message}</p>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      ) : null}
    </section>
  )
}

function GitHubRepoDeepDiveContent({
  repository,
  boundProjectName,
  commandSummary,
  commandLoading,
  commandError,
  commandCacheMetadata,
  onCommandRefresh,
  boundProjectId,
  onDraftComment,
  writeRefreshToken,
}: {
  repository: GithubRepositorySummary
  boundProjectId: string | null
  boundProjectName: string | null
  commandSummary: GithubRepoCommandSummary | null
  commandLoading: boolean
  commandError: GithubApiError | null
  commandCacheMetadata: GithubFetchCacheMetadata | null
  onCommandRefresh: () => void
  onDraftComment?: (draft: GithubWritePilotDraft) => void
  writeRefreshToken?: number
}) {
  const [activeTab, setActiveTab] = useState<GithubResourceName>('overview')
  const [selectedDetail, setSelectedDetail] = useState<{
    kind: GithubCommandDetailKind
    number: number
  } | null>(null)
  const [owner] = repository.fullName.split('/')
  const resource = useGithubResource({
    owner,
    repo: repository.name,
    resource: activeTab,
    ref: repository.defaultBranch,
  })
  const commandDetail = useGithubCommandDetail({
    owner,
    repo: repository.name,
    kind: selectedDetail?.kind ?? 'issues',
    number: selectedDetail?.number ?? null,
  })
  const rows = useMemo(() => rowsForResource(activeTab, resource.data), [activeTab, resource.data])
  const reloadResource = resource.reload
  const reloadCommandDetail = commandDetail.reload

  useEffect(() => {
    if (!writeRefreshToken) {
      return
    }

    reloadResource()
    reloadCommandDetail()
  }, [reloadCommandDetail, reloadResource, writeRefreshToken])

  return (
    <section className="github-deep-dive" aria-label="GitHub selected repo details">
      <div className="resource-panel-header">
        <div>
          <strong>{repository.fullName}</strong>
          <span>
            {boundProjectName
              ? `Connected to ${boundProjectName}`
              : 'Not connected to an Atlas project'}{' '}
            / read-only repo evidence
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

      <GitHubCommandPanel
        summary={commandSummary}
        loading={commandLoading}
        error={commandError}
        cacheMetadata={commandCacheMetadata}
        onRefresh={onCommandRefresh}
      />

      <LocalGitPreviewPanel owner={owner} repo={repository.name} />

      <div className="repo-tabs" role="tablist" aria-label="GitHub repo resources">
        {deepDiveTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={activeTab === tab.id ? 'is-selected' : ''}
            onClick={() => {
              setActiveTab(tab.id)
              if (!['pulls', 'issues'].includes(tab.id)) {
                setSelectedDetail(null)
              }
            }}
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
        ) : activeTab === 'overview' ? (
          <RepoOverview repo={resource.data as GithubRepositorySummary | null} />
        ) : (
          <ResourceRows
            rows={rows}
            onInspectDetail={(detail) => setSelectedDetail(detail)}
          />
        )}

        <CommandDetailPanel
          owner={owner}
          repo={repository.name}
          kind={selectedDetail?.kind ?? 'issues'}
          number={selectedDetail?.number ?? null}
          detail={commandDetail.data}
          loading={commandDetail.loading}
          error={commandDetail.error}
          projectId={boundProjectId}
          projectName={boundProjectName}
          onDraftComment={onDraftComment}
        />

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
        GitHub repo details are read-only. Permission gaps are scoped to the selected resource and
        do not change Atlas status, Dispatch readiness, or project planning.
      </p>
    </section>
  )
}

export function GitHubRepoDeepDive({
  repository,
  boundProjectName,
  boundProjectId,
  commandSummary,
  commandLoading,
  commandError,
  commandCacheMetadata,
  onCommandRefresh,
  onDraftComment,
  writeRefreshToken,
}: {
  repository: GithubRepositorySummary | null
  boundProjectId: string | null
  boundProjectName: string | null
  commandSummary: GithubRepoCommandSummary | null
  commandLoading: boolean
  commandError: GithubApiError | null
  commandCacheMetadata: GithubFetchCacheMetadata | null
  onCommandRefresh: () => void
  onDraftComment?: (draft: GithubWritePilotDraft) => void
  writeRefreshToken?: number
}) {
  if (!repository) {
    return (
      <section className="github-deep-dive" aria-label="GitHub selected repo details">
        <p className="empty-state">No repository is selected.</p>
      </section>
    )
  }

  return (
    <GitHubRepoDeepDiveContent
      repository={repository}
      boundProjectId={boundProjectId}
      boundProjectName={boundProjectName}
      commandSummary={commandSummary}
      commandLoading={commandLoading}
      commandError={commandError}
      commandCacheMetadata={commandCacheMetadata}
      onCommandRefresh={onCommandRefresh}
      onDraftComment={onDraftComment}
      writeRefreshToken={writeRefreshToken}
    />
  )
}
