import type {
  DispatchEvidenceStatus,
  DispatchHostEvidenceRun,
  DispatchState,
  DispatchVerificationEvidenceCheck,
  DispatchVerificationEvidenceRun,
  HealthCheckStatus,
  HostConnectionCheck,
  HostConnectionCheckStatus,
  HostConnectionPreflightResult,
} from '../domain/dispatch'
import type { DeploymentVerificationEvidence } from './deployPreflight'

const EVIDENCE_HISTORY_LIMIT = 50

function stamp(now = new Date()) {
  return now.toISOString()
}

function evidenceId(prefix: string, now = new Date()) {
  return `${prefix}-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function readNumberArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item))
    : []
}

function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : false
}

function safeDate(value: unknown, fallback: Date) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value
  }

  return stamp(fallback)
}

function normalizeEvidenceStatus(value: unknown): DispatchEvidenceStatus {
  return ['not-configured', 'passing', 'warning', 'failed', 'skipped'].includes(String(value))
    ? (value as DispatchEvidenceStatus)
    : 'skipped'
}

function normalizeHostCheck(value: unknown, now: Date): HostConnectionCheck | null {
  if (!isRecord(value)) {
    return null
  }

  const id = readString(value.id)
  const type = readString(value.type) as HostConnectionCheck['type']

  if (!id || !type) {
    return null
  }

  return {
    id,
    type,
    label: readString(value.label) || type,
    status: normalizeEvidenceStatus(value.status) as HostConnectionCheckStatus,
    message: readString(value.message),
    checkedAt: safeDate(value.checkedAt, now),
    path: readString(value.path) || undefined,
    host: readString(value.host) || undefined,
  }
}

function normalizeVerificationCheck(
  value: unknown,
  now: Date,
): DispatchVerificationEvidenceCheck | null {
  if (!isRecord(value)) {
    return null
  }

  const id = readString(value.id)

  if (!id) {
    return null
  }

  return {
    id,
    label: readString(value.label) || 'Verification check',
    method: readString(value.method) === 'GET' ? 'GET' : 'HEAD',
    url: readString(value.url),
    urlPath: readString(value.urlPath),
    expectedStatuses: readNumberArray(value.expectedStatuses),
    protectedResource: readBoolean(value.protectedResource),
    status: normalizeEvidenceStatus(value.status),
    observedStatusCode:
      typeof value.observedStatusCode === 'number' && Number.isFinite(value.observedStatusCode)
        ? value.observedStatusCode
        : undefined,
    message: readString(value.message),
    checkedAt: safeDate(value.checkedAt, now),
  }
}

export function normalizeHostEvidenceRuns(value: unknown, now = new Date()) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item): DispatchHostEvidenceRun[] => {
    if (!isRecord(item)) {
      return []
    }

    const id = readString(item.id)
    const projectId = readString(item.projectId)
    const targetId = readString(item.targetId)

    if (!id || !projectId || !targetId) {
      return []
    }

    return [
      {
        id,
        source: 'host-preflight',
        projectId,
        targetId,
        startedAt: safeDate(item.startedAt, now),
        completedAt: safeDate(item.completedAt, now),
        status: normalizeEvidenceStatus(item.status),
        summary: readString(item.summary),
        credentialRef: readString(item.credentialRef),
        checks: Array.isArray(item.checks)
          ? item.checks
              .map((check) => normalizeHostCheck(check, now))
              .filter((check): check is HostConnectionCheck => check !== null)
          : [],
        warnings: readStringArray(item.warnings),
      },
    ]
  })
}

export function normalizeVerificationEvidenceRuns(value: unknown, now = new Date()) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item): DispatchVerificationEvidenceRun[] => {
    if (!isRecord(item)) {
      return []
    }

    const id = readString(item.id)
    const projectId = readString(item.projectId)
    const targetId = readString(item.targetId)
    const runbookId = readString(item.runbookId)

    if (!id || !projectId || !targetId || !runbookId) {
      return []
    }

    return [
      {
        id,
        source: 'runbook-verification',
        projectId,
        targetId,
        runbookId,
        startedAt: safeDate(item.startedAt, now),
        completedAt: safeDate(item.completedAt, now),
        status: normalizeEvidenceStatus(item.status),
        summary: readString(item.summary),
        checks: Array.isArray(item.checks)
          ? item.checks
              .map((check) => normalizeVerificationCheck(check, now))
              .filter(
                (check): check is DispatchVerificationEvidenceCheck => check !== null,
              )
          : [],
        warnings: readStringArray(item.warnings),
      },
    ]
  })
}

function statusFromHealth(status: HealthCheckStatus): DispatchEvidenceStatus {
  if (status === 'passing') {
    return 'passing'
  }

  if (status === 'warning') {
    return 'warning'
  }

  if (status === 'failed') {
    return 'failed'
  }

  return 'skipped'
}

function summarizeEvidenceStatuses(statuses: DispatchEvidenceStatus[]): DispatchEvidenceStatus {
  if (statuses.some((status) => status === 'failed')) {
    return 'failed'
  }

  if (statuses.some((status) => status === 'warning' || status === 'not-configured')) {
    return 'warning'
  }

  if (statuses.length > 0 && statuses.every((status) => status === 'skipped')) {
    return 'skipped'
  }

  return 'passing'
}

export function createHostEvidenceRun({
  projectId,
  result,
  now = new Date(),
}: {
  projectId: string
  result: HostConnectionPreflightResult
  now?: Date
}): DispatchHostEvidenceRun {
  const completedAt = result.checkedAt || stamp(now)

  return {
    id: evidenceId('host-evidence', new Date(completedAt)),
    source: 'host-preflight',
    projectId,
    targetId: result.targetId,
    startedAt: completedAt,
    completedAt,
    status: result.status,
    summary: result.message,
    credentialRef: result.credentialRef,
    checks: result.checks,
    warnings: result.warnings,
  }
}

export function createVerificationEvidenceRun({
  projectId,
  targetId,
  runbookId,
  evidence,
  now = new Date(),
}: {
  projectId: string
  targetId: string
  runbookId: string
  evidence: DeploymentVerificationEvidence[]
  now?: Date
}): DispatchVerificationEvidenceRun {
  const completedAt = stamp(now)
  const checks = evidence.map((item): DispatchVerificationEvidenceCheck => {
    const status = item.passedExpectation ? 'passing' : statusFromHealth(item.result.status)

    return {
      id: item.check.id,
      label: item.check.label,
      method: item.check.method,
      url: item.url,
      urlPath: item.check.urlPath,
      expectedStatuses: item.check.expectedStatuses,
      protectedResource: item.check.protectedResource,
      status,
      observedStatusCode: item.result.statusCode,
      message: item.message,
      checkedAt: item.result.checkedAt || completedAt,
    }
  })
  const status = summarizeEvidenceStatuses(checks.map((check) => check.status))
  const warnings = checks
    .filter((check) => check.status !== 'passing')
    .map((check) => `${check.label}: ${check.message}`)

  return {
    id: evidenceId('verification-evidence', new Date(completedAt)),
    source: 'runbook-verification',
    projectId,
    targetId,
    runbookId,
    startedAt: completedAt,
    completedAt,
    status,
    summary:
      status === 'passing'
        ? 'Runbook verification checks matched expected statuses.'
        : `${warnings.length} verification checks need human review.`,
    checks,
    warnings,
  }
}

export function addHostEvidenceRun(
  state: DispatchState,
  run: DispatchHostEvidenceRun,
): DispatchState {
  return {
    ...state,
    hostEvidenceRuns: [
      run,
      ...state.hostEvidenceRuns.filter((existingRun) => existingRun.id !== run.id),
    ].slice(0, EVIDENCE_HISTORY_LIMIT),
  }
}

export function addVerificationEvidenceRun(
  state: DispatchState,
  run: DispatchVerificationEvidenceRun,
): DispatchState {
  return {
    ...state,
    verificationEvidenceRuns: [
      run,
      ...state.verificationEvidenceRuns.filter((existingRun) => existingRun.id !== run.id),
    ].slice(0, EVIDENCE_HISTORY_LIMIT),
  }
}
