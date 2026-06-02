import { readFileSync } from 'node:fs'
import { access } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import SftpClient from 'ssh2-sftp-client'
import type {
  HostConnectionAuthMethod,
  HostConnectionCheck,
  HostConnectionCheckStatus,
  HostConnectionPreflightResult,
} from '../../src/domain/dispatch'
import { authMethodForEntry, type HostConnectionConfig, type HostConnectionConfigEntry } from './config'

const HOST_TIMEOUT_MS = 5000

const SFTP_TIMEOUT_MS = 7000

type EnvRecord = Record<string, string | undefined>

export interface HostConnectionTargetInput {
  targetId?: string
  id?: string
  credentialRef: string
  remoteHost: string
  remoteUser: string
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

interface SftpPathStats {
  isDirectory?: boolean | (() => boolean)
  isFile?: boolean | (() => boolean)
}

interface SftpListItem {
  type?: string
}

interface SftpReadOnlyClient {
  connect(options: Record<string, unknown>): Promise<unknown>
  stat(remotePath: string): Promise<SftpPathStats>
  list(remotePath: string): Promise<SftpListItem[]>
  end(): Promise<unknown>
}

interface SftpPathProbeResult {
  exists: boolean
  status: HostConnectionCheckStatus
  message: string
  entryCount?: number
  fileCount?: number
  directoryCount?: number
  symlinkCount?: number
}

const SftpClientConstructor = SftpClient as unknown as new (
  name?: string,
) => SftpReadOnlyClient

function checkStatus(checks: HostConnectionCheck[]): HostConnectionCheckStatus {
  if (checks.some((check) => check.status === 'failed')) {
    return 'failed'
  }

  if (checks.every((check) => check.status === 'not-configured')) {
    return 'not-configured'
  }

  if (
    checks.some((check) =>
      ['warning', 'skipped', 'not-configured'].includes(check.status),
    )
  ) {
    return 'warning'
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

export function isPlaceholderHost(value: string) {
  return !value.trim() || value.includes('placeholder') || value.endsWith('.example')
}

export function isPlaceholderPath(value: string) {
  return !value.trim() || value.includes('placeholder') || value.includes('example')
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

function remotePosixJoin(...segments: string[]) {
  return path.posix.normalize(path.posix.join(...segments.filter(Boolean)))
}

function resolveRemotePreservePath(target: HostConnectionTargetInput, preservePath: string) {
  if (!preservePath) {
    return ''
  }

  if (preservePath.startsWith('/api/') && target.remoteBackendPath) {
    return remotePosixJoin(target.remoteBackendPath, preservePath.replace(/^\/api\/?/, ''))
  }

  if (preservePath === '/api' && target.remoteBackendPath) {
    return target.remoteBackendPath
  }

  if (target.remoteFrontendPath) {
    return remotePosixJoin(target.remoteFrontendPath, preservePath.replace(/^\/+/, ''))
  }

  return preservePath
}

function statFlag(value: boolean | (() => boolean) | undefined) {
  return typeof value === 'function' ? value() : Boolean(value)
}

function summarizeDirectoryEntries(entries: SftpListItem[]) {
  const fileCount = entries.filter((entry) => entry.type === '-').length
  const directoryCount = entries.filter((entry) => entry.type === 'd').length
  const symlinkCount = entries.filter((entry) => entry.type === 'l').length

  return {
    entryCount: entries.length,
    fileCount,
    directoryCount,
    symlinkCount,
  }
}

async function probeSftpPath(
  client: SftpReadOnlyClient,
  remotePath: string,
): Promise<SftpPathProbeResult> {
  if (isPlaceholderPath(remotePath)) {
    return {
      exists: false,
      status: 'skipped',
      message: 'Remote path is missing or still a sample value; no SFTP stat was attempted.',
    }
  }

  try {
    const stats = await client.stat(remotePath)
    const isDirectory = statFlag(stats.isDirectory)

    if (!isDirectory) {
      return {
        exists: true,
        status: 'passing',
        message: statFlag(stats.isFile)
          ? 'SFTP read-only stat confirms file exists.'
          : 'SFTP read-only stat confirms path exists.',
      }
    }

    try {
      const summary = summarizeDirectoryEntries(await client.list(remotePath))

      return {
        exists: true,
        status: 'passing',
        message: `SFTP read-only stat confirms directory exists; ${summary.entryCount} top-level entries counted.`,
        ...summary,
      }
    } catch (error) {
      return {
        exists: true,
        status: 'warning',
        message:
          error instanceof Error
            ? `SFTP read-only stat passed; directory summary failed: ${error.message}`
            : 'SFTP read-only stat passed; directory summary failed.',
      }
    }
  } catch (error) {
    return {
      exists: false,
      status: 'failed',
      message: error instanceof Error ? error.message : 'SFTP read-only stat failed.',
    }
  }
}

function resolveSftpAuth(
  entry: HostConnectionConfigEntry,
  target: HostConnectionTargetInput,
  env: EnvRecord,
) {
  const username = entry.username || target.remoteUser

  if (!username) {
    return {
      ok: false,
      authMethod: 'not-configured' as HostConnectionAuthMethod,
      message: 'SFTP read-only probe requires a username from config or target metadata.',
      options: null,
    }
  }

  const baseOptions: Record<string, unknown> = {
    host: entry.host || target.remoteHost,
    port: entry.port || 22,
    username,
    readyTimeout: SFTP_TIMEOUT_MS,
  }
  const privateKeyPath = entry.privateKeyPathEnvVar ? env[entry.privateKeyPathEnvVar] : ''
  const password = entry.passwordEnvVar ? env[entry.passwordEnvVar] : ''

  if (privateKeyPath) {
    try {
      return {
        ok: true,
        authMethod: 'private-key-env' as HostConnectionAuthMethod,
        message: 'Using private-key env reference for read-only SFTP auth.',
        options: {
          ...baseOptions,
          privateKey: readFileSync(privateKeyPath, 'utf8'),
          passphrase: entry.passphraseEnvVar ? env[entry.passphraseEnvVar] : undefined,
        },
      }
    } catch (error) {
      return {
        ok: false,
        authMethod: 'private-key-env' as HostConnectionAuthMethod,
        message:
          error instanceof Error
            ? `Private-key env reference could not be read: ${error.message}`
            : 'Private-key env reference could not be read.',
        options: null,
      }
    }
  }

  if (password) {
    return {
      ok: true,
      authMethod: 'password-env' as HostConnectionAuthMethod,
      message: 'Using password env reference for read-only SFTP auth.',
      options: {
        ...baseOptions,
        password,
      },
    }
  }

  return {
    ok: false,
    authMethod: authMethodForEntry(entry),
    message:
      entry.passwordEnvVar || entry.privateKeyPathEnvVar
        ? 'SFTP credential env var reference is configured but the env var value is missing.'
        : 'SFTP read-only probe requires passwordEnvVar or privateKeyPathEnvVar.',
    options: null,
  }
}

function createSftpClient(): SftpReadOnlyClient {
  return new SftpClientConstructor('atlas-read-only-host-inspector')
}

export async function runHostConnectionPreflight({
  target,
  preservePaths,
  config,
  now = new Date(),
  env = process.env,
  probeHost = probeTcpHost,
  probePath = probeLocalPath,
  createSftp = createSftpClient,
}: {
  target: HostConnectionTargetInput
  preservePaths: string[]
  config: HostConnectionConfig
  now?: Date
  env?: EnvRecord
  probeHost?: (host: string, port: number, timeoutMs?: number) => Promise<HostProbeResult>
  probePath?: (path: string) => Promise<PathProbeResult>
  createSftp?: () => SftpReadOnlyClient
}): Promise<HostConnectionPreflightResult> {
  const checkedAt = now.toISOString()
  const targetId = target.targetId || target.id || ''
  const entry = config.entries.find((candidate) => candidate.targetId === targetId)
  const credentialRef = target.credentialRef || entry?.credentialRef || ''
  const probeMode = entry?.probeMode ?? 'tcp'
  const authMethod = entry ? authMethodForEntry(entry) : 'not-configured'

  if (!config.configured || !entry) {
    const checks = [
      makeHostCheck(
        {
          type: 'credential-reference',
          label: 'Host preflight configuration',
          status: 'not-configured',
          probeMode,
          authMethod,
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
      probeMode,
      authMethod,
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
        probeMode,
        authMethod,
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
          probeMode,
          authMethod,
          message: 'Host is missing or still a sample value; no network request was attempted.',
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
          probeMode,
          authMethod,
          message: result.message,
        },
        checkedAt,
      ),
    )
  }

  if (entry.probeMode === 'sftp-readonly') {
    const auth = resolveSftpAuth(entry, target, env)

    if (!auth.ok || !auth.options) {
      checks.push(
        makeHostCheck(
          {
            type: 'sftp-connect',
            label: 'SFTP read-only auth',
            status: 'not-configured',
            host,
            probeMode,
            authMethod: auth.authMethod,
            message: auth.message,
          },
          checkedAt,
        ),
      )
    } else if (isPlaceholderHost(host)) {
      checks.push(
        makeHostCheck(
          {
            type: 'sftp-connect',
            label: 'SFTP read-only auth',
            status: 'skipped',
            host,
            probeMode,
            authMethod: auth.authMethod,
            message: 'Host is missing or still a sample value; no SFTP connection was attempted.',
          },
          checkedAt,
        ),
      )
    } else {
      const client = createSftp()
      let connected = false

      try {
        await client.connect(auth.options)
        connected = true
        checks.push(
          makeHostCheck(
            {
              type: 'sftp-connect',
              label: 'SFTP read-only auth',
              status: 'passing',
              host,
              probeMode,
              authMethod: auth.authMethod,
              message: 'SFTP read-only connection established. No write methods are used.',
            },
            checkedAt,
          ),
        )

        const pathChecks: Array<{
          type: HostConnectionCheck['type']
          label: string
          path: string
          missingStatus: HostConnectionCheckStatus
        }> = [
          {
            type: 'target-root',
            label: 'Target root exists',
            path: target.remoteFrontendPath,
            missingStatus: 'failed',
          },
          {
            type: 'api-root',
            label: '/api exists',
            path: target.remoteBackendPath || resolveRemotePreservePath(target, '/api'),
            missingStatus: 'failed',
          },
          ...preservePaths.map((preservePath) => ({
            type: 'preserve-path' as const,
            label: `Preserve path ${preservePath}`,
            path: resolveRemotePreservePath(target, preservePath),
            missingStatus: 'warning' as const,
          })),
        ]

        for (const item of pathChecks) {
          const result = await probeSftpPath(client, item.path)
          checks.push(
            makeHostCheck(
              {
                type: item.type,
                label: item.label,
                status: result.exists ? result.status : item.missingStatus,
                path: item.path,
                probeMode,
                authMethod: auth.authMethod,
                message: result.message,
                entryCount: result.entryCount,
                fileCount: result.fileCount,
                directoryCount: result.directoryCount,
                symlinkCount: result.symlinkCount,
              },
              checkedAt,
            ),
          )
        }
      } catch (error) {
        checks.push(
          makeHostCheck(
            {
              type: 'sftp-connect',
              label: 'SFTP read-only auth',
              status: 'failed',
              host,
              probeMode,
              authMethod: auth.authMethod,
              message: error instanceof Error ? error.message : 'SFTP read-only connection failed.',
            },
            checkedAt,
          ),
        )
      } finally {
        if (connected) {
          await client.end().catch(() => false)
        }
      }
    }
  } else if (!entry.localMirrorRoot) {
    checks.push(
      makeHostCheck(
        {
          type: 'target-root',
          label: 'Target root exists',
          status: 'skipped',
          path: target.remoteFrontendPath,
          probeMode,
          authMethod,
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
          probeMode,
          authMethod,
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
          probeMode,
          authMethod,
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
          probeMode,
          authMethod,
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
              probeMode,
              authMethod,
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
              probeMode,
              authMethod,
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
    probeMode,
    authMethod,
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
