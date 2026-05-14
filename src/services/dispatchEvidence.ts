import type {
  DispatchEvidenceStatus,
  DispatchEvidenceRetentionPolicy,
  DispatchHostEvidenceRun,
  DispatchState,
  DispatchVerificationEvidenceCheck,
  DispatchVerificationEvidenceRun,
  HealthCheckStatus,
  HostConnectionCheck,
  HostConnectionAuthMethod,
  HostConnectionCheckStatus,
  HostConnectionPreflightResult,
  HostConnectionProbeMode,
} from '../domain/dispatch'
import type { DeploymentVerificationEvidence } from './deployPreflight'

export const DISPATCH_EVIDENCE_HISTORY_LIMIT = 50
export const DISPATCH_EVIDENCE_MIN_HISTORY_LIMIT = 5
export const DEFAULT_DISPATCH_EVIDENCE_RETENTION_POLICY: DispatchEvidenceRetentionPolicy = {
  hostRunLimit: DISPATCH_EVIDENCE_HISTORY_LIMIT,
  verificationRunLimit: DISPATCH_EVIDENCE_HISTORY_LIMIT,
  preserveFailedRuns: true,
}

export type DispatchEvidenceChangeKind = 'added' | 'removed' | 'changed' | 'unchanged'

export interface DispatchEvidenceChange {
  id: string
  label: string
  kind: DispatchEvidenceChangeKind
  before: string
  after: string
}

export interface DispatchEvidenceComparison {
  changed: boolean
  summary: string
  baselineId: string | null
  currentId: string | null
  changes: DispatchEvidenceChange[]
}

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

function readPositiveInteger(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : fallback
}

function clampHistoryLimit(value: number) {
  return Math.min(
    DISPATCH_EVIDENCE_HISTORY_LIMIT,
    Math.max(DISPATCH_EVIDENCE_MIN_HISTORY_LIMIT, value),
  )
}

export function normalizeEvidenceRetentionPolicy(
  value: unknown,
): DispatchEvidenceRetentionPolicy {
  if (!isRecord(value)) {
    return DEFAULT_DISPATCH_EVIDENCE_RETENTION_POLICY
  }

  return {
    hostRunLimit: clampHistoryLimit(
      readPositiveInteger(
        value.hostRunLimit,
        DEFAULT_DISPATCH_EVIDENCE_RETENTION_POLICY.hostRunLimit,
      ),
    ),
    verificationRunLimit: clampHistoryLimit(
      readPositiveInteger(
        value.verificationRunLimit,
        DEFAULT_DISPATCH_EVIDENCE_RETENTION_POLICY.verificationRunLimit,
      ),
    ),
    preserveFailedRuns:
      typeof value.preserveFailedRuns === 'boolean'
        ? value.preserveFailedRuns
        : DEFAULT_DISPATCH_EVIDENCE_RETENTION_POLICY.preserveFailedRuns,
  }
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

function normalizeProbeMode(value: unknown): HostConnectionProbeMode {
  return ['tcp', 'local-mirror', 'sftp-readonly'].includes(String(value))
    ? (value as HostConnectionProbeMode)
    : 'tcp'
}

function normalizeAuthMethod(value: unknown): HostConnectionAuthMethod {
  return ['none', 'password-env', 'private-key-env', 'not-configured'].includes(String(value))
    ? (value as HostConnectionAuthMethod)
    : 'none'
}

function readOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
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
    probeMode: normalizeProbeMode(value.probeMode),
    authMethod: normalizeAuthMethod(value.authMethod),
    entryCount: readOptionalNumber(value.entryCount),
    fileCount: readOptionalNumber(value.fileCount),
    directoryCount: readOptionalNumber(value.directoryCount),
    symlinkCount: readOptionalNumber(value.symlinkCount),
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
        probeMode: normalizeProbeMode(item.probeMode),
        authMethod: normalizeAuthMethod(item.authMethod),
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

function describeHostCheck(check: HostConnectionCheck) {
  const status = check.status
  const countParts = [
    typeof check.entryCount === 'number' ? `${check.entryCount} entries` : '',
    typeof check.fileCount === 'number' ? `${check.fileCount} files` : '',
    typeof check.directoryCount === 'number' ? `${check.directoryCount} folders` : '',
    typeof check.symlinkCount === 'number' ? `${check.symlinkCount} links` : '',
  ].filter(Boolean)
  const locationParts = [check.host, check.path, check.probeMode, check.authMethod].filter(Boolean)
  const details = [...locationParts, ...countParts]

  return [status, check.message, details.join(' / ')].filter(Boolean).join(' - ')
}

function describeVerificationCheck(check: DispatchVerificationEvidenceCheck) {
  const observed =
    typeof check.observedStatusCode === 'number' ? `observed ${check.observedStatusCode}` : 'no status'

  return [
    check.status,
    observed,
    check.message,
    check.expectedStatuses.length > 0 ? `expected ${check.expectedStatuses.join('/')}` : '',
  ]
    .filter(Boolean)
    .join(' - ')
}

function compareEvidenceItems<T extends { id: string; label: string }>(
  beforeItems: T[],
  afterItems: T[],
  describe: (item: T) => string,
): DispatchEvidenceChange[] {
  const beforeById = new Map(beforeItems.map((item) => [item.id, item]))
  const afterById = new Map(afterItems.map((item) => [item.id, item]))
  const ids = Array.from(new Set([...beforeById.keys(), ...afterById.keys()])).sort()

  return ids.flatMap((id): DispatchEvidenceChange[] => {
    const before = beforeById.get(id)
    const after = afterById.get(id)

    if (!before && after) {
      return [
        {
          id,
          label: after.label,
          kind: 'added',
          before: 'Not present in previous evidence.',
          after: describe(after),
        },
      ]
    }

    if (before && !after) {
      return [
        {
          id,
          label: before.label,
          kind: 'removed',
          before: describe(before),
          after: 'Not present in latest evidence.',
        },
      ]
    }

    if (!before || !after) {
      return []
    }

    const beforeDescription = describe(before)
    const afterDescription = describe(after)

    return [
      {
        id,
        label: after.label,
        kind: beforeDescription === afterDescription ? 'unchanged' : 'changed',
        before: beforeDescription,
        after: afterDescription,
      },
    ]
  })
}

function comparisonSummary(changes: DispatchEvidenceChange[], baselineId: string | null) {
  if (!baselineId) {
    return 'No previous evidence run is available for comparison.'
  }

  const materialChanges = changes.filter((change) => change.kind !== 'unchanged')

  if (materialChanges.length === 0) {
    return 'No changes since last evidence.'
  }

  const changed = materialChanges.filter((change) => change.kind === 'changed').length
  const added = materialChanges.filter((change) => change.kind === 'added').length
  const removed = materialChanges.filter((change) => change.kind === 'removed').length
  const parts = [
    changed > 0 ? `${changed} changed` : '',
    added > 0 ? `${added} added` : '',
    removed > 0 ? `${removed} removed` : '',
  ].filter(Boolean)

  return `Changed since last evidence: ${parts.join(', ')}.`
}

function retainEvidenceRuns<T extends { id: string; status: DispatchEvidenceStatus; startedAt: string }>(
  runs: T[],
  limit: number,
  preserveFailedRuns: boolean,
) {
  const orderedRuns = [...runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))

  if (!preserveFailedRuns || orderedRuns.length <= limit) {
    return orderedRuns.slice(0, limit)
  }

  const retained = orderedRuns.slice(0, limit)
  const retainedIds = new Set(retained.map((run) => run.id))

  for (const run of orderedRuns.slice(limit)) {
    if (run.status === 'failed' && !retainedIds.has(run.id)) {
      retained.push(run)
      retainedIds.add(run.id)
    }
  }

  return retained.slice(0, DISPATCH_EVIDENCE_HISTORY_LIMIT)
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
    probeMode: result.probeMode,
    authMethod: result.authMethod,
    checks: result.checks,
    warnings: result.warnings,
  }
}

export function formatHostEvidenceProbeLabel(run: {
  probeMode: HostConnectionProbeMode
  authMethod: HostConnectionAuthMethod
  credentialRef?: string
}) {
  const probeLabel: Record<HostConnectionProbeMode, string> = {
    tcp: 'TCP reachability',
    'local-mirror': 'Local mirror',
    'sftp-readonly': 'SFTP read-only',
  }
  const authLabel: Record<HostConnectionAuthMethod, string> = {
    none: 'no auth',
    'password-env': 'password env ref',
    'private-key-env': 'private key env ref',
    'not-configured': 'auth not configured',
  }

  return `${probeLabel[run.probeMode]} / ${authLabel[run.authMethod]}${
    run.credentialRef ? ` / ${run.credentialRef}` : ''
  }`
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

export function compareHostEvidenceRuns(
  current: DispatchHostEvidenceRun | undefined,
  previous: DispatchHostEvidenceRun | undefined,
): DispatchEvidenceComparison {
  const changes =
    current && previous
      ? compareEvidenceItems(previous.checks, current.checks, describeHostCheck)
      : []
  const baselineId = previous?.id ?? null

  return {
    changed: changes.some((change) => change.kind !== 'unchanged'),
    summary: comparisonSummary(changes, baselineId),
    baselineId,
    currentId: current?.id ?? null,
    changes,
  }
}

export function compareVerificationEvidenceRuns(
  current: DispatchVerificationEvidenceRun | undefined,
  previous: DispatchVerificationEvidenceRun | undefined,
): DispatchEvidenceComparison {
  const changes =
    current && previous
      ? compareEvidenceItems(previous.checks, current.checks, describeVerificationCheck)
      : []
  const baselineId = previous?.id ?? null

  return {
    changed: changes.some((change) => change.kind !== 'unchanged'),
    summary: comparisonSummary(changes, baselineId),
    baselineId,
    currentId: current?.id ?? null,
    changes,
  }
}

export function addHostEvidenceRun(
  state: DispatchState,
  run: DispatchHostEvidenceRun,
): DispatchState {
  const retentionPolicy = normalizeEvidenceRetentionPolicy(state.evidenceRetentionPolicy)

  return {
    ...state,
    evidenceRetentionPolicy: retentionPolicy,
    hostEvidenceRuns: retainEvidenceRuns(
      [run, ...state.hostEvidenceRuns.filter((existingRun) => existingRun.id !== run.id)],
      retentionPolicy.hostRunLimit,
      retentionPolicy.preserveFailedRuns,
    ),
  }
}

export function applyEvidenceRetentionPolicy(state: DispatchState): DispatchState {
  const retentionPolicy = normalizeEvidenceRetentionPolicy(state.evidenceRetentionPolicy)

  return {
    ...state,
    evidenceRetentionPolicy: retentionPolicy,
    hostEvidenceRuns: retainEvidenceRuns(
      state.hostEvidenceRuns,
      retentionPolicy.hostRunLimit,
      retentionPolicy.preserveFailedRuns,
    ),
    verificationEvidenceRuns: retainEvidenceRuns(
      state.verificationEvidenceRuns,
      retentionPolicy.verificationRunLimit,
      retentionPolicy.preserveFailedRuns,
    ),
  }
}

export function addVerificationEvidenceRun(
  state: DispatchState,
  run: DispatchVerificationEvidenceRun,
): DispatchState {
  const retentionPolicy = normalizeEvidenceRetentionPolicy(state.evidenceRetentionPolicy)

  return {
    ...state,
    evidenceRetentionPolicy: retentionPolicy,
    verificationEvidenceRuns: retainEvidenceRuns(
      [
        run,
        ...state.verificationEvidenceRuns.filter((existingRun) => existingRun.id !== run.id),
      ],
      retentionPolicy.verificationRunLimit,
      retentionPolicy.preserveFailedRuns,
    ),
  }
}
