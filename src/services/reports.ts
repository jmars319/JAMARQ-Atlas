import type { ProjectRecord, Workspace } from '../domain/atlas'
import type { AtlasCalibrationState } from '../domain/calibration'
import type { DataIntegrityDiagnostic } from '../domain/dataIntegrity'
import type { DispatchState } from '../domain/dispatch'
import type { PlanningState } from '../domain/planning'
import {
  ATLAS_REPORTS_SCHEMA_VERSION,
  REPORT_PACKET_TYPES,
  emptyReportsState,
  type ReportAuditEvent,
  type ReportAuditEventType,
  type ReportPacket,
  type ReportPacketStatus,
  type ReportPacketType,
  type ReportProjectSummary,
  type ReportsState,
} from '../domain/reports'
import type { ReviewState } from '../domain/review'
import type { AtlasSyncState } from '../domain/sync'
import type { WritingDraft } from '../domain/writing'
import type { CalibrationIssue } from './calibration'
import { slugifyFilename } from './markdownTemplates'

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

import {
  buildReportMarkdown,
  reportTitle,
  selectedRecords,
  summarizeProject,
} from './reports/builders'

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
