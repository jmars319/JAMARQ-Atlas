export const ATLAS_REPORTS_SCHEMA_VERSION = 2

export type AtlasReportsSchemaVersion = typeof ATLAS_REPORTS_SCHEMA_VERSION

export const REPORT_PACKET_TYPES = [
  {
    id: 'client-update-packet',
    label: 'Client update packet',
    intent: 'Assemble a client-facing update packet for human review.',
  },
  {
    id: 'internal-weekly-packet',
    label: 'Internal weekly packet',
    intent: 'Assemble a cross-project weekly operating summary.',
  },
  {
    id: 'release-packet',
    label: 'Release packet',
    intent: 'Assemble release context and approved draft material.',
  },
  {
    id: 'project-handoff-packet',
    label: 'Project handoff packet',
    intent: 'Assemble project context for another operator or Codex session.',
  },
  {
    id: 'deployment-readiness-packet',
    label: 'Deployment readiness packet',
    intent: 'Assemble cPanel runbook, artifact, preserve-path, and readiness context.',
  },
  {
    id: 'post-deploy-verification-packet',
    label: 'Post-deploy verification packet',
    intent: 'Assemble post-upload verification checks and operator notes.',
  },
  {
    id: 'client-site-update-packet',
    label: 'Client site update packet',
    intent: 'Assemble a client-facing site update packet for human review.',
  },
  {
    id: 'internal-deploy-handoff-packet',
    label: 'Internal deploy handoff packet',
    intent: 'Assemble internal deployment handoff context for another operator.',
  },
  {
    id: 'dispatch-closeout-summary-packet',
    label: 'Dispatch closeout summary packet',
    intent: 'Assemble closeout posture, evidence, and follow-up notes for deployment review.',
  },
] as const

export type ReportPacketType = (typeof REPORT_PACKET_TYPES)[number]['id']

export type ReportPacketStatus = 'draft' | 'exported' | 'archived'

export type ReportAuditEventType = 'created' | 'edited' | 'copied' | 'markdown-exported' | 'archived'

export interface ReportAuditEvent {
  id: string
  type: ReportAuditEventType
  occurredAt: string
  detail: string
}

export interface ReportProjectSummary {
  projectId: string
  projectName: string
  sectionName: string
  groupName: string
  status: string
  nextAction: string
  currentRisk: string
  lastVerified: string
  verificationState: string
  dispatchTargets: number
  dispatchWarnings: number
  planningItems: number
  repositoryCount: number
}

export interface ReportPacket {
  id: string
  type: ReportPacketType
  title: string
  status: ReportPacketStatus
  projectIds: string[]
  writingDraftIds: string[]
  reviewNoteIds: string[]
  reviewSessionIds: string[]
  markdown: string
  sourceSummary: ReportProjectSummary[]
  contextWarnings: string[]
  auditEvents: ReportAuditEvent[]
  createdAt: string
  updatedAt: string
  exportedAt: string | null
}

export interface ReportsState {
  schemaVersion: AtlasReportsSchemaVersion
  packets: ReportPacket[]
  updatedAt: string
}

export const emptyReportsState: ReportsState = {
  schemaVersion: ATLAS_REPORTS_SCHEMA_VERSION,
  packets: [],
  updatedAt: '',
}

export function getReportPacketType(type: ReportPacketType) {
  return REPORT_PACKET_TYPES.find((packetType) => packetType.id === type) ?? REPORT_PACKET_TYPES[0]
}
