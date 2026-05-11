import {
  ATLAS_SETTINGS_SCHEMA_VERSION,
  type AtlasConnectionCard,
  type AtlasSettingsState,
} from '../domain/settings'

const DEFAULT_LABEL = 'Local Atlas workspace'
const SECRET_KEY_PATTERN = /(token|secret|password|credential|api[-_ ]?key|private[-_ ]?key)/i

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function safeDate(value: unknown, fallback: Date) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value
  }

  return fallback.toISOString()
}

function createDeviceId(now = new Date()) {
  return `atlas-local-${now.getTime().toString(36)}`
}

export function emptySettingsState(now = new Date()): AtlasSettingsState {
  return {
    schemaVersion: ATLAS_SETTINGS_SCHEMA_VERSION,
    deviceId: createDeviceId(now),
    deviceLabel: DEFAULT_LABEL,
    operatorLabel: '',
    notes: '',
    updatedAt: now.toISOString(),
  }
}

export function normalizeSettingsState(value: unknown, now = new Date()): AtlasSettingsState {
  const defaults = emptySettingsState(now)

  if (!isRecord(value)) {
    return defaults
  }

  return {
    schemaVersion: ATLAS_SETTINGS_SCHEMA_VERSION,
    deviceId: readString(value.deviceId) || defaults.deviceId,
    deviceLabel: readString(value.deviceLabel) || defaults.deviceLabel,
    operatorLabel: readString(value.operatorLabel),
    notes: readString(value.notes),
    updatedAt: safeDate(value.updatedAt, now),
  }
}

export function updateSettings(
  current: AtlasSettingsState,
  update: Partial<Pick<AtlasSettingsState, 'deviceLabel' | 'operatorLabel' | 'notes'>>,
  now = new Date(),
): AtlasSettingsState {
  return {
    ...current,
    ...update,
    schemaVersion: ATLAS_SETTINGS_SCHEMA_VERSION,
    updatedAt: now.toISOString(),
  }
}

export function containsSecretShapedSettingsFields(value: unknown) {
  if (!isRecord(value)) {
    return false
  }

  return Object.keys(value).some((key) => SECRET_KEY_PATTERN.test(key))
}

export function buildStaticConnectionCards(): AtlasConnectionCard[] {
  return [
    {
      id: 'dispatch',
      title: 'Dispatch Health & Preflight',
      status: 'available',
      summary: 'Read-only local health probing is available.',
      detail:
        'Dispatch preflight uses the local /api/dispatch/health boundary and does not deploy, upload, back up, or restore anything.',
    },
    {
      id: 'data',
      title: 'Data Center',
      status: 'available',
      summary: 'Local JSON backup and restore preview are available.',
      detail:
        'Backups are browser-local and exclude tokens, env vars, browser secrets, and unknown localStorage keys.',
    },
  ]
}
