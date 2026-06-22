import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  createGithubAuthStatus,
  resolveGithubAuthForRequest,
  type GithubAuthMode,
  type GithubAuthResolution,
} from './githubAuth'

type GithubWritePilotKind = 'create-issue' | 'create-comment'
type GithubWritePilotErrorType =
  | 'missing-token'
  | 'unauthorized'
  | 'insufficient-permission'
  | 'not-found-or-private'
  | 'rate-limited'
  | 'github-unavailable'
  | 'unknown'
  | 'bad-request'
  | 'confirmation-mismatch'
  | 'gone-or-disabled'
  | 'unsupported-media-type'
  | 'validation-failed'

interface GithubWritePilotCapability {
  owner: string
  repo: string
  repositoryKey: string
  configured: boolean
  authenticated: boolean
  authMode: GithubAuthMode
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

interface GithubWritePilotError {
  type: GithubWritePilotErrorType
  status: number
  message: string
  resource: string
}

interface GithubWritePilotResult {
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

type WriteBody = Record<string, unknown>

/* GitHub write contract */ const API_VERSION = '2022-11-28'
const API_BASE = 'https://api.github.com'
const BODY_LIMIT_BYTES = 64 * 1024
const TITLE_LIMIT = 256
const BODY_LIMIT = 6000
const REPO_PART_PATTERN = /^[A-Za-z0-9_.-]+$/

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body, null, 2))
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readNullableString(value: unknown) {
  const text = readString(value)

  return text || null
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : Number.NaN
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function repositoryKey(owner: string, repo: string) {
  return `${owner}/${repo}`
}

/* Typed confirmation boundary */ function confirmationPhrase(kind: GithubWritePilotKind, owner: string, repo: string, issueNumber?: number) {
  if (kind === 'create-comment') {
    return `COMMENT ${repositoryKey(owner, repo)}#${issueNumber ?? ''}`
  }

  return `CREATE ISSUE ${repositoryKey(owner, repo)}`
}

function bodyExcerpt(value: string, limit = 240) {
  const normalized = value.replace(/\s+/g, ' ').trim()

  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}...` : normalized
}

function validateRepoParts(owner: string, repo: string) {
  return Boolean(owner && repo && REPO_PART_PATTERN.test(owner) && REPO_PART_PATTERN.test(repo))
}

function onlyConfirmationError(errors: string[]) {
  return errors.length === 1 && errors[0].startsWith('Confirmation')
}

function errorBody(
  error: GithubWritePilotError,
  issueCommentPilotEnabled = false,
) {
  return {
    ok: false,
    error,
    writeControlsEnabled: false,
    issueCommentPilotEnabled,
  }
}

function mapGithubWriteError(
  status: number,
  message: string,
  resource: string,
  headers?: Headers,
): GithubWritePilotError {
  if (status === 400) {
    return {
      type: 'bad-request',
      status,
      resource,
      message: message || 'GitHub rejected the write request.',
    }
  }

  if (status === 401) {
    return {
      type: 'unauthorized',
      status,
      resource,
      message: 'GitHub rejected the server-side token. Sign in again or check local token setup.',
    }
  }

  if (status === 403 && headers?.get('x-ratelimit-remaining') === '0') {
    const reset = headers.get('x-ratelimit-reset')
    const resetTimestamp = reset ? Number(reset) : 0
    const resetLabel =
      resetTimestamp > 0 ? new Date(resetTimestamp * 1000).toISOString() : 'unknown'

    return {
      type: 'rate-limited',
      status,
      resource,
      message: `GitHub rate limit reached. Reset: ${resetLabel}.`,
    }
  }

  if (status === 403) {
    return {
      type: 'insufficient-permission',
      status,
      resource,
      message: 'The GitHub token does not have permission to create this issue or comment.',
    }
  }

  if (status === 404) {
    return {
      type: 'not-found-or-private',
      status,
      resource,
      message: 'The repository, issue, or pull request was not found, or it is private for this token.',
    }
  }

  if (status === 410) {
    return {
      type: 'gone-or-disabled',
      status,
      resource,
      message: 'GitHub reports this issue resource is gone or issues are disabled for the repository.',
    }
  }

  if (status === 422) {
    return {
      type: 'validation-failed',
      status,
      resource,
      message: message || 'GitHub validation failed, or the endpoint has been rate limited for content creation.',
    }
  }

  if (status >= 500) {
    return {
      type: 'github-unavailable',
      status,
      resource,
      message: 'GitHub is currently unavailable for this write request.',
    }
  }

  return {
    type: 'unknown',
    status,
    resource,
    message: message || 'GitHub returned an unexpected write response.',
  }
}

/* Request body safety boundary */ async function readJsonBody(request: IncomingMessage): Promise<WriteBody> {
  const contentType = request.headers['content-type'] ?? ''

  if (!String(contentType).toLowerCase().includes('application/json')) {
    throw Object.assign(new Error('GitHub write pilot routes require application/json.'), {
      status: 415,
      type: 'unsupported-media-type',
    })
  }

  const chunks: Buffer[] = []
  let total = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.byteLength

    if (total > BODY_LIMIT_BYTES) {
      throw Object.assign(new Error('GitHub write pilot request body is too large.'), {
        status: 400,
        type: 'bad-request',
      })
    }

    chunks.push(buffer)
  }

  try {
    return asRecord(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
  } catch {
    throw Object.assign(new Error('GitHub write pilot request body must be valid JSON.'), {
      status: 400,
      type: 'bad-request',
    })
  }
}

/* Capability checkpoint boundary */ async function createCapability(
  request: IncomingMessage,
  owner: string,
  repo: string,
  auth?: GithubAuthResolution,
): Promise<GithubWritePilotCapability> {
  const status = await createGithubAuthStatus(request)
  const resolvedAuth = auth ?? (await resolveGithubAuthForRequest(request))
  const blockers: string[] = []

  if (!validateRepoParts(owner, repo)) {
    blockers.push('Repository owner and name must be simple GitHub path segments.')
  }

  if (!resolvedAuth.token) {
    blockers.push(
      resolvedAuth.error ??
        'Sign in with the configured GitHub App, or set GITHUB_TOKEN/GH_TOKEN for local fallback.',
    )
  }

  const hasIssuePlan = status.permissionPlan.some(
    (permission) => permission.key === 'issues' && permission.access === 'write',
  )

  if (!hasIssuePlan) {
    blockers.push('GitHub App permission plan does not include Issues: write.')
  }

  const issueCommentPilotEnabled = blockers.length === 0
  const key = repositoryKey(owner, repo)

  return {
    owner,
    repo,
    repositoryKey: key,
    configured: status.configured,
    authenticated: Boolean(resolvedAuth.token),
    authMode: resolvedAuth.mode,
    issueCommentPilotEnabled,
    writeControlsEnabled: false,
    requiredPermissions: [
      'Issues: write',
      'Pull requests: write only if Issues write is unavailable for PR conversation comments',
    ],
    blockers,
    confirmationPhrases: {
      createIssue: confirmationPhrase('create-issue', owner, repo),
      createCommentPrefix: `COMMENT ${key}#`,
    },
    message: issueCommentPilotEnabled
      ? 'GitHub issue/comment pilot is available for this repository. Broad write controls remain locked.'
      : 'GitHub issue/comment pilot is unavailable until blockers are resolved.',
  }
}

/* Issue payload boundary */ function validateIssueBody(body: WriteBody) {
  const owner = readString(body.owner)
  const repo = readString(body.repo)
  const title = readString(body.title)
  const issueBody = readString(body.body)
  const confirmation = readString(body.confirmation)
  const errors: string[] = []

  if (!validateRepoParts(owner, repo)) {
    errors.push('Repository owner and name are required.')
  }

  if (!title) {
    errors.push('Issue title is required.')
  }

  if (title.length > TITLE_LIMIT) {
    errors.push(`Issue title must be ${TITLE_LIMIT} characters or fewer.`)
  }

  if (!issueBody) {
    errors.push('Issue body is required.')
  }

  if (issueBody.length > BODY_LIMIT) {
    errors.push(`Issue body must be ${BODY_LIMIT} characters or fewer.`)
  }

  if (confirmation !== confirmationPhrase('create-issue', owner, repo)) {
    errors.push(`Confirmation must match ${confirmationPhrase('create-issue', owner, repo)}.`)
  }

  return {
    ok: errors.length === 0,
    errors,
    owner,
    repo,
    title,
    body: issueBody,
    sourceIntentId: readNullableString(body.sourceIntentId),
    sourceDetailId: readNullableString(body.sourceDetailId),
    projectId: readNullableString(body.projectId),
  }
}

/* Comment payload boundary */ function validateCommentBody(body: WriteBody) {
  const owner = readString(body.owner)
  const repo = readString(body.repo)
  const issueNumber = readNumber(body.issueNumber)
  const commentBody = readString(body.body)
  const confirmation = readString(body.confirmation)
  const errors: string[] = []

  if (!validateRepoParts(owner, repo)) {
    errors.push('Repository owner and name are required.')
  }

  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    errors.push('Issue or pull request number must be a positive integer.')
  }

  if (!commentBody) {
    errors.push('Comment body is required.')
  }

  if (commentBody.length > BODY_LIMIT) {
    errors.push(`Comment body must be ${BODY_LIMIT} characters or fewer.`)
  }

  if (confirmation !== confirmationPhrase('create-comment', owner, repo, issueNumber)) {
    errors.push(`Confirmation must match ${confirmationPhrase('create-comment', owner, repo, issueNumber)}.`)
  }

  return {
    ok: errors.length === 0,
    errors,
    owner,
    repo,
    issueNumber,
    body: commentBody,
    sourceIntentId: readNullableString(body.sourceIntentId),
    sourceDetailId: readNullableString(body.sourceDetailId),
    projectId: readNullableString(body.projectId),
  }
}

/* External write boundary */ async function postGithubJson({
  path,
  resource,
  auth,
  body,
}: {
  path: string
  resource: string
  auth: GithubAuthResolution
  body: unknown
}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'jamarq-atlas-local-api',
      'X-GitHub-Api-Version': API_VERSION,
    },
    body: JSON.stringify(body),
  })
  const responseText = await response.text()
  const data = responseText ? JSON.parse(responseText) : null

  if (!response.ok) {
    return {
      data: null,
      error: mapGithubWriteError(
        response.status,
        readString(asRecord(data).message) || response.statusText,
        resource,
        response.headers,
      ),
    }
  }

  return {
    data: asRecord(data),
    error: null,
  }
}

function normalizeIssueResult({
  owner,
  repo,
  data,
  sourceIntentId,
  sourceDetailId,
  projectId,
}: {
  owner: string
  repo: string
  data: Record<string, unknown>
  sourceIntentId: string | null
  sourceDetailId: string | null
  projectId: string | null
}): GithubWritePilotResult {
  const key = repositoryKey(owner, repo)

  return {
    ok: true,
    kind: 'create-issue',
    owner,
    repo,
    repositoryKey: key,
    number: readNumber(data.number),
    id: readNumber(data.id),
    title: readString(data.title) || null,
    htmlUrl: readString(data.html_url),
    apiUrl: readString(data.url),
    bodyExcerpt: bodyExcerpt(readString(data.body)),
    createdAt: readString(data.created_at) || null,
    actor: readString(asRecord(data.user).login) || null,
    sourceIntentId,
    sourceDetailId,
    projectId,
    writeControlsEnabled: false,
    issueCommentPilotEnabled: true,
    message: `Created GitHub issue in ${key}.`,
  }
}

function normalizeCommentResult({
  owner,
  repo,
  issueNumber,
  data,
  sourceIntentId,
  sourceDetailId,
  projectId,
}: {
  owner: string
  repo: string
  issueNumber: number
  data: Record<string, unknown>
  sourceIntentId: string | null
  sourceDetailId: string | null
  projectId: string | null
}): GithubWritePilotResult {
  const key = repositoryKey(owner, repo)

  return {
    ok: true,
    kind: 'create-comment',
    owner,
    repo,
    repositoryKey: key,
    number: issueNumber,
    id: readNumber(data.id),
    title: null,
    htmlUrl: readString(data.html_url),
    apiUrl: readString(data.url),
    bodyExcerpt: bodyExcerpt(readString(data.body)),
    createdAt: readString(data.created_at) || null,
    actor: readString(asRecord(data.user).login) || null,
    sourceIntentId,
    sourceDetailId,
    projectId,
    writeControlsEnabled: false,
    issueCommentPilotEnabled: true,
    message: `Posted GitHub comment to ${key}#${issueNumber}.`,
  }
}

async function handleIssueCreate(request: IncomingMessage, response: ServerResponse) {
  const body = await readJsonBody(request)
  const input = validateIssueBody(body)
  const auth = await resolveGithubAuthForRequest(request)
  const capability = await createCapability(request, input.owner, input.repo, auth)

  if (!input.ok) {
    json(
      response,
      onlyConfirmationError(input.errors) ? 409 : 400,
      errorBody(
        {
          type: onlyConfirmationError(input.errors) ? 'confirmation-mismatch' : 'bad-request',
          status: onlyConfirmationError(input.errors) ? 409 : 400,
          resource: 'github-write-issue',
          message: input.errors.join(' '),
        },
        capability.issueCommentPilotEnabled,
      ),
    )
    return
  }

  if (!capability.issueCommentPilotEnabled || !auth.token) {
    json(
      response,
      401,
      errorBody(
        {
          type: 'missing-token',
          status: 401,
          resource: 'github-write-issue',
          message: capability.blockers.join(' ') || 'GitHub write pilot is unavailable.',
        },
        false,
      ),
    )
    return
  }

  const result = await postGithubJson({
    path: `/repos/${input.owner}/${input.repo}/issues`,
    resource: 'github-write-issue',
    auth,
    body: {
      title: input.title,
      body: input.body,
    },
  })

  if (result.error) {
    json(response, result.error.status, errorBody(result.error, true))
    return
  }

  json(
    response,
    201,
    normalizeIssueResult({
      owner: input.owner,
      repo: input.repo,
      data: result.data ?? {},
      sourceIntentId: input.sourceIntentId,
      sourceDetailId: input.sourceDetailId,
      projectId: input.projectId,
    }),
  )
}

async function handleCommentCreate(request: IncomingMessage, response: ServerResponse) {
  const body = await readJsonBody(request)
  const input = validateCommentBody(body)
  const auth = await resolveGithubAuthForRequest(request)
  const capability = await createCapability(request, input.owner, input.repo, auth)

  if (!input.ok) {
    json(
      response,
      onlyConfirmationError(input.errors) ? 409 : 400,
      errorBody(
        {
          type: onlyConfirmationError(input.errors) ? 'confirmation-mismatch' : 'bad-request',
          status: onlyConfirmationError(input.errors) ? 409 : 400,
          resource: 'github-write-comment',
          message: input.errors.join(' '),
        },
        capability.issueCommentPilotEnabled,
      ),
    )
    return
  }

  if (!capability.issueCommentPilotEnabled || !auth.token) {
    json(
      response,
      401,
      errorBody(
        {
          type: 'missing-token',
          status: 401,
          resource: 'github-write-comment',
          message: capability.blockers.join(' ') || 'GitHub write pilot is unavailable.',
        },
        false,
      ),
    )
    return
  }

  const result = await postGithubJson({
    path: `/repos/${input.owner}/${input.repo}/issues/${input.issueNumber}/comments`,
    resource: 'github-write-comment',
    auth,
    body: {
      body: input.body,
    },
  })

  if (result.error) {
    json(response, result.error.status, errorBody(result.error, true))
    return
  }

  json(
    response,
    201,
    normalizeCommentResult({
      owner: input.owner,
      repo: input.repo,
      issueNumber: input.issueNumber,
      data: result.data ?? {},
      sourceIntentId: input.sourceIntentId,
      sourceDetailId: input.sourceDetailId,
      projectId: input.projectId,
    }),
  )
}

/* Write route boundary */ export async function githubWriteApiMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next?: () => void,
) {
  if (!request.url?.startsWith('/api/github/write')) {
    next?.()
    return
  }

  try {
    const url = new URL(request.url, 'http://localhost')

    if (request.method === 'GET' && url.pathname === '/api/github/write/capability') {
      const owner = readString(url.searchParams.get('owner'))
      const repo = readString(url.searchParams.get('repo'))

      json(response, 200, await createCapability(request, owner, repo))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/github/write/issues') {
      await handleIssueCreate(request, response)
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/github/write/comments') {
      await handleCommentCreate(request, response)
      return
    }

    if (!['GET', 'POST'].includes(request.method ?? '')) {
      json(
        response,
        405,
        errorBody({
          type: 'bad-request',
          status: 405,
          resource: 'github-write',
          message: 'Atlas GitHub write pilot exposes only GET capability and POST issue/comment routes.',
        }),
      )
      return
    }

    json(
      response,
      404,
      errorBody({
        type: 'bad-request',
        status: 404,
        resource: 'github-write',
        message: 'Unknown GitHub write pilot route.',
      }),
    )
  } catch (error) {
    const record = asRecord(error)
    const status = readNumber(record.status)
    const type = readString(record.type) as GithubWritePilotErrorType

    json(
      response,
      Number.isInteger(status) ? status : 500,
      errorBody({
        type: type || 'unknown',
        status: Number.isInteger(status) ? status : 500,
        resource: 'github-write',
        message: error instanceof Error ? error.message : 'GitHub write pilot route failed.',
      }),
    )
  }
}
