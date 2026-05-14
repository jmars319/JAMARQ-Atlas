import type { ProjectRecord } from '../domain/atlas'
import {
  findReadiness,
  getLatestDeploymentRecord,
  type DispatchState,
} from '../domain/dispatch'
import {
  getWritingTemplate,
  type WritingContextDispatchTarget,
  type WritingContextGithub,
  type WritingContextSnapshot,
  type WritingDraft,
  type WritingDraftStatus,
  type WritingReviewEvent,
  type WritingReviewEventType,
  type WritingTemplateId,
  type WritingWorkbenchState,
  type WritingProviderResult,
} from '../domain/writing'
import { evaluateDispatchReadiness } from './dispatchReadiness'
import { evaluateVerification } from './verification'
import { getStubWritingProviderResult, normalizeWritingProviderResult } from './writingProvider'
import {
  createWritingPromptPacket as createPromptPacketFromTemplate,
  scaffoldForWritingTemplate,
  writingTemplateDefinitions,
} from './writingTemplates'
export {
  buildWritingMarkdownPacket,
  createWritingPromptPacket,
  writingGuardrails,
} from './writingTemplates'

export type AiWritingAction = WritingTemplateId

export const aiWritingActions = writingTemplateDefinitions

const writingStatuses = new Set<WritingDraftStatus>([
  'draft',
  'reviewed',
  'approved',
  'exported',
  'archived',
])

const emptyGithubContext: WritingContextGithub = {
  repository: null,
  overview: null,
  latestCommits: [],
  warnings: ['No repository context was included.'],
}

function dateStamp(value: string) {
  return value.slice(0, 10)
}

function nowStamp(now = new Date()) {
  return now.toISOString()
}

function eventId(draftId: string, type: WritingReviewEventType, occurredAt: string) {
  return `${draftId}-${type}-${occurredAt.replace(/[^0-9a-z]/gi, '')}`
}

function createWritingReviewEvent({
  draftId,
  type,
  detail,
  now = new Date(),
}: {
  draftId: string
  type: WritingReviewEventType
  detail: string
  now?: Date
}): WritingReviewEvent {
  const occurredAt = nowStamp(now)

  return {
    id: eventId(draftId, type, occurredAt),
    type,
    occurredAt,
    detail,
  }
}

function normalizeString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function isWritingTemplateId(value: unknown): value is WritingTemplateId {
  return writingTemplateDefinitions.some((template) => template.id === value)
}

function normalizeReviewEvents(draft: Partial<WritingDraft>, now = new Date()) {
  const events = Array.isArray(draft.reviewEvents)
    ? draft.reviewEvents
        .filter((event): event is WritingReviewEvent =>
          Boolean(
            event &&
              typeof event.id === 'string' &&
              typeof event.type === 'string' &&
              typeof event.occurredAt === 'string' &&
              typeof event.detail === 'string',
          ),
        )
    : []

  if (events.length > 0) {
    return events
  }

  return [
    createWritingReviewEvent({
      draftId: normalizeString(draft.id, 'writing-draft'),
      type: 'created',
      detail: 'Draft normalized into Writing Review storage.',
      now: draft.createdAt ? new Date(draft.createdAt) : now,
    }),
  ]
}

function summarizeDispatch(record: ProjectRecord, dispatch: DispatchState) {
  return dispatch.targets
    .filter((target) => target.projectId === record.project.id)
    .map<WritingContextDispatchTarget>((target) => {
      const readiness = findReadiness(dispatch, target.projectId, target.id)
      const latestRecord = getLatestDeploymentRecord(dispatch, target.id)
      const evaluation = evaluateDispatchReadiness({ target, readiness, latestRecord })

      return {
        targetId: target.id,
        name: target.name,
        environment: target.environment,
        hostType: target.hostType,
        status: target.status,
        publicUrl: target.publicUrl,
        ready: evaluation.ready,
        blocked: evaluation.blocked,
        blockers: evaluation.blockers,
        warnings: evaluation.warnings,
      }
    })
}

export function buildWritingContextSnapshot({
  record,
  dispatch,
  github,
  now = new Date(),
}: {
  record: ProjectRecord
  dispatch: DispatchState
  github?: WritingContextGithub
  now?: Date
}): WritingContextSnapshot {
  const verification = evaluateVerification(record.project, now)
  const dispatchSummary = summarizeDispatch(record, dispatch)
  const githubContext = github ?? emptyGithubContext
  const warnings = [
    ...githubContext.warnings,
    ...(dispatchSummary.length === 0 ? ['No Dispatch target is configured for this project.'] : []),
  ]

  return {
    projectId: record.project.id,
    projectName: record.project.name,
    sectionName: record.section.name,
    groupName: record.group.name,
    capturedAt: now.toISOString(),
    manual: {
      status: record.project.manual.status,
      nextAction: record.project.manual.nextAction,
      lastMeaningfulChange: record.project.manual.lastMeaningfulChange,
      lastVerified: record.project.manual.lastVerified,
      currentRisk: record.project.manual.currentRisk,
      blockers: [...record.project.manual.blockers],
      deferredItems: [...record.project.manual.deferredItems],
      notDoingItems: [...record.project.manual.notDoingItems],
      notes: [...record.project.manual.notes],
      decisions: [...record.project.manual.decisions],
    },
    activity: record.project.activity
      .slice()
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .slice(0, 8)
      .map((event) => ({
        id: event.id,
        type: event.type,
        title: event.title,
        detail: event.detail,
        occurredAt: event.occurredAt,
        source: event.source,
      })),
    verification: {
      cadence: verification.cadence,
      dueState: verification.dueState,
      lastVerified: record.project.manual.lastVerified,
      dueDate: verification.dueDate,
    },
    dispatch: dispatchSummary,
    github: githubContext,
    warnings,
  }
}

function templateTitle(templateId: WritingTemplateId, projectName: string, now: Date) {
  const template = getWritingTemplate(templateId)
  return `${template.label} - ${projectName} - ${dateStamp(now.toISOString())}`
}

export function createWritingDraft({
  templateId,
  record,
  dispatch,
  github,
  now = new Date(),
}: {
  templateId: WritingTemplateId
  record: ProjectRecord
  dispatch: DispatchState
  github?: WritingContextGithub
  now?: Date
}): WritingDraft {
  const contextSnapshot = buildWritingContextSnapshot({ record, dispatch, github, now })
  const promptPacket = createPromptPacketFromTemplate(templateId, contextSnapshot)

  return {
    id: `writing-${record.project.id}-${templateId}-${now.getTime()}`,
    projectId: record.project.id,
    templateId,
    title: templateTitle(templateId, record.project.name, now),
    status: 'draft',
    reviewEvents: [
      createWritingReviewEvent({
        draftId: `writing-${record.project.id}-${templateId}-${now.getTime()}`,
        type: 'created',
        detail: 'Draft packet created for human review.',
        now,
      }),
    ],
    draftText: scaffoldForWritingTemplate(templateId, contextSnapshot),
    promptPacket,
    contextSnapshot,
    providerResult: getStubWritingProviderResult(),
    notes: '',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  }
}

export function normalizeWritingDraft(value: unknown, now = new Date()): WritingDraft | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const draft = value as Partial<WritingDraft>
  const id = normalizeString(draft.id)
  const templateId = isWritingTemplateId(draft.templateId) ? draft.templateId : 'client-update'

  if (!id || !draft.contextSnapshot) {
    return null
  }

  const createdAt = normalizeString(draft.createdAt, nowStamp(now))
  const updatedAt = normalizeString(draft.updatedAt, createdAt)
  const status = draft.status && writingStatuses.has(draft.status) ? draft.status : 'draft'

  return {
    id,
    projectId: normalizeString(draft.projectId, draft.contextSnapshot.projectId),
    templateId,
    title: normalizeString(draft.title, templateTitle(templateId, draft.contextSnapshot.projectName, now)),
    status,
    reviewEvents: normalizeReviewEvents(draft, now),
    draftText: normalizeString(draft.draftText),
    promptPacket: normalizeString(draft.promptPacket),
    contextSnapshot: draft.contextSnapshot,
    providerResult: normalizeWritingProviderResult(draft.providerResult),
    notes: normalizeString(draft.notes),
    createdAt,
    updatedAt,
  }
}

export function normalizeWritingState(value: unknown): WritingWorkbenchState {
  const candidate =
    typeof value === 'object' && value !== null ? (value as Partial<WritingWorkbenchState>) : null

  if (!candidate || !Array.isArray(candidate.drafts)) {
    return {
      drafts: [],
    }
  }

  return {
    drafts: candidate.drafts.flatMap((draft) => {
      const normalized = normalizeWritingDraft(draft)
      return normalized ? [normalized] : []
    }),
  }
}

export function updateWritingDraftText(
  drafts: WritingDraft[],
  draftId: string,
  draftText: string,
  now = new Date(),
) {
  return drafts.map((draft) =>
    draft.id === draftId ? { ...draft, draftText, updatedAt: now.toISOString() } : draft,
  )
}

export function updateWritingDraftNotes(
  drafts: WritingDraft[],
  draftId: string,
  notes: string,
  now = new Date(),
) {
  return drafts.map((draft) =>
    draft.id === draftId ? { ...draft, notes, updatedAt: now.toISOString() } : draft,
  )
}

export function recordWritingProviderSuggestion(
  drafts: WritingDraft[],
  draftId: string,
  providerResult: WritingProviderResult,
  now = new Date(),
) {
  return drafts.map((draft) => {
    if (draft.id !== draftId) {
      return draft
    }

    const normalizedResult = normalizeWritingProviderResult(providerResult)
    const shouldAudit = normalizedResult.status === 'generated' && Boolean(normalizedResult.generatedText)

    return {
      ...draft,
      providerResult: normalizedResult,
      updatedAt: nowStamp(now),
      reviewEvents: shouldAudit
        ? [
            ...draft.reviewEvents,
            createWritingReviewEvent({
              draftId,
              type: 'provider-suggestion',
              detail: [
                `Provider suggestion generated by ${normalizedResult.providerName}${normalizedResult.model ? ` using ${normalizedResult.model}` : ''}.`,
                normalizedResult.generatedAt ? `Generated at ${normalizedResult.generatedAt}.` : '',
                normalizedResult.message,
                'Draft text was not changed.',
              ]
                .filter(Boolean)
                .join(' '),
              now,
            }),
          ]
        : draft.reviewEvents,
    }
  })
}

export function applyWritingProviderSuggestion(
  drafts: WritingDraft[],
  draftId: string,
  now = new Date(),
) {
  return drafts.map((draft) => {
    if (draft.id !== draftId || !draft.providerResult.generatedText) {
      return draft
    }

    return {
      ...draft,
      draftText: draft.providerResult.generatedText,
      updatedAt: nowStamp(now),
      reviewEvents: [
        ...draft.reviewEvents,
        createWritingReviewEvent({
          draftId,
          type: 'suggestion-applied',
          detail: 'Provider suggestion explicitly applied to editable draft text by a human operator.',
          now,
        }),
      ],
    }
  })
}

export function markWritingDraftReviewed(
  drafts: WritingDraft[],
  draftId: string,
  now = new Date(),
) {
  return drafts.map((draft) =>
    draft.id === draftId
      ? {
          ...draft,
          status: 'reviewed' as const,
          updatedAt: nowStamp(now),
          reviewEvents: [
            ...draft.reviewEvents,
            createWritingReviewEvent({
              draftId,
              type: 'reviewed',
              detail: 'Draft marked reviewed by a human operator.',
              now,
            }),
          ],
        }
      : draft,
  )
}

export function approveWritingDraft(
  drafts: WritingDraft[],
  draftId: string,
  now = new Date(),
) {
  return drafts.map((draft) =>
    draft.id === draftId
      ? {
          ...draft,
          status: 'approved' as const,
          updatedAt: nowStamp(now),
          reviewEvents: [
            ...draft.reviewEvents,
            createWritingReviewEvent({
              draftId,
              type: 'approved',
              detail: 'Draft approved for local export or manual use.',
              now,
            }),
          ],
        }
      : draft,
  )
}

export function archiveWritingDraft(
  drafts: WritingDraft[],
  draftId: string,
  now = new Date(),
) {
  return drafts.map((draft) =>
    draft.id === draftId
      ? {
          ...draft,
          status: 'archived' as const,
          updatedAt: nowStamp(now),
          reviewEvents: [
            ...draft.reviewEvents,
            createWritingReviewEvent({
              draftId,
              type: 'archived',
              detail: 'Draft archived locally.',
              now,
            }),
          ],
        }
      : draft,
  )
}

export function recordWritingDraftCopied(
  drafts: WritingDraft[],
  draftId: string,
  type: Extract<WritingReviewEventType, 'copied' | 'prompt-copied'>,
  now = new Date(),
) {
  return drafts.map((draft) =>
    draft.id === draftId
      ? {
          ...draft,
          updatedAt: nowStamp(now),
          reviewEvents: [
            ...draft.reviewEvents,
            createWritingReviewEvent({
              draftId,
              type,
              detail: type === 'copied' ? 'Draft text copied locally.' : 'Prompt packet copied locally.',
              now,
            }),
          ],
        }
      : draft,
  )
}

export function markWritingDraftExported(
  drafts: WritingDraft[],
  draftId: string,
  now = new Date(),
) {
  return drafts.map((draft) =>
    draft.id === draftId
      ? {
          ...draft,
          status: 'exported' as const,
          updatedAt: nowStamp(now),
          reviewEvents: [
            ...draft.reviewEvents,
            createWritingReviewEvent({
              draftId,
              type: 'markdown-exported',
              detail: 'Markdown packet exported locally.',
              now,
            }),
          ],
        }
      : draft,
  )
}

export interface ClipboardWriteResult {
  ok: boolean
  message: string
}

interface ClipboardLike {
  writeText: (text: string) => Promise<void>
}

export async function copyTextToClipboard(
  text: string,
  clipboard: ClipboardLike | undefined = globalThis.navigator?.clipboard,
): Promise<ClipboardWriteResult> {
  if (!clipboard?.writeText) {
    return {
      ok: false,
      message: 'Clipboard API is not available in this environment.',
    }
  }

  try {
    await clipboard.writeText(text)
    return {
      ok: true,
      message: 'Copied locally.',
    }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Copy failed.',
    }
  }
}

export function createWritingAssistDraft(
  action: AiWritingAction,
  record: ProjectRecord,
  dispatch: DispatchState,
): string {
  const context = buildWritingContextSnapshot({ record, dispatch })
  return createPromptPacketFromTemplate(action, context)
}
