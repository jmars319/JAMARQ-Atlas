import { formatDateLabel, type ProjectRecord, type Workspace } from '../domain/atlas'
import type { AtlasCalibrationState } from '../domain/calibration'
import type { DataIntegrityDiagnostic } from '../domain/dataIntegrity'
import { findReadiness, type DispatchState } from '../domain/dispatch'
import type { PlanningState } from '../domain/planning'
import {
  ATLAS_REPORTS_SCHEMA_VERSION,
  REPORT_PACKET_TYPES,
  getReportPacketType,
  emptyReportsState,
  type ReportAuditEvent,
  type ReportAuditEventType,
  type ReportPacket,
  type ReportPacketStatus,
  type ReportPacketType,
  type ReportProjectSummary,
  type ReportsState,
} from '../domain/reports'
import type { ReviewNote, ReviewSession, ReviewState } from '../domain/review'
import type { AtlasSyncState } from '../domain/sync'
import type { WritingDraft } from '../domain/writing'
import {
  closeoutStateLabels,
  deriveDispatchCloseoutForTarget,
  isDeploymentReportType,
} from './dispatchCloseout'
import {
  createCalibrationReadinessReport,
  summarizeCalibrationState,
  type CalibrationIssue,
} from './calibration'
import { getPlanningForProject } from './planning'
import { getReviewForProject } from './review'
import { evaluateVerification } from './verification'
import { markdownList, slugifyFilename } from './markdownTemplates'
import {
  assembleReportMarkdown,
  buildReportTemplateFocus,
} from './reportTemplates'
import { createOperationsCockpitSummary } from './operations'

export { reportGuardrails } from './reportTemplates'

interface ReportContextInput {
  type: ReportPacketType
  projectRecords: ProjectRecord[]
  dispatch: DispatchState
  reports?: ReportsState
  review?: ReviewState
  planning: PlanningState
  writingDrafts: WritingDraft[]
  projectIds: string[]
  writingDraftIds: string[]
  reviewNoteIds?: string[]
  reviewSessionIds?: string[]
  calibration?: AtlasCalibrationState
  calibrationIssues?: CalibrationIssue[]
  workspace?: Workspace
  sync?: AtlasSyncState
  dataIntegrityDiagnostics?: DataIntegrityDiagnostic[]
  now?: Date
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

function safeDate(value: unknown, fallback: Date) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value
  }

  return fallback.toISOString()
}

function nowStamp(now = new Date()) {
  return now.toISOString()
}

function eventId(packetId: string, type: ReportAuditEventType, occurredAt: string) {
  return `${packetId}-${type}-${occurredAt.replace(/[^0-9a-z]/gi, '')}`
}

export function createReportAuditEvent({
  packetId,
  type,
  detail,
  now = new Date(),
}: {
  packetId: string
  type: ReportAuditEventType
  detail: string
  now?: Date
}): ReportAuditEvent {
  const occurredAt = nowStamp(now)

  return {
    id: eventId(packetId, type, occurredAt),
    type,
    occurredAt,
    detail,
  }
}

export function emptyReportsStore(now = new Date()): ReportsState {
  return {
    ...emptyReportsState,
    updatedAt: now.toISOString(),
  }
}

function readStatus(value: unknown): ReportPacketStatus {
  return value === 'exported' || value === 'archived' ? value : 'draft'
}

function readPacketType(value: unknown): ReportPacketType {
  return REPORT_PACKET_TYPES.some((packetType) => packetType.id === readString(value))
    ? (value as ReportPacketType)
    : 'internal-weekly-packet'
}

function normalizeAuditEvents(value: unknown, packetId: string, now = new Date()) {
  const events = Array.isArray(value)
    ? value.filter(
        (event): event is ReportAuditEvent =>
          isRecord(event) &&
          typeof event.id === 'string' &&
          typeof event.type === 'string' &&
          typeof event.occurredAt === 'string' &&
          typeof event.detail === 'string',
      )
    : []

  if (events.length > 0) {
    return events
  }

  return [
    createReportAuditEvent({
      packetId,
      type: 'created',
      detail: 'Report packet normalized into Reports storage.',
      now,
    }),
  ]
}

function normalizeSourceSummary(value: unknown): ReportProjectSummary[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return []
    }

    return [
      {
        projectId: readString(item.projectId),
        projectName: readString(item.projectName),
        sectionName: readString(item.sectionName),
        groupName: readString(item.groupName),
        status: readString(item.status),
        nextAction: readString(item.nextAction),
        currentRisk: readString(item.currentRisk),
        lastVerified: readString(item.lastVerified),
        verificationState: readString(item.verificationState),
        dispatchTargets: Number(item.dispatchTargets) || 0,
        dispatchWarnings: Number(item.dispatchWarnings) || 0,
        planningItems: Number(item.planningItems) || 0,
        repositoryCount: Number(item.repositoryCount) || 0,
      },
    ]
  })
}

export function normalizeReportPacket(value: unknown, now = new Date()): ReportPacket | null {
  if (!isRecord(value)) {
    return null
  }

  const id = readString(value.id)

  if (!id) {
    return null
  }

  const createdAt = safeDate(value.createdAt, now)
  const updatedAt = safeDate(value.updatedAt, new Date(createdAt))

  return {
    id,
    type: readPacketType(value.type),
    title: readString(value.title) || 'Untitled report packet',
    status: readStatus(value.status),
    projectIds: readStringArray(value.projectIds),
    writingDraftIds: readStringArray(value.writingDraftIds),
    reviewNoteIds: readStringArray(value.reviewNoteIds),
    reviewSessionIds: readStringArray(value.reviewSessionIds),
    markdown: readString(value.markdown),
    sourceSummary: normalizeSourceSummary(value.sourceSummary),
    contextWarnings: readStringArray(value.contextWarnings),
    auditEvents: normalizeAuditEvents(value.auditEvents, id, now),
    createdAt,
    updatedAt,
    exportedAt: readString(value.exportedAt) || null,
  }
}

export function normalizeReportsState(value: unknown, now = new Date()): ReportsState {
  const defaults = emptyReportsStore(now)

  if (!isRecord(value)) {
    return defaults
  }

  return {
    schemaVersion: ATLAS_REPORTS_SCHEMA_VERSION,
    packets: Array.isArray(value.packets)
      ? value.packets
          .map((packet) => normalizeReportPacket(packet, now))
          .filter((packet): packet is ReportPacket => packet !== null)
      : [],
    updatedAt: safeDate(value.updatedAt, now),
  }
}

function selectedRecords(projectRecords: ProjectRecord[], projectIds: string[]) {
  if (projectIds.length === 0) {
    return projectRecords
  }

  const selected = new Set(projectIds)
  return projectRecords.filter((record) => selected.has(record.project.id))
}

function summarizeProject(
  record: ProjectRecord,
  dispatch: DispatchState,
  planning: PlanningState,
  now: Date,
): ReportProjectSummary {
  const targetSummaries = dispatch.targets.filter((target) => target.projectId === record.project.id)
  const dispatchWarnings = targetSummaries.reduce((total, target) => {
    const readiness = findReadiness(dispatch, target.projectId, target.id)
    return total + (readiness?.warnings.length ?? 0) + (readiness?.blockers.length ?? 0)
  }, 0)
  const projectPlanning = getPlanningForProject(planning, record.project.id)
  const verification = evaluateVerification(record.project, now)

  return {
    projectId: record.project.id,
    projectName: record.project.name,
    sectionName: record.section.name,
    groupName: record.group.name,
    status: record.project.manual.status,
    nextAction: record.project.manual.nextAction,
    currentRisk: record.project.manual.currentRisk,
    lastVerified: record.project.manual.lastVerified,
    verificationState: verification.dueState,
    dispatchTargets: targetSummaries.length,
    dispatchWarnings,
    planningItems: projectPlanning.all.length,
    repositoryCount: record.project.repositories.length,
  }
}

function list(items: string[], fallback: string) {
  return markdownList(items, fallback)
}

function reportTitle(type: ReportPacketType, records: ProjectRecord[], now: Date) {
  const packetType = getReportPacketType(type)
  const scope =
    records.length === 1
      ? records[0].project.name
      : records.length > 1
        ? `${records.length} projects`
        : 'No project scope'

  return `${packetType.label} - ${scope} - ${now.toISOString().slice(0, 10)}`
}

function buildProjectSection(record: ProjectRecord, planning: PlanningState) {
  const manual = record.project.manual
  const projectPlanning = getPlanningForProject(planning, record.project.id)

  return [
    `### ${record.project.name}`,
    '',
    `- Section: ${record.section.name}`,
    `- Group: ${record.group.name}`,
    `- Atlas status: ${manual.status}`,
    `- Last verified: ${formatDateLabel(manual.lastVerified)}`,
    `- Next action: ${manual.nextAction || 'Not recorded.'}`,
    `- Current risk: ${manual.currentRisk || 'No current risk recorded.'}`,
    `- Repositories: ${record.project.repositories.length}`,
    '',
    'Planning:',
    list(
      projectPlanning.all.slice(0, 6).map((item) => `${item.kind}: ${item.title} (${item.status})`),
      'No planning records selected for this project.',
    ),
    '',
    'Recent activity:',
    list(
      record.project.activity
        .slice()
        .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
        .slice(0, 5)
        .map((event) => `${event.occurredAt}: ${event.title} - ${event.detail}`),
      'No activity recorded.',
    ),
  ].join('\n')
}

function buildWritingSection(drafts: WritingDraft[]) {
  if (drafts.length === 0) {
    return '_No approved or exported Writing drafts selected._'
  }

  return drafts
    .map((draft) =>
      [
        `### ${draft.title}`,
        '',
        `- Template: ${draft.templateId}`,
        `- Status: ${draft.status}`,
        `- Updated: ${draft.updatedAt}`,
        '',
        draft.draftText || '_No draft text recorded._',
      ].join('\n'),
    )
    .join('\n\n')
}

function buildDispatchSection(records: ProjectRecord[], dispatch: DispatchState) {
  const lines = records.flatMap((record) => {
    const targets = dispatch.targets.filter((target) => target.projectId === record.project.id)

    if (targets.length === 0) {
      return [`- ${record.project.name}: no Dispatch target configured.`]
    }

    return targets.map((target) => {
      const readiness = findReadiness(dispatch, target.projectId, target.id)
      return `- ${record.project.name} / ${target.name}: ${target.status}; blockers ${readiness?.blockers.length ?? 0}; warnings ${readiness?.warnings.length ?? 0}.`
    })
  })

  return list(lines, 'No Dispatch context available.')
}

function buildDeploymentRunbookSection(records: ProjectRecord[], dispatch: DispatchState) {
  const projectIds = new Set(records.map((record) => record.project.id))
  const runbooks = dispatch.runbooks
    .filter((runbook) => projectIds.has(runbook.projectId))
    .sort((left, right) => left.deployOrder - right.deployOrder)

  if (runbooks.length === 0) {
    return '_No deployment runbooks are included in this report scope._'
  }

  return runbooks
    .map((runbook) =>
      [
        `### ${runbook.siteName} / order ${runbook.deployOrder}`,
        '',
        runbook.summary,
        '',
        'Artifacts:',
        list(
          runbook.artifacts.map(
            (artifact) =>
              `${artifact.filename} -> ${artifact.targetPath} (${artifact.role}); checksum ${
                artifact.checksum || 'not inspected'
              }`,
          ),
          'No artifacts recorded.',
        ),
        '',
        'Preserve/create paths:',
        list(
          runbook.preservePaths.map(
            (path) => `${path.path}${path.temporary ? ' (temporary)' : ''}: ${path.reason}`,
          ),
          'No special preserve paths recorded.',
        ),
        '',
        'Verification checks:',
        list(
          runbook.verificationChecks.map(
            (check) =>
              `${check.method} ${check.urlPath}: expect ${check.expectedStatuses.join('/')} ${
                check.protectedResource ? '(protected path)' : ''
              }`,
          ),
          'No verification checks recorded.',
        ),
        '',
        'Deploy notes:',
        list([...runbook.notes, ...runbook.manualDeployNotes], 'No deploy notes recorded.'),
      ].join('\n'),
    )
    .join('\n\n')
}

function buildDeploySessionSection(records: ProjectRecord[], dispatch: DispatchState) {
  const projectIds = new Set(records.map((record) => record.project.id))
  const sessions = dispatch.deploySessions
    .filter((session) => projectIds.has(session.projectId))
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

  if (sessions.length === 0) {
    return '_No deploy sessions are included in this report scope._'
  }

  return sessions
    .map((session) => {
      const confirmedSteps = session.steps.filter((step) => step.status === 'confirmed')
      const evidenceSteps = session.steps.filter((step) => step.notes || step.evidence)
      const linkedEvidenceCount = evidenceSteps.reduce(
        (total, step) =>
          total +
          (step.evidence.match(/host-evidence-|verification-evidence-/g)?.length ?? 0),
        0,
      )

      return [
        `### ${session.siteName} / ${session.status}`,
        '',
        `- Started: ${session.startedAt}`,
        `- Updated: ${session.updatedAt}`,
        `- Manual deployment record: ${session.recordedDeploymentRecordId ?? 'not recorded'}`,
        `- Record status target: ${session.recordStatus}`,
        `- Linked evidence references: ${linkedEvidenceCount}`,
        '',
        session.summary || 'No session summary recorded.',
        '',
        'Confirmed steps:',
        list(
          confirmedSteps.map((step) => `${step.label}: ${step.evidence || 'confirmed'}`),
          'No steps confirmed.',
        ),
        '',
        'Session notes and evidence:',
        list(
          evidenceSteps.map(
            (step) =>
              `${step.label}: ${step.notes || 'No notes'}${
                step.evidence ? ` Evidence: ${step.evidence}` : ''
              }`,
          ),
          'No session notes or evidence recorded.',
        ),
        '',
        'Session events:',
        list(
          session.events
            .slice()
            .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
            .map((event) => `${event.occurredAt}: ${event.type} - ${event.detail}`),
          'No session events recorded.',
        ),
      ].join('\n')
    })
    .join('\n\n')
}

function buildStoredDispatchEvidenceSection(records: ProjectRecord[], dispatch: DispatchState) {
  const projectIds = new Set(records.map((record) => record.project.id))
  const hostRuns = dispatch.hostEvidenceRuns
    .filter((run) => projectIds.has(run.projectId))
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
  const verificationRuns = dispatch.verificationEvidenceRuns
    .filter((run) => projectIds.has(run.projectId))
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))

  return [
    'Host evidence:',
    list(
      hostRuns
        .slice(0, 8)
        .map(
          (run) =>
            `${run.id}: ${run.status} / ${run.probeMode} / ${run.authMethod} at ${run.completedAt}; ${run.checks.length} checks; ${run.summary}`,
        ),
      'No stored host evidence in report scope.',
    ),
    '',
    'Runbook verification evidence:',
    list(
      verificationRuns
        .slice(0, 8)
        .map(
          (run) =>
            `${run.id}: ${run.status} at ${run.completedAt}; ${run.checks.length} checks; ${run.summary}`,
        ),
      'No stored runbook verification evidence in report scope.',
    ),
  ].join('\n')
}

function buildDispatchCloseoutSection(
  records: ProjectRecord[],
  dispatch: DispatchState,
  reports: ReportsState,
) {
  const projectIds = new Set(records.map((record) => record.project.id))
  const targets = dispatch.targets.filter((target) => projectIds.has(target.projectId))

  if (targets.length === 0) {
    return '_No Dispatch targets are included in this report scope._'
  }

  return targets
    .map((target) => {
      const summary = deriveDispatchCloseoutForTarget({ dispatch, reports, target })

      return [
        `### ${target.name}`,
        '',
        `- Closeout state: ${closeoutStateLabels[summary.state]}`,
        `- Detail: ${summary.detail}`,
        `- Manual deployment record: ${summary.latestManualDeploymentRecordId ?? 'not recorded'}`,
        `- Host evidence: ${summary.latestHostEvidenceId ?? 'not captured'}`,
        `- Verification evidence: ${summary.latestVerificationEvidenceId ?? 'not captured'}`,
        `- Related deployment report packet: ${summary.latestReportPacketId ?? 'not assembled'}`,
        '',
        'Closeout requirements:',
        list(
          summary.requirements.map(
            (requirement) =>
              `${requirement.status}: ${requirement.label} - ${requirement.detail}`,
          ),
          'No closeout requirements derived.',
        ),
        '',
        'Closeout warnings:',
        list(summary.warnings, 'No closeout warnings derived.'),
      ].join('\n')
    })
    .join('\n\n')
}

function buildGithubSection(records: ProjectRecord[], drafts: WritingDraft[]) {
  const repositoryLines = records.flatMap((record) =>
    record.project.repositories.map((repo) => `- ${record.project.name}: ${repo.owner}/${repo.name}`),
  )
  const draftGithubWarnings = drafts.flatMap((draft) => draft.contextSnapshot.github.warnings)

  return [
    repositoryLines.length > 0
      ? repositoryLines.join('\n')
      : '- No repository bindings in report scope.',
    '',
    'GitHub context warnings:',
    list([...new Set(draftGithubWarnings)], 'No draft GitHub warnings recorded.'),
    '',
    'GitHub health/deploy-delta summaries:',
    '- Live repo health summaries are available in GitHub and project detail views.',
    '- Deployment report packets should treat commit deltas as review context, not readiness decisions.',
    '- Report packets store selected repository bindings and captured draft snippets only, not full live GitHub history.',
  ].join('\n')
}

function buildReviewSection({
  records,
  review,
  selectedNotes = [],
  selectedSessions = [],
}: {
  records: ProjectRecord[]
  review?: ReviewState
  selectedNotes?: ReviewNote[]
  selectedSessions?: ReviewSession[]
}) {
  if (!review) {
    return '_No Review Center context was supplied._'
  }

  if (selectedNotes.length > 0 || selectedSessions.length > 0) {
    return [
      'Selected Review sessions:',
      list(
        selectedSessions.map(
          (session) =>
            `${session.title} (${session.outcome}, ${session.itemIds.length} item(s), ${session.updatedAt})`,
        ),
        'No selected Review sessions.',
      ),
      '',
      'Selected Review notes:',
      list(
        selectedNotes.map((note) => `${note.outcome}: ${note.body} (${note.createdAt})`),
        'No selected Review notes.',
      ),
    ].join('\n')
  }

  const sections = records.flatMap((record) => {
    const projectReview = getReviewForProject(review, record.project.id)
    const notes = projectReview.notes.slice(0, 5)
    const sessions = projectReview.sessions.slice(0, 3)

    if (notes.length === 0 && sessions.length === 0) {
      return []
    }

    return [
      [
        `### ${record.project.name}`,
        '',
        'Review sessions:',
        list(
          sessions.map(
            (session) =>
              `${session.title} (${session.outcome}, ${session.itemIds.length} item(s), ${session.updatedAt})`,
          ),
          'No Review sessions recorded for this project.',
        ),
        '',
        'Review notes:',
        list(
          notes.map((note) => `${note.outcome}: ${note.body} (${note.createdAt})`),
          'No Review notes recorded for this project.',
        ),
      ].join('\n'),
    ]
  })

  return sections.length > 0
    ? sections.join('\n\n')
    : '_No Review Center notes or sessions are recorded for this report scope._'
}

function shouldIncludeCalibrationSection(type: ReportPacketType) {
  return (
    type === 'internal-weekly-packet' ||
    type === 'project-handoff-packet' ||
    isDeploymentReportType(type)
  )
}

function buildCalibrationSection(
  calibration: AtlasCalibrationState | undefined,
  calibrationIssues: CalibrationIssue[] = [],
) {
  if (!calibration) {
    return '_No Calibration Operations context was supplied._'
  }

  const summary = summarizeCalibrationState(calibration)
  const readiness = createCalibrationReadinessReport({
    issues: calibrationIssues,
    calibration,
  })
  const unresolvedCategories = readiness.categoryCounts
    .filter((category) => category.count > 0)
    .map((category) => `${category.category}: ${category.count}`)

  return [
    `- Progress records: ${summary.progressRecords}`,
    `- Entered: ${summary.entered}`,
    `- Verified: ${summary.verified}`,
    `- Deferred: ${summary.deferred}`,
    `- Credential references: ${summary.credentialReferences}`,
    `- Unregistered credential refs: ${readiness.unregisteredCredentialRefs}`,
    '',
    'Unresolved categories:',
    list(unresolvedCategories, 'No unresolved categories were supplied.'),
    '',
    'Top affected targets/projects:',
    list(
      readiness.topAffectedItems.map((item) => `${item.label}: ${item.count} item(s)`),
      'No affected targets or projects were supplied.',
    ),
    '',
    'Latest calibration audit:',
    list(
      readiness.latestAuditEvents.map(
        (event) => `${event.occurredAt}: ${event.type} - ${event.summary}`,
      ),
      'No calibration audit events recorded.',
    ),
    '',
    'Registry status:',
    list(
      calibration.credentialReferences
        .slice(0, 8)
        .map(
          (reference) =>
            `${reference.label}: ${reference.provider || 'provider not set'} / ${reference.targetIds.length} target(s)`,
        ),
      'No credential references registered.',
    ),
  ].join('\n')
}

function buildOperationsReadinessSections({
  workspace,
  dispatch,
  reports,
  sync,
  calibration,
  calibrationIssues,
  dataIntegrityDiagnostics = [],
  now,
}: {
  workspace?: Workspace
  dispatch: DispatchState
  reports: ReportsState
  sync?: AtlasSyncState
  calibration?: AtlasCalibrationState
  calibrationIssues?: CalibrationIssue[]
  dataIntegrityDiagnostics?: DataIntegrityDiagnostic[]
  now: Date
}) {
  if (!workspace || !sync || !calibration) {
    return [
      {
        heading: 'Ops Cockpit Summary',
        body: '_Ops Cockpit context was not supplied for this packet._',
      },
    ]
  }

  const summary = createOperationsCockpitSummary({
    workspace,
    dispatch,
    reports,
    sync,
    calibration,
    calibrationIssues: calibrationIssues ?? [],
    dataIntegrityDiagnostics,
    now,
  })
  const topQueue = summary.queue.slice(0, 10)
  const staleEvidence = summary.queue.filter((item) =>
    item.reasons.some((reason) => reason.id === 'stale-evidence' || reason.id === 'missing-evidence'),
  )
  const recoveryGaps = summary.queue.filter((item) =>
    item.reasons.some((reason) => reason.id === 'recovery'),
  )
  const calibrationRows = summary.queue.filter((item) =>
    item.reasons.some((reason) => reason.id === 'calibration'),
  )
  const integrityRows = summary.queue.filter((item) =>
    item.reasons.some((reason) => reason.id === 'data-integrity'),
  )

  return [
    {
      heading: 'Ops Cockpit Summary',
      body: [
        `- Readiness grade: ${summary.grade}`,
        `- Queue items: ${summary.queue.length}`,
        `- Dispatch targets: ${summary.counts.dispatchTargets}`,
        `- Blocked targets: ${summary.counts.blockedTargets}`,
        `- Attention targets: ${summary.counts.attentionTargets}`,
        `- Current recovery plans: ${summary.counts.currentRecoveryPlans}`,
        `- Latest local snapshot: ${summary.latestSnapshotAt ?? 'not created'}`,
        `- Hosted sync warnings: ${summary.counts.syncWarnings}`,
      ].join('\n'),
    },
    {
      heading: 'Top Daily Queue',
      body: list(
        topQueue.map(
          (item) =>
            `${item.grade}: ${item.label}${item.targetName ? ` / ${item.targetName}` : ''} - ${item.summary}`,
        ),
        'No active Ops queue items.',
      ),
    },
    {
      heading: 'Stale Evidence',
      body: list(
        staleEvidence.map((item) => `${item.label}: ${item.summary}`),
        'No stale or missing evidence queue items.',
      ),
    },
    {
      heading: 'Recovery Gaps',
      body: list(
        recoveryGaps.map((item) => `${item.label}: ${item.summary}`),
        'No recovery gaps in the Ops queue.',
      ),
    },
    {
      heading: 'Calibration and Data Integrity',
      body: [
        'Calibration:',
        list(
          calibrationRows.map((item) => `${item.grade}: ${item.summary}`),
          'No calibration queue item.',
        ),
        '',
        'Data integrity:',
        list(
          integrityRows.map((item) => `${item.grade}: ${item.summary}`),
          'No data integrity queue item.',
        ),
      ].join('\n'),
    },
    {
      heading: 'Snapshot Status',
      body: [
        `- Latest local snapshot: ${summary.latestSnapshotAt ?? 'not created'}`,
        `- Missing snapshot flag: ${summary.counts.missingSnapshots}`,
        `- Stale snapshot flag: ${summary.counts.staleSnapshots}`,
        `- Snapshot stale threshold: ${summary.staleSnapshotDays} day(s)`,
      ].join('\n'),
    },
    {
      heading: 'Next Operator Actions',
      body: list(
        topQueue.flatMap((item) =>
          item.actions.slice(0, 3).map((action) => `${item.label}: ${action.label}`),
        ),
        'No next actions derived from the Ops queue.',
      ),
    },
  ]
}

export function buildReportMarkdown({
  type,
  records,
  dispatch,
  reports = emptyReportsState,
  review,
  calibration,
  calibrationIssues = [],
  workspace,
  sync,
  dataIntegrityDiagnostics = [],
  planning,
  writingDrafts,
  selectedReviewNotes = [],
  selectedReviewSessions = [],
  now = new Date(),
}: {
  type: ReportPacketType
  records: ProjectRecord[]
  dispatch: DispatchState
  reports?: ReportsState
  review?: ReviewState
  calibration?: AtlasCalibrationState
  calibrationIssues?: CalibrationIssue[]
  workspace?: Workspace
  sync?: AtlasSyncState
  dataIntegrityDiagnostics?: DataIntegrityDiagnostic[]
  planning: PlanningState
  writingDrafts: WritingDraft[]
  selectedReviewNotes?: ReviewNote[]
  selectedReviewSessions?: ReviewSession[]
  now?: Date
}) {
  const packetType = getReportPacketType(type)
  const sections =
    type === 'operations-readiness-packet'
      ? buildOperationsReadinessSections({
          workspace,
          dispatch,
          reports,
          sync,
          calibration,
          calibrationIssues,
          dataIntegrityDiagnostics,
          now,
        })
      : [
          { heading: 'Included Writing Drafts', body: buildWritingSection(writingDrafts) },
          {
            heading: 'Project Context',
            body: records.map((record) => buildProjectSection(record, planning)).join('\n\n'),
          },
          { heading: 'Dispatch Posture', body: buildDispatchSection(records, dispatch) },
          {
            heading: 'Deployment Runbooks & Artifact Readiness',
            body: buildDeploymentRunbookSection(records, dispatch),
          },
          { heading: 'Deploy Session Evidence', body: buildDeploySessionSection(records, dispatch) },
          {
            heading: 'Dispatch Closeout Analytics',
            body: buildDispatchCloseoutSection(records, dispatch, reports),
            include: isDeploymentReportType(type),
          },
          {
            heading: 'Stored Dispatch Evidence',
            body: buildStoredDispatchEvidenceSection(records, dispatch),
          },
          { heading: 'GitHub Context', body: buildGithubSection(records, writingDrafts) },
          {
            heading: 'Review Center Notes',
            body: buildReviewSection({
              records,
              review,
              selectedNotes: selectedReviewNotes,
              selectedSessions: selectedReviewSessions,
            }),
            include:
              type === 'internal-weekly-packet' ||
              type === 'project-handoff-packet' ||
              selectedReviewNotes.length > 0 ||
              selectedReviewSessions.length > 0,
          },
          {
            heading: 'Calibration Operations',
            body: buildCalibrationSection(calibration, calibrationIssues),
            include: shouldIncludeCalibrationSection(type),
          },
        ]

  return assembleReportMarkdown({
    title: reportTitle(type, records, now),
    reportTypeLabel: packetType.label,
    generatedAt: now.toISOString(),
    templateFocus: buildReportTemplateFocus(type),
    sections,
  })
}

export function createReportPacket({
  type,
  projectRecords,
  dispatch,
  reports = emptyReportsState,
  review,
  planning,
  writingDrafts,
  projectIds,
  writingDraftIds,
  reviewNoteIds = [],
  reviewSessionIds = [],
  calibration,
  calibrationIssues = [],
  workspace,
  sync,
  dataIntegrityDiagnostics = [],
  now = new Date(),
}: ReportContextInput): ReportPacket {
  const records = selectedRecords(projectRecords, projectIds)
  const draftIdSet = new Set(writingDraftIds)
  const selectedDrafts = writingDrafts.filter(
    (draft) =>
      draftIdSet.has(draft.id) && ['approved', 'exported'].includes(draft.status),
  )
  const reviewNoteIdSet = new Set(reviewNoteIds)
  const reviewSessionIdSet = new Set(reviewSessionIds)
  const selectedReviewNotes = review
    ? review.notes.filter((note) => reviewNoteIdSet.has(note.id))
    : []
  const selectedReviewSessions = review
    ? review.sessions.filter((session) => reviewSessionIdSet.has(session.id))
    : []
  const sourceSummary = records.map((record) => summarizeProject(record, dispatch, planning, now))
  const contextWarnings = [
    ...(records.length === 0 ? ['No project records are included in this report packet.'] : []),
    ...(selectedDrafts.length === 0 && type !== 'operations-readiness-packet'
      ? ['No approved or exported Writing drafts are included.']
      : []),
  ]
  const id = `report-${type}-${now.getTime()}`
  const title = reportTitle(type, records, now)

  return {
    id,
    type,
    title,
    status: 'draft',
    projectIds: records.map((record) => record.project.id),
    writingDraftIds: selectedDrafts.map((draft) => draft.id),
    reviewNoteIds: selectedReviewNotes.map((note) => note.id),
    reviewSessionIds: selectedReviewSessions.map((session) => session.id),
    markdown: buildReportMarkdown({
      type,
      records,
      dispatch,
      reports,
      review,
      calibration,
      calibrationIssues,
      workspace,
      sync,
      dataIntegrityDiagnostics,
      planning,
      writingDrafts: selectedDrafts,
      selectedReviewNotes,
      selectedReviewSessions,
      now,
    }),
    sourceSummary,
    contextWarnings,
    auditEvents: [
      createReportAuditEvent({
        packetId: id,
        type: 'created',
        detail: 'Report packet assembled locally for human review.',
        now,
      }),
    ],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    exportedAt: null,
  }
}

export function addReportPacket(
  state: ReportsState,
  packet: ReportPacket,
  now = new Date(),
): ReportsState {
  return {
    ...state,
    packets: [packet, ...state.packets.filter((candidate) => candidate.id !== packet.id)],
    updatedAt: now.toISOString(),
  }
}

export function updateReportPacketMarkdown(
  state: ReportsState,
  packetId: string,
  markdown: string,
  now = new Date(),
): ReportsState {
  return {
    ...state,
    packets: state.packets.map((packet) =>
      packet.id === packetId
        ? {
            ...packet,
            markdown,
            updatedAt: now.toISOString(),
            auditEvents: [
              ...packet.auditEvents,
              createReportAuditEvent({
                packetId,
                type: 'edited',
                detail: 'Report Markdown edited locally.',
                now,
              }),
            ],
          }
        : packet,
    ),
    updatedAt: now.toISOString(),
  }
}

function appendReportEvent(
  state: ReportsState,
  packetId: string,
  type: ReportAuditEventType,
  detail: string,
  now = new Date(),
  update?: Partial<ReportPacket>,
): ReportsState {
  return {
    ...state,
    packets: state.packets.map((packet) =>
      packet.id === packetId
        ? {
            ...packet,
            ...update,
            updatedAt: now.toISOString(),
            auditEvents: [
              ...packet.auditEvents,
              createReportAuditEvent({ packetId, type, detail, now }),
            ],
          }
        : packet,
    ),
    updatedAt: now.toISOString(),
  }
}

export function recordReportCopied(state: ReportsState, packetId: string, now = new Date()) {
  return appendReportEvent(state, packetId, 'copied', 'Report Markdown copied locally.', now)
}

export function markReportExported(state: ReportsState, packetId: string, now = new Date()) {
  return appendReportEvent(
    state,
    packetId,
    'markdown-exported',
    'Report Markdown downloaded locally.',
    now,
    { status: 'exported', exportedAt: now.toISOString() },
  )
}

export function archiveReportPacket(state: ReportsState, packetId: string, now = new Date()) {
  return appendReportEvent(
    state,
    packetId,
    'archived',
    'Report packet archived locally.',
    now,
    { status: 'archived' },
  )
}

export function reportFilename(packet: ReportPacket) {
  return `${slugifyFilename(packet.title || 'atlas-report-packet')}.md`
}
