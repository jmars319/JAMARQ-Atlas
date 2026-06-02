import { parseRepositoryFullName } from '../repoBinding'
import { isMissing, splitListValue } from './shared'
import type { CalibrationQualityMessage } from './types'

const PLACEHOLDER_PATTERN = /\b(placeholder|example|needs real|tbd|todo|unknown|not set)\b/i
const SECRET_SHAPED_PATTERN =
  /(password|passphrase|secret|token|api[_ -]?key|apikey|private[_ -]?key|credential|env[_ -]?var)/i

export function isPlaceholderValue(value: string | string[] | null | undefined): boolean {
  if (isMissing(value)) {
    return true
  }

  if (Array.isArray(value)) {
    return value.some((item) => isPlaceholderValue(item))
  }

  return PLACEHOLDER_PATTERN.test(value ?? '')
}

export function isSecretLikeValue(value: string) {
  return SECRET_SHAPED_PATTERN.test(value)
}

export function canStoreCalibrationValue(value: string) {
  if (isSecretLikeValue(value)) {
    return {
      ok: false,
      message:
        'This looks credential-shaped. Store only non-secret host/path values or a credential reference label.',
    }
  }

  return {
    ok: true,
    message: '',
  }
}

export function validateCalibrationDataQuality(
  field: string,
  value: string,
): CalibrationQualityMessage[] {
  const trimmed = value.trim()
  const messages: CalibrationQualityMessage[] = []

  if (!trimmed) {
    return messages
  }

  if (isSecretLikeValue(trimmed)) {
    messages.push({
      field,
      level: 'blocked',
      message: 'Secret-shaped values cannot be stored in Atlas calibration data.',
    })
  }

  if (isPlaceholderValue(trimmed)) {
    messages.push({
      field,
      level: 'warning',
      message: 'Value still looks like placeholder data.',
    })
  }

  if (field === 'publicUrl' || field === 'healthCheckUrls') {
    const values = field === 'healthCheckUrls' ? splitListValue(trimmed) : [trimmed]

    for (const url of values) {
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          messages.push({
            field,
            level: 'warning',
            message: 'URL should use http or https.',
          })
        }
      } catch {
        messages.push({
          field,
          level: 'warning',
          message: 'URL is not parseable. Include http:// or https://.',
        })
      }
    }
  }

  if (
    field === 'remoteFrontendPath' ||
    field === 'remoteBackendPath' ||
    field === 'healthCheckUrls'
  ) {
    if (/(^|\/)\.\.(\/|$)/.test(trimmed)) {
      messages.push({
        field,
        level: 'warning',
        message: 'Path contains parent traversal markers.',
      })
    }
  }

  if (field === 'remoteBackendPath' && !/\/api(\/|$)/.test(trimmed)) {
    messages.push({
      field,
      level: 'warning',
      message: 'cPanel backend path usually contains /api.',
    })
  }

  if (field === 'databaseName' && /(password|token|secret|key)=/i.test(trimmed)) {
    messages.push({
      field,
      level: 'blocked',
      message: 'Database name looks like a credential assignment.',
    })
  }

  if (field === 'repository') {
    const parsed = parseRepositoryFullName(trimmed)
    if (
      !parsed ||
      !/^[A-Za-z0-9_.-]+$/.test(parsed.owner) ||
      !/^[A-Za-z0-9_.-]+$/.test(parsed.name)
    ) {
      messages.push({
        field,
        level: 'warning',
        message: 'Repository should be owner/repo or a GitHub repository URL.',
      })
    }
  }

  return messages
}
