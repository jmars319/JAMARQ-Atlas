import type { IncomingMessage, ServerResponse } from 'node:http'
import { access } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import type {
  HealthCheckResult,
  HostConnectionCheck,
  HostConnectionCheckStatus,
  HostConnectionPreflightResult,
} from '../src/domain/dispatch'

const HEALTH_TIMEOUT_MS = 5000
const HOST_TIMEOUT_MS = 5000
const SECRET_CONFIG_KEY_PATTERN = /(password|token|secret|api[-_]?key|private[-_]?key|passphrase)/i

type EnvRecord = Record<string, string | undefined>

export interface HostConnectionConfigEntry {
  targetId: string
  credentialRef: string
  host: string
  port: number
  localMirrorRoot: string
  localMirrorApiPath: string
}

export interface HostConnectionConfig {
  configured: boolean
  entries: HostConnectionConfigEntry[]
  errors: string[]
}

interface HostConnectionTargetInput {
  targetId?: string
  id?: string
  credentialRef: string
  remoteHost: string
  remoteFrontendPath: string
  remoteBackendPath: string
}

interface HostProbeResult {
  ok: boolean
  message: string
}

interface PathProbeResult {
  exists: boolean
  message: string
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body, null, 2))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function containsSecretConfigKey(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsSecretConfigKey(item))
  }

  if (!isRecord(value)) {
    return false
  }

  return Object.entries(value).some(
    ([key, nested]) => SECRET_CONFIG_KEY_PATTERN.test(key) || containsSecretConfigKey(nested),
  )
}

function readHostConfigEntry(value: unknown): HostConnectionConfigEntry | null {
  if (!isRecord(value)) {
    return null
  }

  const targetId = readString(value.targetId)

  if (!targetId) {
    return null
  }

  return {
    targetId,
    credentialRef: readString(value.credentialRef),
    host: readString(value.host),
    port: readNumber(value.port, 22),
    localMirrorRoot: readString(value.localMirrorRoot),
    localMirrorApiPath: readString(value.localMirrorApiPath),
  }
}

export function getHostConnectionConfig(env: EnvRecord = process.env): HostConnectionConfig {
  const rawConfig = env.ATLAS_HOST_PREFLIGHT_CONFIG

  if (!rawConfig?.trim()) {
    return {
      configured: false,
      entries: [],
      errors: [],
    }
  }

  try {
    const parsed = JSON.parse(rawConfig) as unknown

    if (containsSecretConfigKey(parsed)) {
      return {
        configured: false,
        entries: [],
        errors: [
          'Host preflight config contains secret-shaped keys. Store only credentialRef labels in Atlas config.',
        ],
      }
    }

    const values = Array.isArray(parsed) ? parsed : isRecord(parsed) ? Object.values(parsed) : []
    const entries = values
      .map((value) => readHostConfigEntry(value))
      .filter((entry): entry is HostConnectionConfigEntry => Boolean(entry))

    return {
      configured: entries.length > 0,
      entries,
      errors: entries.length > 0 ? [] : ['No valid host preflight entries were found.'],
    }
  } catch (error) {
    return {
      configured: false,
      entries: [],
      errors: [
        error instanceof Error
          ? `Host preflight config JSON could not be parsed: ${error.message}`
          : 'Host preflight config JSON could not be parsed.',
      ],
    }
  }
}

export function createHostConnectionStatus(config: HostConnectionConfig) {
  return {
    ok: config.errors.length === 0,
    configured: config.configured,
    data: {
      configured: config.configured,
      configuredTargets: config.entries.map((entry) => ({
        targetId: entry.targetId,
        credentialRef: entry.credentialRef,
        host: entry.host,
        port: entry.port,
        hasLocalMirror: Boolean(entry.localMirrorRoot),
      })),
      message: config.configured
        ? 'Read-only host preflight config is available. No write checks are attempted.'
        : 'Set ATLAS_HOST_PREFLIGHT_CONFIG to enable read-only host boundary checks.',
    },
    error:
      config.errors.length > 0
        ? {
            type: 'invalid-config',
            message: config.errors.join(' '),
          }
        : null,
  }
}

function checkStatus(checks: HostConnectionCheck[]): HostConnectionCheckStatus {
  if (checks.some((check) => check.status === 'failed')) {
    return 'failed'
  }

  if (checks.some((check) => check.status === 'warning' || check.status === 'skipped')) {
    return 'warning'
  }

  if (checks.every((check) => check.status === 'not-configured')) {
    return 'not-configured'
  }

  return 'passing'
}

function makeHostCheck(
  check: Omit<HostConnectionCheck, 'id' | 'checkedAt'>,
  checkedAt: string,
): HostConnectionCheck {
  return {
    id: `host-${check.type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    checkedAt,
    ...check,
  }
}

function isPlaceholderHost(value: string) {
  return !value.trim() || value.includes('placeholder') || value.endsWith('.example')
}

export async function probeTcpHost(
  host: string,
  port: number,
  timeoutMs = HOST_TIMEOUT_MS,
): Promise<HostProbeResult> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    const done = (result: HostProbeResult) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(result)
    }

    socket.setTimeout(timeoutMs)
    socket.once('connect', () => done({ ok: true, message: `Host accepted TCP connection on ${port}.` }))
    socket.once('timeout', () => done({ ok: false, message: `Host connection timed out on ${port}.` }))
    socket.once('error', (error) =>
      done({ ok: false, message: error instanceof Error ? error.message : 'Host connection failed.' }),
    )
  })
}

async function probeLocalPath(value: string): Promise<PathProbeResult> {
  try {
    await access(value)
    return {
      exists: true,
      message: 'Read-only path existence check passed.',
    }
  } catch (error) {
    return {
      exists: false,
      message: error instanceof Error ? error.message : 'Read-only path existence check failed.',
    }
  }
}

function safeMirrorPath(root: string, requestedPath: string) {
  const rootPath = path.resolve(root)
  const relative = requestedPath.replace(/^\/+/, '')
  const resolved = path.resolve(rootPath, relative)

  if (resolved !== rootPath && !resolved.startsWith(`${rootPath}${path.sep}`)) {
    throw new Error(`Refusing to inspect path outside local mirror: ${requestedPath}`)
  }

  return resolved
}

export async function runHostConnectionPreflight({
  target,
  preservePaths,
  config,
  now = new Date(),
  probeHost = probeTcpHost,
  probePath = probeLocalPath,
}: {
  target: HostConnectionTargetInput
  preservePaths: string[]
  config: HostConnectionConfig
  now?: Date
  probeHost?: (host: string, port: number, timeoutMs?: number) => Promise<HostProbeResult>
  probePath?: (path: string) => Promise<PathProbeResult>
}): Promise<HostConnectionPreflightResult> {
  const checkedAt = now.toISOString()
  const targetId = target.targetId || target.id || ''
  const entry = config.entries.find((candidate) => candidate.targetId === targetId)
  const credentialRef = target.credentialRef || entry?.credentialRef || ''

  if (!config.configured || !entry) {
    const checks = [
      makeHostCheck(
        {
          type: 'credential-reference',
          label: 'Host preflight configuration',
          status: 'not-configured',
          message:
            config.errors.join(' ') ||
            `No ATLAS_HOST_PREFLIGHT_CONFIG entry is configured for ${targetId}.`,
        },
        checkedAt,
      ),
    ]

    return {
      targetId,
      configured: false,
      status: 'not-configured',
      checkedAt,
      credentialRef,
      message: 'Read-only host preflight is not configured for this target.',
      checks,
      warnings: checks.map((check) => check.message),
    }
  }

  const checks: HostConnectionCheck[] = []

  checks.push(
    makeHostCheck(
      {
        type: 'credential-reference',
        label: 'Credential reference',
        status: entry.credentialRef || target.credentialRef ? 'passing' : 'warning',
        message: entry.credentialRef || target.credentialRef
          ? `Using non-secret credential reference ${entry.credentialRef || target.credentialRef}.`
          : 'No credential reference label is configured. No credentials are stored or exposed.',
      },
      checkedAt,
    ),
  )

  const host = entry.host || target.remoteHost

  if (isPlaceholderHost(host)) {
    checks.push(
      makeHostCheck(
        {
          type: 'host-reachable',
          label: 'Host reachable',
          status: 'skipped',
          host,
          message: 'Host is missing or still a placeholder; no network request was attempted.',
        },
        checkedAt,
      ),
    )
  } else {
    const result = await probeHost(host, entry.port || 22, HOST_TIMEOUT_MS)
    checks.push(
      makeHostCheck(
        {
          type: 'host-reachable',
          label: 'Host reachable',
          status: result.ok ? 'passing' : 'failed',
          host,
          message: result.message,
        },
        checkedAt,
      ),
    )
  }

  if (!entry.localMirrorRoot) {
    checks.push(
      makeHostCheck(
        {
          type: 'target-root',
          label: 'Target root exists',
          status: 'skipped',
          path: target.remoteFrontendPath,
          message:
            'No read-only local mirror is configured. Remote path existence was not attempted.',
        },
        checkedAt,
      ),
      makeHostCheck(
        {
          type: 'api-root',
          label: '/api exists',
          status: 'skipped',
          path: target.remoteBackendPath || '/api',
          message:
            'No read-only local mirror is configured. Remote /api existence was not attempted.',
        },
        checkedAt,
      ),
    )
  } else {
    const rootResult = await probePath(path.resolve(entry.localMirrorRoot))
    checks.push(
      makeHostCheck(
        {
          type: 'target-root',
          label: 'Target root exists',
          status: rootResult.exists ? 'passing' : 'failed',
          path: target.remoteFrontendPath,
          message: rootResult.exists
            ? 'Read-only local mirror confirms target root exists.'
            : rootResult.message,
        },
        checkedAt,
      ),
    )

    const apiPath = entry.localMirrorApiPath || safeMirrorPath(entry.localMirrorRoot, '/api')
    const apiResult = await probePath(apiPath)
    checks.push(
      makeHostCheck(
        {
          type: 'api-root',
          label: '/api exists',
          status: apiResult.exists ? 'passing' : 'failed',
          path: target.remoteBackendPath || '/api',
          message: apiResult.exists
            ? 'Read-only local mirror confirms /api exists.'
            : apiResult.message,
        },
        checkedAt,
      ),
    )

    for (const preservePath of preservePaths) {
      try {
        const localPath = safeMirrorPath(entry.localMirrorRoot, preservePath)
        const result = await probePath(localPath)

        checks.push(
          makeHostCheck(
            {
              type: 'preserve-path',
              label: `Preserve path ${preservePath}`,
              status: result.exists ? 'passing' : 'warning',
              path: preservePath,
              message: result.exists
                ? 'Read-only local mirror confirms preserve path exists.'
                : result.message,
            },
            checkedAt,
          ),
        )
      } catch (error) {
        checks.push(
          makeHostCheck(
            {
              type: 'preserve-path',
              label: `Preserve path ${preservePath}`,
              status: 'failed',
              path: preservePath,
              message: error instanceof Error ? error.message : 'Preserve path check failed.',
            },
            checkedAt,
          ),
        )
      }
    }
  }

  const status = checkStatus(checks)

  return {
    targetId,
    configured: true,
    status,
    checkedAt,
    credentialRef,
    message:
      status === 'passing'
        ? 'Read-only host preflight completed without warnings.'
        : 'Read-only host preflight completed with warnings or failures.',
    checks,
    warnings: checks
      .filter((check) => check.status !== 'passing')
      .map((check) => `${check.label}: ${check.message}`),
  }
}

function healthResult({
  url,
  status,
  checkedAt,
  statusCode,
  message,
}: {
  url: string
  status: HealthCheckResult['status']
  checkedAt: string
  statusCode?: number
  message: string
}): HealthCheckResult {
  return {
    id: `health-${Date.now().toString(36)}`,
    url,
    status,
    checkedAt,
    statusCode,
    message,
  }
}

function parseHealthUrl(value: string | null) {
  if (!value) {
    throw new Error('Missing required url parameter.')
  }

  const parsed = new URL(value)

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Health checks only support http and https URLs.')
  }

  if (parsed.username || parsed.password) {
    throw new Error('Health check URLs must not include credentials.')
  }

  return parsed.toString()
}

function readHostPreflightTarget(url: URL): HostConnectionTargetInput {
  return {
    targetId: url.searchParams.get('targetId') ?? '',
    credentialRef: url.searchParams.get('credentialRef') ?? '',
    remoteHost: url.searchParams.get('remoteHost') ?? '',
    remoteFrontendPath: url.searchParams.get('remoteFrontendPath') ?? '',
    remoteBackendPath: url.searchParams.get('remoteBackendPath') ?? '',
  }
}

async function fetchWithTimeout(url: string, method: 'HEAD' | 'GET') {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)

  try {
    return await fetch(url, {
      method,
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/json,text/plain,*/*',
        'User-Agent': 'jamarq-atlas-dispatch-preflight',
      },
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function probeUrl(url: string) {
  const checkedAt = new Date().toISOString()

  try {
    let response = await fetchWithTimeout(url, 'HEAD')

    if ([403, 405, 501].includes(response.status)) {
      response = await fetchWithTimeout(url, 'GET')
    }

    const status =
      response.status >= 200 && response.status < 400
        ? 'passing'
        : response.status >= 400 && response.status < 500
          ? 'warning'
          : 'failed'

    return healthResult({
      url,
      status,
      checkedAt,
      statusCode: response.status,
      message:
        status === 'passing'
          ? 'Health URL responded successfully.'
          : `Health URL returned ${response.status} ${response.statusText}.`,
    })
  } catch (error) {
    return healthResult({
      url,
      status: 'failed',
      checkedAt,
      message: error instanceof Error ? error.message : 'Health check request failed.',
    })
  }
}

export async function dispatchApiMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next?: () => void,
) {
  if (!request.url?.startsWith('/api/dispatch')) {
    next?.()
    return
  }

  try {
    const url = new URL(request.url, 'http://localhost')
    if (url.pathname === '/api/dispatch/host-status') {
      json(response, 200, createHostConnectionStatus(getHostConnectionConfig()))
      return
    }

    if (url.pathname === '/api/dispatch/host-preflight') {
      const target = readHostPreflightTarget(url)

      if (!target.targetId) {
        json(response, 200, {
          result: {
            targetId: '',
            configured: false,
            status: 'not-configured',
            checkedAt: new Date().toISOString(),
            credentialRef: '',
            message: 'Host preflight requires a targetId.',
            checks: [],
            warnings: ['Host preflight requires a targetId.'],
          },
        })
        return
      }

      const result = await runHostConnectionPreflight({
        target,
        preservePaths: url.searchParams.getAll('preservePath'),
        config: getHostConnectionConfig(),
      })
      json(response, 200, { result })
      return
    }

    const requestedHealthUrl = url.searchParams.get('url') ?? ''

    if (url.pathname !== '/api/dispatch/health') {
      json(response, 404, {
        error: {
          type: 'unknown-route',
          message: 'Unknown Dispatch API route.',
        },
      })
      return
    }

    const healthUrl = parseHealthUrl(requestedHealthUrl)
    const result = await probeUrl(healthUrl)
    json(response, 200, { result })
  } catch (error) {
    const url = new URL(request.url ?? '', 'http://localhost')

    if (url.pathname === '/api/dispatch/host-preflight') {
      json(response, 200, {
        result: {
          targetId: url.searchParams.get('targetId') ?? '',
          configured: false,
          status: 'failed',
          checkedAt: new Date().toISOString(),
          credentialRef: url.searchParams.get('credentialRef') ?? '',
          message: error instanceof Error ? error.message : 'Atlas host preflight API failed.',
          checks: [],
          warnings: [error instanceof Error ? error.message : 'Atlas host preflight API failed.'],
        },
      })
      return
    }

    json(response, 200, {
      result: healthResult({
        url: url.searchParams.get('url') ?? '',
        status: 'failed',
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Atlas Dispatch API failed.',
      }),
    })
  }
}
