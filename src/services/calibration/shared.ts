export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.filter((item): item is string => typeof item === 'string')
}

export function safeDate(value: unknown, fallback: Date) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value
  }

  return fallback.toISOString()
}

export function createCalibrationId(prefix: string, now = new Date()) {
  return `${prefix}-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function isMissing(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) {
    return value.length === 0 || value.every((item) => item.trim() === '')
  }

  return !value || value.trim() === ''
}

export function valueLabel(value: string | string[]) {
  return Array.isArray(value) ? value.join('\n') : value
}

export function splitListValue(value: string) {
  return value
    .split(/\n|\|/)
    .map((item) => item.trim())
    .filter(Boolean)
}
