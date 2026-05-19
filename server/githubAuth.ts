import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

type EnvRecord = Record<string, string | undefined>

export type GithubAuthMode = 'github-app-user' | 'server-env' | 'none'

export interface GithubAppConfig {
  configured: boolean
  clientId: string
  clientSecret: string
  appSlug: string
  callbackUrl: string
  sessionSecret: string
  missing: string[]
}

export interface GithubUserSummary {
  login: string
  id: number
  name: string | null
  avatarUrl: string
  htmlUrl: string
}

export interface GithubInstallationSummary {
  id: number
  accountLogin: string
  accountType: string
  targetType: string
  repositorySelection: string
  permissions: Record<string, string>
  repositoryCount: number | null
}

export interface GithubAppPermissionPlan {
  key: string
  label: string
  access: 'read' | 'write'
  activeControls: false
}

export interface GithubAuthStatus {
  configured: boolean
  githubAppConfigured: boolean
  envTokenConfigured: boolean
  authenticated: boolean
  authMode: GithubAuthMode
  appSlug: string
  callbackUrlConfigured: boolean
  missingConfig: string[]
  configuredRepos: string[]
  user: GithubUserSummary | null
  tokenExpiresAt: string | null
  refreshTokenExpiresAt: string | null
  installCount: number
  repoCount: number
  writeControlsEnabled: false
  permissionPlan: GithubAppPermissionPlan[]
  message: string
}

interface GithubTokenState {
  accessToken: string
  tokenType: string
  scope: string
  expiresAt: number | null
  refreshToken: string | null
  refreshTokenExpiresAt: number | null
}

interface GithubLoginState {
  state: string
  codeVerifier: string
  createdAt: number
  returnTo: string
}

export interface GithubSession {
  id: string
  createdAt: number
  updatedAt: number
  login: GithubLoginState | null
  token: GithubTokenState | null
  user: GithubUserSummary | null
  installations: GithubInstallationSummary[]
  repoCount: number
  installationsCheckedAt: number
  tokenError: string | null
}

export interface GithubAuthResolution {
  mode: GithubAuthMode
  token: string
  session: GithubSession | null
  error: string | null
}

const API_VERSION = '2022-11-28'
const API_BASE = 'https://api.github.com'
const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const SESSION_COOKIE = 'atlas_github_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
const LOGIN_TTL_MS = 10 * 60 * 1000
const TOKEN_REFRESH_SKEW_MS = 60 * 1000
const INSTALLATION_STATUS_TTL_MS = 60 * 1000

export const GITHUB_APP_OPERATOR_PERMISSION_PLAN: GithubAppPermissionPlan[] = [
  { key: 'metadata', label: 'Metadata', access: 'read', activeControls: false },
  { key: 'contents', label: 'Contents', access: 'write', activeControls: false },
  { key: 'issues', label: 'Issues', access: 'write', activeControls: false },
  { key: 'pull_requests', label: 'Pull requests', access: 'write', activeControls: false },
  { key: 'actions', label: 'Actions', access: 'write', activeControls: false },
  { key: 'deployments', label: 'Deployments', access: 'write', activeControls: false },
  { key: 'checks', label: 'Checks', access: 'write', activeControls: false },
  { key: 'statuses', label: 'Commit statuses', access: 'write', activeControls: false },
]

const sessions = new Map<string, GithubSession>()

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body, null, 2))
}

function redirect(response: ServerResponse, location: string) {
  response.statusCode = 302
  response.setHeader('Location', location)
  response.end(`Redirecting to ${location}`)
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function base64Url(buffer: Buffer | Uint8Array) {
  return Buffer.from(buffer).toString('base64url')
}

function randomBase64Url(bytes = 32) {
  return base64Url(randomBytes(bytes))
}

function hmac(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function signCookieValue(sessionId: string, secret: string) {
  return `${sessionId}.${hmac(sessionId, secret)}`
}

function verifyCookieValue(value: string, secret: string) {
  const [sessionId, signature] = value.split('.')

  if (!sessionId || !signature) {
    return null
  }

  return safeEqual(signature, hmac(sessionId, secret)) ? sessionId : null
}

function signState(sessionId: string, nonce: string, secret: string) {
  return `${nonce}.${hmac(`${sessionId}:${nonce}`, secret)}`
}

export function verifySignedState(state: string, sessionId: string, secret: string) {
  const [nonce, signature] = state.split('.')

  if (!nonce || !signature) {
    return false
  }

  return safeEqual(signature, hmac(`${sessionId}:${nonce}`, secret))
}

function codeChallengeForVerifier(verifier: string) {
  return base64Url(createHash('sha256').update(verifier).digest())
}

function parseCookies(header: string | undefined) {
  const cookies: Record<string, string> = {}

  for (const part of (header ?? '').split(';')) {
    const [rawName, ...rawValue] = part.trim().split('=')

    if (!rawName || rawValue.length === 0) {
      continue
    }

    cookies[rawName] = decodeURIComponent(rawValue.join('='))
  }

  return cookies
}

function appendSetCookie(response: ServerResponse, value: string) {
  const previous = response.getHeader('Set-Cookie')
  const cookies = Array.isArray(previous)
    ? previous.map(String)
    : previous
      ? [String(previous)]
      : []

  response.setHeader('Set-Cookie', [...cookies, value])
}

function isSecureRequest(request: IncomingMessage) {
  return (
    request.headers['x-forwarded-proto'] === 'https' ||
    Boolean((request.socket as { encrypted?: boolean }).encrypted)
  )
}

function sessionCookieValue(session: GithubSession, config: GithubAppConfig) {
  return signCookieValue(session.id, config.sessionSecret)
}

function sessionCookie(session: GithubSession, config: GithubAppConfig, secure: boolean) {
  return [
    `${SESSION_COOKIE}=${encodeURIComponent(sessionCookieValue(session, config))}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_MAX_AGE_SECONDS}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

function clearSessionCookie(secure: boolean) {
  return [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

export function getGithubAppConfig(env: EnvRecord = process.env): GithubAppConfig {
  const clientId = env.GITHUB_APP_CLIENT_ID?.trim() ?? ''
  const clientSecret = env.GITHUB_APP_CLIENT_SECRET?.trim() ?? ''
  const appSlug = env.GITHUB_APP_SLUG?.trim() ?? ''
  const callbackUrl = env.GITHUB_APP_CALLBACK_URL?.trim() ?? ''
  const sessionSecret = env.ATLAS_SESSION_SECRET?.trim() ?? ''
  const required: Array<[string, string]> = [
    ['GITHUB_APP_CLIENT_ID', clientId],
    ['GITHUB_APP_CLIENT_SECRET', clientSecret],
    ['GITHUB_APP_SLUG', appSlug],
    ['GITHUB_APP_CALLBACK_URL', callbackUrl],
    ['ATLAS_SESSION_SECRET', sessionSecret],
  ]
  const missing = required.filter(([, value]) => !value).map(([key]) => key)

  return {
    configured: missing.length === 0,
    clientId,
    clientSecret,
    appSlug,
    callbackUrl,
    sessionSecret,
    missing,
  }
}

export function getGithubEnvToken(env: EnvRecord = process.env) {
  return env.GITHUB_TOKEN?.trim() || env.GH_TOKEN?.trim() || ''
}

export function getConfiguredRepos(env: EnvRecord = process.env) {
  return (env.GITHUB_REPOS || '')
    .split(',')
    .map((repo) => repo.trim())
    .filter(Boolean)
}

export function resolveConfiguredRepo(repo: string, env: EnvRecord = process.env) {
  return repo.includes('/') || !env.GITHUB_OWNER ? repo : `${env.GITHUB_OWNER}/${repo}`
}

function createSession() {
  const now = Date.now()
  const session: GithubSession = {
    id: randomBase64Url(32),
    createdAt: now,
    updatedAt: now,
    login: null,
    token: null,
    user: null,
    installations: [],
    repoCount: 0,
    installationsCheckedAt: 0,
    tokenError: null,
  }

  sessions.set(session.id, session)

  return session
}

function getSessionByRequest(request: IncomingMessage, config: GithubAppConfig) {
  if (!config.sessionSecret) {
    return null
  }

  const cookieValue = parseCookies(request.headers.cookie)[SESSION_COOKIE]
  const sessionId = cookieValue ? verifyCookieValue(cookieValue, config.sessionSecret) : null

  return sessionId ? sessions.get(sessionId) ?? null : null
}

function getOrCreateSession(request: IncomingMessage, response: ServerResponse, config: GithubAppConfig) {
  const existing = getSessionByRequest(request, config)

  if (existing) {
    return existing
  }

  const session = createSession()
  appendSetCookie(response, sessionCookie(session, config, isSecureRequest(request)))

  return session
}

function tokenStateFromResponse(value: unknown): GithubTokenState {
  const record = asRecord(value)
  const accessToken = readString(record.access_token)
  const refreshToken = readString(record.refresh_token)
  const expiresIn = readNumber(record.expires_in)
  const refreshExpiresIn = readNumber(record.refresh_token_expires_in)
  const now = Date.now()

  return {
    accessToken,
    tokenType: readString(record.token_type) || 'bearer',
    scope: readString(record.scope),
    expiresAt: expiresIn > 0 ? now + expiresIn * 1000 : null,
    refreshToken: refreshToken || null,
    refreshTokenExpiresAt: refreshExpiresIn > 0 ? now + refreshExpiresIn * 1000 : null,
  }
}

function normalizeUser(value: unknown): GithubUserSummary {
  const record = asRecord(value)

  return {
    login: readString(record.login),
    id: readNumber(record.id),
    name: readString(record.name) || null,
    avatarUrl: readString(record.avatar_url),
    htmlUrl: readString(record.html_url),
  }
}

export function normalizeGithubInstallation(value: unknown): GithubInstallationSummary {
  const record = asRecord(value)
  const account = asRecord(record.account)

  return {
    id: readNumber(record.id),
    accountLogin: readString(account.login),
    accountType: readString(account.type),
    targetType: readString(record.target_type),
    repositorySelection: readString(record.repository_selection),
    permissions: asRecord(record.permissions) as Record<string, string>,
    repositoryCount: null,
  }
}

async function requestGithubJson(path: string, token: string) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'jamarq-atlas-local-api',
      'X-GitHub-Api-Version': API_VERSION,
    },
  })
  const responseText = await response.text()
  const data = responseText ? JSON.parse(responseText) : null

  if (!response.ok) {
    const message = readString(asRecord(data).message) || response.statusText
    throw new Error(message)
  }

  return data
}

async function requestGithubToken(params: URLSearchParams) {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'jamarq-atlas-local-api',
    },
    body: params,
  })
  const responseText = await response.text()
  const data = responseText ? JSON.parse(responseText) : null
  const record = asRecord(data)

  if (!response.ok || record.error) {
    const message =
      readString(record.error_description) ||
      readString(record.error) ||
      response.statusText ||
      'GitHub token exchange failed.'
    throw new Error(message)
  }

  const token = tokenStateFromResponse(record)

  if (!token.accessToken) {
    throw new Error('GitHub token response did not include an access token.')
  }

  return token
}

async function exchangeCodeForToken(code: string, codeVerifier: string, config: GithubAppConfig) {
  return requestGithubToken(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: config.callbackUrl,
      code_verifier: codeVerifier,
    }),
  )
}

async function refreshToken(token: GithubTokenState, config: GithubAppConfig) {
  if (!token.refreshToken) {
    throw new Error('GitHub App session expired and no refresh token is available.')
  }

  if (token.refreshTokenExpiresAt !== null && Date.now() >= token.refreshTokenExpiresAt) {
    throw new Error('GitHub App refresh token expired. Sign in again.')
  }

  return requestGithubToken(
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
    }),
  )
}

function tokenNeedsRefresh(token: GithubTokenState) {
  return token.expiresAt !== null && Date.now() + TOKEN_REFRESH_SKEW_MS >= token.expiresAt
}

async function ensureFreshSessionToken(session: GithubSession, config: GithubAppConfig) {
  if (!session.token) {
    return null
  }

  if (!tokenNeedsRefresh(session.token)) {
    return session.token
  }

  try {
    session.token = await refreshToken(session.token, config)
    session.updatedAt = Date.now()
    session.tokenError = null
    return session.token
  } catch (error) {
    session.tokenError = error instanceof Error ? error.message : 'GitHub App token refresh failed.'
    session.token = null
    session.user = null
    session.installations = []
    session.repoCount = 0
    return null
  }
}

async function hydrateGithubSession(session: GithubSession, token: GithubTokenState) {
  if (Date.now() - session.installationsCheckedAt < INSTALLATION_STATUS_TTL_MS) {
    return
  }

  const [user, installationsBody] = await Promise.all([
    requestGithubJson('/user', token.accessToken),
    requestGithubJson('/user/installations?per_page=100&page=1', token.accessToken),
  ])
  const installations = Array.isArray(asRecord(installationsBody).installations)
    ? (asRecord(installationsBody).installations as unknown[]).map(normalizeGithubInstallation)
    : []
  const counts = await Promise.all(
    installations.map(async (installation) => {
      try {
        const body = await requestGithubJson(
          `/user/installations/${installation.id}/repositories?per_page=1&page=1`,
          token.accessToken,
        )

        return readNumber(asRecord(body).total_count)
      } catch {
        return 0
      }
    }),
  )

  session.user = normalizeUser(user)
  session.installations = installations.map((installation, index) => ({
    ...installation,
    repositoryCount: counts[index] ?? 0,
  }))
  session.repoCount = counts.reduce((total, count) => total + count, 0)
  session.installationsCheckedAt = Date.now()
  session.updatedAt = Date.now()
  session.tokenError = null
}

function statusMessage(status: GithubAuthStatus) {
  if (status.authenticated && status.authMode === 'github-app-user') {
    return `Signed in as ${status.user?.login ?? 'GitHub user'} with ${status.installCount} installation(s). Future write controls are locked.`
  }

  if (status.envTokenConfigured) {
    return 'Using legacy server environment token fallback. GitHub App sign-in is still available when configured.'
  }

  if (status.githubAppConfigured) {
    return 'GitHub App is configured. Sign in to list installed repositories.'
  }

  return 'GitHub App sign-in is not configured yet.'
}

export async function createGithubAuthStatus(
  request: IncomingMessage,
  env: EnvRecord = process.env,
): Promise<GithubAuthStatus> {
  const config = getGithubAppConfig(env)
  const envTokenConfigured = Boolean(getGithubEnvToken(env))
  const session = getSessionByRequest(request, config)
  const token = session ? await ensureFreshSessionToken(session, config) : null

  if (session && token) {
    try {
      await hydrateGithubSession(session, token)
    } catch (error) {
      session.tokenError =
        error instanceof Error ? error.message : 'GitHub App session status refresh failed.'
    }
  }

  const authenticated = Boolean(session?.token?.accessToken)
  const authMode: GithubAuthMode = authenticated
    ? 'github-app-user'
    : envTokenConfigured
      ? 'server-env'
      : 'none'
  const status: GithubAuthStatus = {
    configured: config.configured || envTokenConfigured,
    githubAppConfigured: config.configured,
    envTokenConfigured,
    authenticated,
    authMode,
    appSlug: config.appSlug,
    callbackUrlConfigured: Boolean(config.callbackUrl),
    missingConfig: config.missing,
    configuredRepos: getConfiguredRepos(env),
    user: session?.user ?? null,
    tokenExpiresAt: session?.token?.expiresAt
      ? new Date(session.token.expiresAt).toISOString()
      : null,
    refreshTokenExpiresAt: session?.token?.refreshTokenExpiresAt
      ? new Date(session.token.refreshTokenExpiresAt).toISOString()
      : null,
    installCount: session?.installations.length ?? 0,
    repoCount: session?.repoCount ?? 0,
    writeControlsEnabled: false,
    permissionPlan: GITHUB_APP_OPERATOR_PERMISSION_PLAN,
    message: '',
  }

  return {
    ...status,
    message: statusMessage(status),
  }
}

export async function resolveGithubAuthForRequest(
  request: IncomingMessage,
  env: EnvRecord = process.env,
): Promise<GithubAuthResolution> {
  const config = getGithubAppConfig(env)
  const session = getSessionByRequest(request, config)
  const token = session ? await ensureFreshSessionToken(session, config) : null

  if (session && token) {
    return {
      mode: 'github-app-user',
      token: token.accessToken,
      session,
      error: null,
    }
  }

  const envToken = getGithubEnvToken(env)

  if (envToken) {
    return {
      mode: 'server-env',
      token: envToken,
      session,
      error: session?.tokenError ?? null,
    }
  }

  return {
    mode: 'none',
    token: '',
    session,
    error: session?.tokenError ?? null,
  }
}

export function clearGithubAuthSessionsForTests() {
  sessions.clear()
}

async function handleLogin(request: IncomingMessage, response: ServerResponse, url: URL) {
  const config = getGithubAppConfig()

  if (!config.configured) {
    json(response, 503, {
      ok: false,
      error: {
        type: 'not-configured',
        message: `GitHub App auth is missing: ${config.missing.join(', ')}.`,
      },
    })
    return
  }

  const session = getOrCreateSession(request, response, config)
  const codeVerifier = randomBase64Url(64)
  const state = signState(session.id, randomBase64Url(32), config.sessionSecret)
  const returnTo = url.searchParams.get('returnTo') || '/'
  session.login = {
    state,
    codeVerifier,
    createdAt: Date.now(),
    returnTo,
  }
  session.updatedAt = Date.now()

  const authorizeUrl = new URL(GITHUB_AUTHORIZE_URL)
  authorizeUrl.searchParams.set('client_id', config.clientId)
  authorizeUrl.searchParams.set('redirect_uri', config.callbackUrl)
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', codeChallengeForVerifier(codeVerifier))
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')
  authorizeUrl.searchParams.set('prompt', 'select_account')

  redirect(response, authorizeUrl.toString())
}

async function handleCallback(request: IncomingMessage, response: ServerResponse, url: URL) {
  const config = getGithubAppConfig()
  const session = getSessionByRequest(request, config)
  const code = url.searchParams.get('code') ?? ''
  const state = url.searchParams.get('state') ?? ''
  const error = url.searchParams.get('error') ?? ''
  const safeReturnTo = session?.login?.returnTo || '/'

  if (error) {
    if (session) {
      session.tokenError = url.searchParams.get('error_description') || error
    }
    redirect(response, `${safeReturnTo}?github_auth=error`)
    return
  }

  if (!config.configured || !session?.login || !code || !state) {
    redirect(response, '/?github_auth=invalid')
    return
  }

  const login = session.login
  const validState =
    login.state === state &&
    verifySignedState(state, session.id, config.sessionSecret) &&
    Date.now() - login.createdAt <= LOGIN_TTL_MS

  if (!validState) {
    session.login = null
    session.tokenError = 'GitHub authorization state was invalid or expired.'
    redirect(response, '/?github_auth=invalid_state')
    return
  }

  try {
    session.token = await exchangeCodeForToken(code, login.codeVerifier, config)
    session.login = null
    session.tokenError = null
    await hydrateGithubSession(session, session.token)
    appendSetCookie(response, sessionCookie(session, config, isSecureRequest(request)))
    redirect(response, `${login.returnTo}?github_auth=connected`)
  } catch (callbackError) {
    session.token = null
    session.user = null
    session.installations = []
    session.repoCount = 0
    session.tokenError =
      callbackError instanceof Error ? callbackError.message : 'GitHub App callback failed.'
    redirect(response, `${login.returnTo}?github_auth=failed`)
  }
}

async function handleLogout(request: IncomingMessage, response: ServerResponse) {
  const config = getGithubAppConfig()
  const session = getSessionByRequest(request, config)

  if (session) {
    sessions.delete(session.id)
  }

  appendSetCookie(response, clearSessionCookie(isSecureRequest(request)))
  json(response, 200, {
    ok: true,
    authenticated: false,
    writeControlsEnabled: false,
  })
}

export async function githubAuthApiMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next?: () => void,
) {
  if (!request.url?.startsWith('/api/github/auth')) {
    next?.()
    return
  }

  try {
    const url = new URL(request.url, 'http://localhost')

    if (request.method === 'GET' && url.pathname === '/api/github/auth/login') {
      await handleLogin(request, response, url)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/github/auth/callback') {
      await handleCallback(request, response, url)
      return
    }

    if (request.method === 'GET' && url.pathname === '/api/github/auth/status') {
      json(response, 200, await createGithubAuthStatus(request))
      return
    }

    if (request.method === 'POST' && url.pathname === '/api/github/auth/logout') {
      await handleLogout(request, response)
      return
    }

    json(response, 404, {
      ok: false,
      error: {
        type: 'not-found',
        message: 'Unknown GitHub auth route.',
      },
    })
  } catch (error) {
    json(response, 500, {
      ok: false,
      error: {
        type: 'unknown',
        message: error instanceof Error ? error.message : 'GitHub auth route failed.',
      },
    })
  }
}
