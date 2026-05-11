import { formatDateLabel, type ProjectRecord } from '../domain/atlas'
import { findReadiness, type DispatchState } from '../domain/dispatch'
import type { PlanningState } from '../domain/planning'
import {
  ATLAS_REPORTS_SCHEMA_VERSION,
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
import type { WritingDraft } from '../domain/writing'
import { getPlanningForProject } from './planning'
import { evaluateVerification } from './verification'

export const reportGuardrails = [
  'Report packets are local review artifacts only.',
  'Export does not mean anything was sent, published, deployed, shipped, or verified.',
  'Reports must not change Atlas project status, risk, roadmap, verification, Dispatch readiness, GitHub bindings, Planning records, or Writing drafts.',
  'GitHub, Dispatch, Verification, Planning, and Writing context remains advisory.',
]

interface ReportContextInput {
  type: ReportPacketType
  projectRecords: ProjectRecord[]
  dispatch: DispatchState
  planning: PlanningState
  writingDrafts: WritingDraft[]
  projectIds: string[]
  writingDraftIds: string[]
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

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96)
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
  return [
    'client-update-packet',
    'internal-weekly-packet',
    'release-packet',
    'project-handoff-packet',
  ].includes(readString(value))
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
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : `- ${fallback}`
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
  ].join('\n')
}

export function buildReportMarkdown({
  type,
  records,
  dispatch,
  planning,
  writingDrafts,
  now = new Date(),
}: {
  type: ReportPacketType
  records: ProjectRecord[]
  dispatch: DispatchState
  planning: PlanningState
  writingDrafts: WritingDraft[]
  now?: Date
}) {
  const packetType = getReportPacketType(type)

  return [
    `# ${reportTitle(type, records, now)}`,
    '',
    `Report type: ${packetType.label}`,
    `Generated locally: ${now.toISOString()}`,
    '',
    '## Guardrails',
    '',
    ...reportGuardrails.map((guardrail) => `- ${guardrail}`),
    '',
    '## Included Writing Drafts',
    '',
    buildWritingSection(writingDrafts),
    '',
    '## Project Context',
    '',
    records.map((record) => buildProjectSection(record, planning)).join('\n\n'),
    '',
    '## Dispatch Posture',
    '',
    buildDispatchSection(records, dispatch),
    '',
    '## GitHub Context',
    '',
    buildGithubSection(records, writingDrafts),
    '',
  ].join('\n')
}

export function createReportPacket({
  type,
  projectRecords,
  dispatch,
  planning,
  writingDrafts,
  projectIds,
  writingDraftIds,
  now = new Date(),
}: ReportContextInput): ReportPacket {
  const records = selectedRecords(projectRecords, projectIds)
  const draftIdSet = new Set(writingDraftIds)
  const selectedDrafts = writingDrafts.filter(
    (draft) =>
      draftIdSet.has(draft.id) && ['approved', 'exported'].includes(draft.status),
  )
  const sourceSummary = records.map((record) => summarizeProject(record, dispatch, planning, now))
  const contextWarnings = [
    ...(records.length === 0 ? ['No project records are included in this report packet.'] : []),
    ...(selectedDrafts.length === 0
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
    markdown: buildReportMarkdown({
      type,
      records,
      dispatch,
      planning,
      writingDrafts: selectedDrafts,
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
  return `${slugify(packet.title || 'atlas-report-packet')}.md`
}
