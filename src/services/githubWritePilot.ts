import type { ReviewNote } from '../domain/review'
import type { AtlasActionIntent } from './actionPlanner'
import type {
  GithubErrorType,
  GithubIssueCommandDetail,
  GithubPullRequestCommandDetail,
} from './githubIntegration'
import { AtlasRequestError, requestJson, requestJsonResponse } from './requestClient'

export type GithubWritePilotKind = 'create-issue' | 'create-comment'

export type GithubWritePilotErrorType =
  | GithubErrorType
  | 'bad-request'
  | 'confirmation-mismatch'
  | 'gone-or-disabled'
  | 'unsupported-media-type'
  | 'validation-failed'

export interface GithubWritePilotCapability {
  owner: string
  repo: string
  repositoryKey: string
  configured: boolean
  authenticated: boolean
  authMode: 'github-app-user' | 'server-env' | 'none'
  issueCommentPilotEnabled: boolean
  writeControlsEnabled: false
  requiredPermissions: string[]
  blockers: string[]
  confirmationPhrases: {
    createIssue: string
    createCommentPrefix: string
  }
  message: string
}

export interface GithubWritePilotDraft {
  kind: GithubWritePilotKind
  owner: string
  repo: string
  title: string
  body: string
  issueNumber: number | null
  sourceIntentId: string | null
  sourceDetailId: string | null
  projectId: string | null
  projectName: string | null
  evidence: string[]
}

export interface GithubWritePilotError {
  type: GithubWritePilotErrorType
  status: number
  message: string
  resource: string
}

export interface GithubWritePilotResult {
  ok: true
  kind: GithubWritePilotKind
  owner: string
  repo: string
  repositoryKey: string
  number: number
  id: number
  title: string | null
  htmlUrl: string
  apiUrl: string
  bodyExcerpt: string
  createdAt: string | null
  actor: string | null
  sourceIntentId: string | null
  sourceDetailId: string | null
  projectId: string | null
  writeControlsEnabled: false
  issueCommentPilotEnabled: true
  message: string
}

interface GithubWritePilotErrorResponse {
  ok: false
  error: GithubWritePilotError
  writeControlsEnabled: false
  issueCommentPilotEnabled: boolean
}

export const GITHUB_WRITE_PILOT_TITLE_LIMIT = 256
export const GITHUB_WRITE_PILOT_BODY_LIMIT = 6000

function repositoryKey(owner: string, repo: string) {
  return `${owner}/${repo}`
}

function excerpt(value: string, limit = 240) {
  const normalized = value.replace(/\s+/g, ' ').trim()

  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized
}

function evidenceLines(intent: AtlasActionIntent) {
  return intent.evidence
    .slice(0, 8)
    .map((item) => `- ${item.label}: ${item.value}${item.url ? ` (${item.url})` : ''}`)
}

export function githubWritePilotConfirmationPhrase(draft: Pick<GithubWritePilotDraft, 'kind' | 'owner' | 'repo' | 'issueNumber'>) {
  if (draft.kind === 'create-comment') {
    return `COMMENT ${repositoryKey(draft.owner, draft.repo)}#${draft.issueNumber ?? ''}`
  }

  return `CREATE ISSUE ${repositoryKey(draft.owner, draft.repo)}`
}

export function validateGithubWritePilotDraft(draft: GithubWritePilotDraft) {
  const errors: string[] = []
  const title = draft.title.trim()
  const body = draft.body.trim()

  if (!draft.owner.trim() || !draft.repo.trim()) {
    errors.push('Repository owner and name are required.')
  }

  if (draft.kind === 'create-issue') {
    if (!title) {
      errors.push('Issue title is required.')
    }

    if (title.length > GITHUB_WRITE_PILOT_TITLE_LIMIT) {
      errors.push(`Issue title must be ${GITHUB_WRITE_PILOT_TITLE_LIMIT} characters or fewer.`)
    }
  }

  if (draft.kind === 'create-comment' && (!draft.issueNumber || draft.issueNumber < 1)) {
    errors.push('Issue or pull request number is required.')
  }

  if (!body) {
    errors.push(draft.kind === 'create-issue' ? 'Issue body is required.' : 'Comment body is required.')
  }

  if (body.length > GITHUB_WRITE_PILOT_BODY_LIMIT) {
    errors.push(`Body must be ${GITHUB_WRITE_PILOT_BODY_LIMIT} characters or fewer.`)
  }

  return errors
}

export function atlasIntentSupportsGithubIssueDraft(intent: AtlasActionIntent) {
  return intent.kind !== 'review-open-issue' && intent.kind !== 'review-open-pr'
}

export function createGithubIssueDraftFromIntent(intent: AtlasActionIntent): GithubWritePilotDraft {
  const evidence = evidenceLines(intent)
  const projectLine = intent.target.projectName
    ? `Project: ${intent.target.projectName}`
    : 'Project: Unbound repository'

  return {
    kind: 'create-issue',
    owner: intent.target.owner,
    repo: intent.target.repo,
    issueNumber: null,
    title: `Atlas follow-up: ${intent.title}`.slice(0, GITHUB_WRITE_PILOT_TITLE_LIMIT),
    body: [
      `Atlas action intent: ${intent.title}`,
      '',
      `Reason: ${intent.reason}`,
      '',
      `Detail: ${intent.detail}`,
      '',
      projectLine,
      `Repository: ${intent.target.repositoryKey}`,
      `Source intent: ${intent.id}`,
      '',
      'Evidence:',
      ...(evidence.length > 0 ? evidence : ['- No evidence rows were available.']),
      '',
      'Atlas note: this issue was drafted from local Command Center evidence. No project status, local Git state, workflow, or deployment state was changed automatically.',
    ].join('\n'),
    sourceIntentId: intent.id,
    sourceDetailId: null,
    projectId: intent.target.projectId,
    projectName: intent.target.projectName,
    evidence,
  }
}

export function createGithubCommentDraftFromDetail({
  owner,
  repo,
  kind,
  number,
  detail,
  projectId,
  projectName,
}: {
  owner: string
  repo: string
  kind: 'issues' | 'pulls'
  number: number
  detail: GithubIssueCommandDetail | GithubPullRequestCommandDetail
  projectId: string | null
  projectName: string | null
}): GithubWritePilotDraft {
  const isPull = kind === 'pulls'
  const title = isPull
    ? (detail as GithubPullRequestCommandDetail).pullRequest?.title ?? `Pull request #${number}`
    : (detail as GithubIssueCommandDetail).issue?.title ?? `Issue #${number}`
  const state = isPull
    ? (detail as GithubPullRequestCommandDetail).pullRequest?.state ?? 'unknown'
    : (detail as GithubIssueCommandDetail).issue?.state ?? 'unknown'
  const sourceDetailId = `github-${kind}-${repositoryKey(owner, repo)}-${number}`
  const evidence = [
    `${isPull ? 'Pull request' : 'Issue'}: #${number} ${title}`,
    `State: ${state}`,
    `Updated: ${detail.updatedAt ?? 'unknown'}`,
    `Comments: ${isPull ? (detail as GithubPullRequestCommandDetail).comments : (detail as GithubIssueCommandDetail).comments}`,
  ]

  return {
    kind: 'create-comment',
    owner,
    repo,
    issueNumber: number,
    title: '',
    body: [
      `Atlas review note for ${repositoryKey(owner, repo)}#${number}`,
      '',
      `${isPull ? 'Pull request' : 'Issue'}: ${title}`,
      projectName ? `Project: ${projectName}` : 'Project: Unbound repository',
      `Source detail: ${sourceDetailId}`,
      '',
      'Evidence:',
      ...evidence.map((item) => `- ${item}`),
      '',
      'Atlas note: this comment was drafted from read-only Command Center evidence. No project status, local Git state, workflow, or deployment state was changed automatically.',
    ].join('\n'),
    sourceIntentId: null,
    sourceDetailId,
    projectId,
    projectName,
    evidence,
  }
}

export function githubWritePilotReviewBody(result: GithubWritePilotResult, draft: GithubWritePilotDraft) {
  const actionLabel = result.kind === 'create-issue' ? 'GitHub issue created' : 'GitHub comment posted'

  return [
    `${actionLabel} by Atlas write pilot.`,
    '',
    `Repository: ${result.repositoryKey}`,
    `Result: ${result.kind === 'create-issue' ? `#${result.number} ${result.title ?? ''}` : `comment on #${result.number}`}`,
    `URL: ${result.htmlUrl}`,
    `Actor: ${result.actor ?? 'unknown'}`,
    `Source: ${draft.sourceIntentId ?? draft.sourceDetailId ?? 'manual draft'}`,
    `Broad writeControlsEnabled: ${String(result.writeControlsEnabled)}`,
    '',
    `Body excerpt: ${excerpt(result.bodyExcerpt || draft.body)}`,
  ].join('\n')
}

export function githubWritePilotReviewNoteInput(result: GithubWritePilotResult, draft: GithubWritePilotDraft): Omit<ReviewNote, 'id' | 'createdAt'> {
  return {
    sessionId: null,
    itemId: draft.sourceIntentId ?? draft.sourceDetailId,
    projectId: draft.projectId,
    source: 'github',
    outcome: 'noted',
    body: githubWritePilotReviewBody(result, draft),
  }
}

export async function fetchGithubWritePilotCapability(
  owner: string,
  repo: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ owner, repo })

  return requestJson<GithubWritePilotCapability>(
    `/api/github/write/capability?${params.toString()}`,
    {},
    { signal, retries: 1, retrySafe: true },
  )
}

export async function submitGithubWritePilotDraft(
  draft: GithubWritePilotDraft,
  confirmation: string,
) {
  const payload =
    draft.kind === 'create-issue'
      ? {
          owner: draft.owner,
          repo: draft.repo,
          title: draft.title,
          body: draft.body,
          sourceIntentId: draft.sourceIntentId,
          sourceDetailId: draft.sourceDetailId,
          projectId: draft.projectId,
          confirmation,
        }
      : {
          owner: draft.owner,
          repo: draft.repo,
          issueNumber: draft.issueNumber,
          body: draft.body,
          sourceIntentId: draft.sourceIntentId,
          sourceDetailId: draft.sourceDetailId,
          projectId: draft.projectId,
          confirmation,
        }

  const path =
    draft.kind === 'create-issue' ? '/api/github/write/issues' : '/api/github/write/comments'
  const { response, body } = await requestJsonResponse<
    GithubWritePilotResult | GithubWritePilotErrorResponse
  >(
    path,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    {
      retrySafe: false,
      timeoutMs: 20_000,
    },
  )

  if (!response.ok || !body || body.ok !== true) {
    const message =
      body && 'error' in body
        ? body.error.message
        : `GitHub write pilot request returned ${response.status}.`

    throw new AtlasRequestError(message, response.status)
  }

  return body
}
