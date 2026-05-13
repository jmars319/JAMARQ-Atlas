import type {
  DeploymentRecord,
  DeploymentRunbook,
  DeploymentStatus,
  DeploymentTarget,
  DispatchDeploySession,
  DispatchDeploySessionEvent,
  DispatchDeploySessionEventType,
  DispatchDeploySessionStatus,
  DispatchDeploySessionStep,
  DispatchDeploySessionStepKind,
  DispatchDeploySessionStepStatus,
  DispatchState,
} from '../domain/dispatch'

export const MANUAL_DEPLOYMENT_RECORD_CONFIRMATION = 'RECORD MANUAL DEPLOYMENT'

export type DeploySessionChecklistPresetId =
  | 'pre-upload-evidence-reviewed'
  | 'post-upload-closeout-reviewed'

export interface DeploySessionChecklistPreset {
  id: DeploySessionChecklistPresetId
  label: string
  detail: string
  stepKinds: DispatchDeploySessionStepKind[]
  note: string
}

export const DEPLOY_SESSION_CHECKLIST_PRESETS: DeploySessionChecklistPreset[] = [
  {
    id: 'pre-upload-evidence-reviewed',
    label: 'Confirm pre-upload review',
    detail:
      'Marks preflight, artifact inspection, preserve paths, and backup readiness as reviewed by a human.',
    stepKinds: ['preflight', 'artifact-inspection', 'preserve-paths', 'backup-readiness'],
    note: 'Checklist preset applied: pre-upload evidence reviewed by human operator.',
  },
  {
    id: 'post-upload-closeout-reviewed',
    label: 'Confirm closeout review',
    detail:
      'Marks outside-Atlas upload, verification checks, operator notes, and wrap-up as reviewed by a human.',
    stepKinds: ['outside-atlas-upload', 'verification-checks', 'notes', 'post-deploy-wrap-up'],
    note: 'Checklist preset applied: post-upload closeout reviewed by human operator.',
  },
]

const CPANEL_QUEUE_RUNBOOK_IDS = [
  'mms-cpanel-runbook',
  'mmh-cpanel-runbook',
  'surplus-cpanel-runbook',
  'trbg-cpanel-runbook',
  'bow-wow-cpanel-runbook',
]

function stamp(now = new Date()) {
  return now.toISOString()
}

function compactId(value: string) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase()
}

function sessionId(runbook: DeploymentRunbook, now: Date) {
  return `deploy-session-${compactId(runbook.id)}-${now.getTime().toString(36)}`
}

function eventId(sessionId: string, type: DispatchDeploySessionEventType, occurredAt: string) {
  return `${sessionId}-${type}-${occurredAt.replace(/[^0-9a-z]/gi, '')}`
}

function step(
  sessionId: string,
  kind: DispatchDeploySessionStepKind,
  label: string,
  detail: string,
  now: Date,
): DispatchDeploySessionStep {
  return {
    id: `${sessionId}-${kind}`,
    kind,
    label,
    status: 'pending',
    detail,
    evidence: '',
    notes: '',
    updatedAt: stamp(now),
  }
}

export function createDeploySessionEvent({
  sessionId,
  type,
  detail,
  now = new Date(),
}: {
  sessionId: string
  type: DispatchDeploySessionEventType
  detail: string
  now?: Date
}): DispatchDeploySessionEvent {
  const occurredAt = stamp(now)

  return {
    id: eventId(sessionId, type, occurredAt),
    sessionId,
    type,
    occurredAt,
    detail,
  }
}

export function cpanelRunbookIds() {
  return [...CPANEL_QUEUE_RUNBOOK_IDS]
}

export function isCpanelQueueRunbook(runbook: DeploymentRunbook) {
  return CPANEL_QUEUE_RUNBOOK_IDS.includes(runbook.id)
}

function createSessionSteps(
  sessionId: string,
  runbook: DeploymentRunbook,
  target: DeploymentTarget,
  now: Date,
) {
  const artifactNames = runbook.artifacts.map((artifact) => artifact.filename).join(', ')
  const preservePaths = runbook.preservePaths.map((preservePath) => preservePath.path).join(', ')
  const verificationPaths = runbook.verificationChecks
    .map((check) => `${check.method} ${check.urlPath}`)
    .join(', ')

  return [
    step(
      sessionId,
      'preflight',
      'Read-only preflight reviewed',
      'Run or review Dispatch preflight evidence before any outside-Atlas upload.',
      now,
    ),
    step(
      sessionId,
      'artifact-inspection',
      'Artifact inspection reviewed',
      artifactNames
        ? `Expected artifact files: ${artifactNames}.`
        : 'No expected artifact files are recorded.',
      now,
    ),
    step(
      sessionId,
      'preserve-paths',
      'Preserve/create paths reviewed',
      preservePaths
        ? `Preserve or create these paths before upload: ${preservePaths}.`
        : 'No special preserve/create paths are recorded.',
      now,
    ),
    step(
      sessionId,
      'backup-readiness',
      'Backup readiness confirmed',
      target.backupRequired
        ? 'Backup is required by this target and must be confirmed by a human.'
        : 'Backup is not required by the current target settings; confirm that remains correct.',
      now,
    ),
    step(
      sessionId,
      'outside-atlas-upload',
      'Outside-Atlas upload completed',
      'Human confirms upload happened outside Atlas. Atlas did not upload, extract, delete, overwrite, SSH/SFTP write, cPanel write, or touch databases.',
      now,
    ),
    step(
      sessionId,
      'verification-checks',
      'Post-upload verification reviewed',
      verificationPaths
        ? `Run or review these checks: ${verificationPaths}.`
        : 'No post-upload verification checks are recorded.',
      now,
    ),
    step(
      sessionId,
      'notes',
      'Operator notes captured',
      'Capture anything the next operator needs to know about this manual session.',
      now,
    ),
    step(
      sessionId,
      'post-deploy-wrap-up',
      'Post-deploy wrap-up reviewed',
      'Confirm report/update needs, manual verification needs, and whether a manual deployment record should be created.',
      now,
    ),
  ]
}

export function createDispatchDeploySession({
  runbook,
  target,
  orderGroupId = 'current-cpanel-sites',
  now = new Date(),
}: {
  runbook: DeploymentRunbook
  target: DeploymentTarget
  orderGroupId?: string
  now?: Date
}): DispatchDeploySession {
  const id = sessionId(runbook, now)

  return {
    id,
    projectId: runbook.projectId,
    targetId: runbook.targetId,
    runbookId: runbook.id,
    orderGroupId,
    siteName: runbook.siteName,
    status: 'active',
    startedAt: stamp(now),
    updatedAt: stamp(now),
    completedAt: null,
    recordedDeploymentRecordId: null,
    versionLabel: `${runbook.siteName} manual deployment ${stamp(now).slice(0, 10)}`,
    sourceRef: 'manual-outside-atlas',
    commitSha: '',
    artifactName:
      runbook.artifacts.map((artifact) => artifact.filename).join(', ') || 'manual artifact',
    deployedBy: 'manual operator',
    summary:
      'Manual deploy session tracked in Atlas. Uploads and production changes happen outside Atlas.',
    recordStatus: 'verification',
    rollbackRef: '',
    databaseBackupRef: '',
    steps: createSessionSteps(id, runbook, target, now),
    events: [
      createDeploySessionEvent({
        sessionId: id,
        type: 'created',
        detail: `Started manual deploy session for ${runbook.siteName}.`,
        now,
      }),
    ],
  }
}

function normalizeStepStatus(value: unknown): DispatchDeploySessionStepStatus {
  return ['pending', 'in-progress', 'confirmed', 'skipped', 'blocked'].includes(String(value))
    ? (value as DispatchDeploySessionStepStatus)
    : 'pending'
}

function normalizeSessionStatus(value: unknown) {
  return ['active', 'blocked', 'completed', 'recorded', 'archived'].includes(String(value))
    ? (value as DispatchDeploySession['status'])
    : 'active'
}

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

  return stamp(fallback)
}

function normalizeStep(value: unknown, now: Date): DispatchDeploySessionStep | null {
  if (!isRecord(value)) {
    return null
  }

  const id = readString(value.id)
  const kind = readString(value.kind) as DispatchDeploySessionStepKind

  if (!id || !kind) {
    return null
  }

  return {
    id,
    kind,
    label: readString(value.label) || kind,
    status: normalizeStepStatus(value.status),
    detail: readString(value.detail),
    evidence: readString(value.evidence),
    notes: readString(value.notes),
    updatedAt: safeDate(value.updatedAt, now),
  }
}

function normalizeEvent(value: unknown): DispatchDeploySessionEvent | null {
  if (!isRecord(value)) {
    return null
  }

  const id = readString(value.id)
  const sessionId = readString(value.sessionId)
  const type = readString(value.type) as DispatchDeploySessionEventType
  const occurredAt = readString(value.occurredAt)

  if (!id || !sessionId || !type || !occurredAt) {
    return null
  }

  return {
    id,
    sessionId,
    type,
    occurredAt,
    detail: readString(value.detail),
  }
}

export function normalizeDeploySessions(value: unknown, now = new Date()) {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item): DispatchDeploySession[] => {
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
        projectId,
        targetId,
        runbookId,
        orderGroupId: readString(item.orderGroupId),
        siteName: readString(item.siteName) || targetId,
        status: normalizeSessionStatus(item.status),
        startedAt: safeDate(item.startedAt, now),
        updatedAt: safeDate(item.updatedAt, now),
        completedAt: readString(item.completedAt) || null,
        recordedDeploymentRecordId: readString(item.recordedDeploymentRecordId) || null,
        versionLabel: readString(item.versionLabel) || 'Manual deployment',
        sourceRef: readString(item.sourceRef) || 'manual-outside-atlas',
        commitSha: readString(item.commitSha),
        artifactName: readString(item.artifactName),
        deployedBy: readString(item.deployedBy) || 'manual operator',
        summary: readString(item.summary),
        recordStatus: (readString(item.recordStatus) as DeploymentStatus) || 'verification',
        rollbackRef: readString(item.rollbackRef),
        databaseBackupRef: readString(item.databaseBackupRef),
        steps: Array.isArray(item.steps)
          ? item.steps
              .map((candidate) => normalizeStep(candidate, now))
              .filter((candidate): candidate is DispatchDeploySessionStep => candidate !== null)
          : [],
        events: Array.isArray(item.events)
          ? item.events
              .map((candidate) => normalizeEvent(candidate))
              .filter((candidate): candidate is DispatchDeploySessionEvent => candidate !== null)
          : [],
      },
    ]
  })
}

function nextSessionStatus(
  steps: DispatchDeploySessionStep[],
  currentStatus: DispatchDeploySessionStatus,
) {
  if (currentStatus === 'recorded' || currentStatus === 'archived') {
    return currentStatus
  }

  if (steps.some((candidate) => candidate.status === 'blocked')) {
    return 'blocked'
  }

  if (
    steps.length > 0 &&
    steps.every((candidate) => candidate.status === 'confirmed' || candidate.status === 'skipped')
  ) {
    return 'completed'
  }

  return 'active'
}

export function startDeploySession(
  state: DispatchState,
  runbookId: string,
  now = new Date(),
): DispatchState {
  const runbook = state.runbooks.find((candidate) => candidate.id === runbookId)
  const target = runbook
    ? state.targets.find((candidate) => candidate.id === runbook.targetId)
    : undefined

  if (!runbook || !target || !isCpanelQueueRunbook(runbook)) {
    return state
  }

  const session = createDispatchDeploySession({ runbook, target, now })

  return {
    ...state,
    deploySessions: [
      session,
      ...state.deploySessions.filter(
        (candidate) =>
          !(
            candidate.runbookId === runbook.id &&
            ['active', 'blocked'].includes(candidate.status)
          ),
      ),
    ],
  }
}

export function updateDeploySessionStep(
  state: DispatchState,
  sessionId: string,
  stepId: string,
  update: Partial<Pick<DispatchDeploySessionStep, 'status' | 'notes' | 'evidence'>>,
  now = new Date(),
): DispatchState {
  const updatedAt = stamp(now)

  return {
    ...state,
    deploySessions: state.deploySessions.map((session) => {
      if (session.id !== sessionId) {
        return session
      }

      const previousStep = session.steps.find((candidate) => candidate.id === stepId)
      const steps = session.steps.map((candidate) =>
        candidate.id === stepId
          ? {
              ...candidate,
              ...update,
              updatedAt,
            }
          : candidate,
      )
      const status = nextSessionStatus(steps, session.status)
      const completedAt =
        status === 'completed' && !session.completedAt ? updatedAt : session.completedAt
      const statusChanged =
        update.status !== undefined && previousStep !== undefined && update.status !== previousStep.status
      const eventType =
        status === 'completed' && session.status !== 'completed' ? 'completed' : 'step-updated'

      return {
        ...session,
        steps,
        status,
        completedAt,
        updatedAt,
        events: statusChanged
          ? [
              ...session.events,
              createDeploySessionEvent({
                sessionId: session.id,
                type: eventType,
                detail: `Updated deploy session step ${stepId}.`,
                now,
              }),
            ]
          : session.events,
      }
    }),
  }
}

export function updateDeploySession(
  state: DispatchState,
  sessionId: string,
  update: Partial<
    Pick<
      DispatchDeploySession,
      | 'versionLabel'
      | 'sourceRef'
      | 'commitSha'
      | 'artifactName'
      | 'deployedBy'
      | 'summary'
      | 'recordStatus'
      | 'rollbackRef'
      | 'databaseBackupRef'
    >
  >,
  now = new Date(),
): DispatchState {
  return {
    ...state,
    deploySessions: state.deploySessions.map((session) => {
      if (session.id !== sessionId) {
        return session
      }

      const recordStatusChanged =
        update.recordStatus !== undefined && update.recordStatus !== session.recordStatus

      return {
        ...session,
        ...update,
        updatedAt: stamp(now),
        events: recordStatusChanged
          ? [
              ...session.events,
              createDeploySessionEvent({
                sessionId,
                type: 'session-updated',
                detail: 'Updated manual deployment record status.',
                now,
              }),
            ]
          : session.events,
      }
    }),
  }
}

export function canRecordManualDeployment(confirmation: string) {
  return confirmation === MANUAL_DEPLOYMENT_RECORD_CONFIRMATION
}

function appendEvidenceLine(value: string, line: string) {
  return value.trim() ? `${value.trim()}\n${line}` : line
}

export function applyDeploySessionChecklistPreset(
  state: DispatchState,
  sessionId: string,
  presetId: DeploySessionChecklistPresetId,
  now = new Date(),
): DispatchState {
  const preset = DEPLOY_SESSION_CHECKLIST_PRESETS.find((candidate) => candidate.id === presetId)

  if (!preset) {
    return state
  }

  const updatedAt = stamp(now)

  return {
    ...state,
    deploySessions: state.deploySessions.map((session) => {
      if (session.id !== sessionId || session.status === 'recorded' || session.status === 'archived') {
        return session
      }

      const steps = session.steps.map((step) =>
        preset.stepKinds.includes(step.kind)
          ? {
              ...step,
              status: 'confirmed' as const,
              notes: appendEvidenceLine(step.notes, preset.note),
              updatedAt,
            }
          : step,
      )
      const status = nextSessionStatus(steps, session.status)

      return {
        ...session,
        steps,
        status,
        completedAt: status === 'completed' && !session.completedAt ? updatedAt : session.completedAt,
        updatedAt,
        events: [
          ...session.events,
          createDeploySessionEvent({
            sessionId,
            type: status === 'completed' && session.status !== 'completed' ? 'completed' : 'session-updated',
            detail: `Applied deploy session checklist preset: ${preset.label}.`,
            now,
          }),
        ],
      }
    }),
  }
}

export function attachEvidenceToDeploySession(
  state: DispatchState,
  sessionId: string,
  evidence: {
    stepKind: DispatchDeploySessionStepKind
    label: string
    detail: string
  },
  now = new Date(),
): DispatchState {
  const updatedAt = stamp(now)

  return {
    ...state,
    deploySessions: state.deploySessions.map((session) => {
      if (session.id !== sessionId || session.status === 'recorded' || session.status === 'archived') {
        return session
      }

      const steps = session.steps.map((step) =>
        step.kind === evidence.stepKind
          ? {
              ...step,
              notes: appendEvidenceLine(step.notes, evidence.label),
              evidence: appendEvidenceLine(step.evidence, evidence.detail),
              updatedAt,
            }
          : step,
      )

      return {
        ...session,
        steps,
        updatedAt,
        events: [
          ...session.events,
          createDeploySessionEvent({
            sessionId,
            type: 'session-updated',
            detail: `Attached ${evidence.label} to deploy session evidence.`,
            now,
          }),
        ],
      }
    }),
  }
}

export function createDeploymentRecordFromSession(
  session: DispatchDeploySession,
  target: DeploymentTarget,
  now = new Date(),
): DeploymentRecord {
  const confirmedSteps = session.steps
    .filter((step) => step.status === 'confirmed')
    .map((step) => step.label)
  const noteLines = [
    'Manual deployment record created from Atlas Deploy Session.',
    'Atlas did not upload, extract, delete, overwrite, back up, restore, roll back, SSH/SFTP write, cPanel write, or touch production databases.',
    ...session.steps
      .filter((step) => step.notes || step.evidence)
      .map(
        (step) =>
          `${step.label}: ${step.notes || 'No note'} ${
            step.evidence ? `Evidence: ${step.evidence}` : ''
          }`,
      ),
  ]

  return {
    id: `manual-deployment-${session.id}-${now.getTime().toString(36)}`,
    projectId: session.projectId,
    targetId: session.targetId,
    environment: target.environment,
    versionLabel: session.versionLabel || `${session.siteName} manual deployment`,
    sourceRef: session.sourceRef || 'manual-outside-atlas',
    commitSha: session.commitSha,
    artifactName: session.artifactName || 'manual artifact',
    startedAt: session.startedAt,
    completedAt: stamp(now),
    status: session.recordStatus || 'verification',
    deployedBy: session.deployedBy || 'manual operator',
    summary: [
      session.summary || 'Manual deployment recorded for review.',
      `Confirmed session steps: ${confirmedSteps.length > 0 ? confirmedSteps.join(', ') : 'none'}.`,
      'This record is human-confirmed; Atlas did not perform the deployment.',
    ].join(' '),
    healthCheckResults: [],
    rollbackRef: session.rollbackRef,
    databaseBackupRef: session.databaseBackupRef,
    notes: noteLines,
  }
}

export function recordManualDeploymentFromSession(
  state: DispatchState,
  sessionId: string,
  confirmation: string,
  now = new Date(),
): {
  state: DispatchState
  ok: boolean
  message: string
  recordId: string | null
} {
  if (!canRecordManualDeployment(confirmation)) {
    return {
      state,
      ok: false,
      message: `Type ${MANUAL_DEPLOYMENT_RECORD_CONFIRMATION} to record a manual deployment.`,
      recordId: null,
    }
  }

  const session = state.deploySessions.find((candidate) => candidate.id === sessionId)
  const target = session
    ? state.targets.find((candidate) => candidate.id === session.targetId)
    : undefined

  if (!session || !target) {
    return {
      state,
      ok: false,
      message: 'Deploy session or target was not found.',
      recordId: null,
    }
  }

  if (session.recordedDeploymentRecordId) {
    return {
      state,
      ok: false,
      message: 'This deploy session already has a manual deployment record.',
      recordId: session.recordedDeploymentRecordId,
    }
  }

  const record = createDeploymentRecordFromSession(session, target, now)
  const updatedAt = stamp(now)

  return {
    state: {
      ...state,
      records: [record, ...state.records],
      deploySessions: state.deploySessions.map((candidate) =>
        candidate.id === session.id
          ? {
              ...candidate,
              status: 'recorded',
              completedAt: candidate.completedAt ?? updatedAt,
              updatedAt,
              recordedDeploymentRecordId: record.id,
              events: [
                ...candidate.events,
                createDeploySessionEvent({
                  sessionId: candidate.id,
                  type: 'manual-deployment-recorded',
                  detail: `Manual deployment record ${record.id} created by human confirmation.`,
                  now,
                }),
              ],
            }
          : candidate,
      ),
    },
    ok: true,
    message: 'Manual deployment record created. Atlas did not perform the deployment.',
    recordId: record.id,
  }
}
