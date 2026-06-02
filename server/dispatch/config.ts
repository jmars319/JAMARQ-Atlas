import type { HostConnectionAuthMethod, HostConnectionProbeMode } from '../../src/domain/dispatch'

const SECRET_CONFIG_KEY_PATTERN = /(password|token|secret|api[-_]?key|private[-_]?key|passphrase)/i
const ALLOWED_SECRET_REFERENCE_KEYS = new Set([
  'passwordEnvVar',
  'privateKeyPathEnvVar',
  'passphraseEnvVar',
])

type EnvRecord = Record<string, string | undefined>

export interface HostConnectionConfigEntry {
  targetId: string
  credentialRef: string
  host: string
  port: number
  username: string
  probeMode: HostConnectionProbeMode
  localMirrorRoot: string
  localMirrorApiPath: string
  passwordEnvVar: string
  privateKeyPathEnvVar: string
  passphraseEnvVar: string
}

export interface HostConnectionConfig {
  configured: boolean
  entries: HostConnectionConfigEntry[]
  errors: string[]
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
    ([key, nested]) =>
      (!ALLOWED_SECRET_REFERENCE_KEYS.has(key) && SECRET_CONFIG_KEY_PATTERN.test(key)) ||
      containsSecretConfigKey(nested),
  )
}

function readProbeMode(value: unknown, localMirrorRoot: string): HostConnectionProbeMode {
  if (value === 'sftp-readonly' || value === 'local-mirror' || value === 'tcp') {
    return value
  }

  return localMirrorRoot ? 'local-mirror' : 'tcp'
}

function readHostConfigEntry(value: unknown): HostConnectionConfigEntry | null {
  if (!isRecord(value)) {
    return null
  }

  const targetId = readString(value.targetId)
  const localMirrorRoot = readString(value.localMirrorRoot)

  if (!targetId) {
    return null
  }

  return {
    targetId,
    credentialRef: readString(value.credentialRef),
    host: readString(value.host),
    port: readNumber(value.port, 22),
    username: readString(value.username),
    probeMode: readProbeMode(value.probeMode, localMirrorRoot),
    localMirrorRoot,
    localMirrorApiPath: readString(value.localMirrorApiPath),
    passwordEnvVar: readString(value.passwordEnvVar),
    privateKeyPathEnvVar: readString(value.privateKeyPathEnvVar),
    passphraseEnvVar: readString(value.passphraseEnvVar),
  }
}

export function authMethodForEntry(entry: HostConnectionConfigEntry): HostConnectionAuthMethod {
  if (entry.privateKeyPathEnvVar) {
    return 'private-key-env'
  }

  if (entry.passwordEnvVar) {
    return 'password-env'
  }

  return entry.probeMode === 'sftp-readonly' ? 'not-configured' : 'none'
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
        probeMode: entry.probeMode,
        authMethod: authMethodForEntry(entry),
        sftpEnabled: entry.probeMode === 'sftp-readonly',
        hasLocalMirror: Boolean(entry.localMirrorRoot),
      })),
      sftpEnabledCount: config.entries.filter((entry) => entry.probeMode === 'sftp-readonly')
        .length,
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
