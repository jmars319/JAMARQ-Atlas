import type { WorkStatus } from './atlas'
import type { DeploymentStatus } from './dispatch'

export const WRITING_TEMPLATES = [
  {
    id: 'client-update',
    label: 'Client update',
    intent: 'Draft a calm client-facing progress update from approved facts.',
  },
  {
    id: 'release-notes',
    label: 'Release notes',
    intent: 'Draft release notes from selected activity and operational context.',
  },
  {
    id: 'weekly-summary',
    label: 'Weekly change summary',
    intent: 'Summarize what changed this week without deciding priority or status.',
  },
  {
    id: 'codex-handoff',
    label: 'Codex handoff',
    intent: 'Draft an implementation handoff for another Codex session or engineer.',
  },
] as const

export type WritingTemplateId = (typeof WRITING_TEMPLATES)[number]['id']

export type WritingDraftStatus = 'draft' | 'reviewed' | 'approved' | 'exported' | 'archived'

export type WritingReviewEventType =
  | 'created'
  | 'reviewed'
  | 'approved'
  | 'copied'
  | 'prompt-copied'
  | 'provider-suggestion'
  | 'suggestion-applied'
  | 'markdown-exported'
  | 'archived'

export type WritingExportFormat = 'markdown'

export interface WritingReviewEvent {
  id: string
  type: WritingReviewEventType
  occurredAt: string
  detail: string
}

export interface WritingContextActivityItem {
  id: string
  type: string
  title: string
  detail: string
  occurredAt: string
  source: string
}

export interface WritingContextVerification {
  cadence: string
  dueState: string
  lastVerified: string
  dueDate: string | null
}

export interface WritingContextDispatchTarget {
  targetId: string
  name: string
  environment: string
  hostType: string
  status: DeploymentStatus
  publicUrl: string
  ready: boolean
  blocked: boolean
  blockers: string[]
  warnings: string[]
}

export interface WritingContextGithub {
  repository: string | null
  overview: {
    visibility: string
    defaultBranch: string
    language: string | null
    pushedAt: string | null
    updatedAt: string
  } | null
  latestCommits: {
    shortSha: string
    message: string
    author: string | null
    date: string | null
  }[]
  warnings: string[]
}

export interface WritingContextSnapshot {
  projectId: string
  projectName: string
  sectionName: string
  groupName: string
  capturedAt: string
  manual: {
    status: WorkStatus
    nextAction: string
    lastMeaningfulChange: string
    lastVerified: string
    currentRisk: string
    blockers: string[]
    deferredItems: string[]
    notDoingItems: string[]
    notes: string[]
    decisions: string[]
  }
  activity: WritingContextActivityItem[]
  verification: WritingContextVerification
  dispatch: WritingContextDispatchTarget[]
  github: WritingContextGithub
  warnings: string[]
}

export type WritingProviderStatus = 'not-configured' | 'stub' | 'configured' | 'generated' | 'error'

export interface WritingProviderResult {
  status: WritingProviderStatus
  providerName: string
  model: string
  message: string
  generatedText: string | null
  generatedAt: string | null
}

export interface WritingDraft {
  id: string
  projectId: string
  templateId: WritingTemplateId
  title: string
  status: WritingDraftStatus
  reviewEvents: WritingReviewEvent[]
  draftText: string
  promptPacket: string
  contextSnapshot: WritingContextSnapshot
  providerResult: WritingProviderResult
  notes: string
  createdAt: string
  updatedAt: string
}

export interface WritingExportPacket {
  format: WritingExportFormat
  filename: string
  markdown: string
  createdAt: string
}

export interface WritingWorkbenchState {
  drafts: WritingDraft[]
}

export const emptyWritingState: WritingWorkbenchState = {
  drafts: [],
}

export function getWritingTemplate(templateId: WritingTemplateId) {
  return WRITING_TEMPLATES.find((template) => template.id === templateId) ?? WRITING_TEMPLATES[0]
}
