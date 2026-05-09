import type { ProjectRecord } from '../domain/atlas'
import { formatDateLabel } from '../domain/atlas'
import {
  findReadiness,
  formatDeploymentStatus,
  getLatestDeploymentRecord,
  type DispatchState,
} from '../domain/dispatch'
import {
  getWritingTemplate,
  WRITING_TEMPLATES,
  type WritingContextDispatchTarget,
  type WritingContextGithub,
  type WritingContextSnapshot,
  type WritingDraft,
  type WritingTemplateId,
} from '../domain/writing'
import { evaluateDispatchReadiness } from './dispatchReadiness'
import { evaluateVerification } from './verification'
import { getStubWritingProviderResult } from './writingProvider'

export type AiWritingAction = WritingTemplateId

export const aiWritingActions = WRITING_TEMPLATES

export const writingGuardrails = [
  'Produce draft text only.',
  'Do not decide or change status, priority, risk, roadmap, blockers, next action, verification, Dispatch readiness, or what should ship.',
  'Preserve human-authored operational state as the source of truth.',
  'Treat GitHub, Dispatch, and verification data as advisory signals only.',
  'Call out uncertain points as questions for human review.',
]

const emptyGithubContext: WritingContextGithub = {
  repository: null,
  overview: null,
  latestCommits: [],
  warnings: ['No repository context was included.'],
}

function dateStamp(value: string) {
  return value.slice(0, 10)
}

function listOrFallback(items: string[], fallback: string) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : `- ${fallback}`
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

function contextLines(context: WritingContextSnapshot) {
  const dispatchLines =
    context.dispatch.length > 0
      ? context.dispatch
          .map(
            (target) =>
              `- ${target.name}: ${formatDeploymentStatus(target.status)}, ${target.ready ? 'readiness clear' : 'readiness review'}, ${target.blockers.length} blockers, ${target.warnings.length} warnings`,
          )
          .join('\n')
      : '- No Dispatch target configured.'

  const githubLines = context.github.repository
    ? [
        `Repository: ${context.github.repository}`,
        `Latest commits:`,
        context.github.latestCommits.length > 0
          ? context.github.latestCommits
              .map((commit) => `- ${commit.shortSha}: ${commit.message}`)
              .join('\n')
          : '- No commit snippets available.',
      ].join('\n')
    : '- No GitHub snippets included.'

  return [
    `Project: ${context.projectName}`,
    `Location: ${context.sectionName} / ${context.groupName}`,
    `Current status: ${context.manual.status}`,
    `Next action: ${context.manual.nextAction}`,
    `Last meaningful change: ${context.manual.lastMeaningfulChange}`,
    `Last verified: ${formatDateLabel(context.manual.lastVerified)}`,
    `Current risk: ${context.manual.currentRisk || 'No current risk recorded.'}`,
    '',
    'Blockers:',
    listOrFallback(context.manual.blockers, 'No blockers recorded.'),
    '',
    'Deferred items:',
    listOrFallback(context.manual.deferredItems, 'No deferred items recorded.'),
    '',
    'Explicitly not doing:',
    listOrFallback(context.manual.notDoingItems, 'No not-doing items recorded.'),
    '',
    'Notes:',
    listOrFallback(context.manual.notes, 'No notes recorded.'),
    '',
    'Decisions:',
    listOrFallback(context.manual.decisions, 'No decisions recorded.'),
    '',
    'Recent Atlas activity:',
    context.activity.length > 0
      ? context.activity
          .map((event) => `- ${event.occurredAt}: ${event.title} (${event.type}) - ${event.detail}`)
          .join('\n')
      : '- No activity available.',
    '',
    'Verification:',
    `- Cadence: ${context.verification.cadence}`,
    `- Due state: ${context.verification.dueState}`,
    `- Due date: ${context.verification.dueDate ? formatDateLabel(context.verification.dueDate) : 'No due date'}`,
    '',
    'Dispatch:',
    dispatchLines,
    '',
    'GitHub snippets:',
    githubLines,
    '',
    'Context warnings:',
    listOrFallback(context.warnings, 'No context warnings.'),
  ]
}

export function createWritingPromptPacket(
  templateId: WritingTemplateId,
  context: WritingContextSnapshot,
) {
  const template = getWritingTemplate(templateId)

  return [
    `Task: ${template.label}`,
    `Intent: ${template.intent}`,
    '',
    'Guardrails:',
    ...writingGuardrails.map((guardrail) => `- ${guardrail}`),
    '',
    'Context:',
    ...contextLines(context),
    '',
    'Return reviewable draft text only. Include questions where facts are missing or uncertain.',
  ].join('\n')
}

function scaffoldForTemplate(templateId: WritingTemplateId, context: WritingContextSnapshot) {
  const uncertaintyLine =
    context.warnings.length > 0
      ? `Review needed: ${context.warnings.join(' ')}`
      : 'Review needed: confirm accuracy before sending or using this text.'

  if (templateId === 'release-notes') {
    return [
      'Template draft - not AI generated.',
      '',
      `Release notes draft for ${context.projectName}`,
      '',
      'What changed',
      listOrFallback(
        context.activity.map((event) => `${event.title}: ${event.detail}`),
        context.manual.lastMeaningfulChange || 'No change details recorded.',
      ),
      '',
      'Operational notes',
      `- Current Atlas status: ${context.manual.status}`,
      `- Last verified: ${formatDateLabel(context.manual.lastVerified)}`,
      '',
      uncertaintyLine,
    ].join('\n')
  }

  if (templateId === 'weekly-summary') {
    return [
      'Template draft - not AI generated.',
      '',
      `Weekly change summary for ${context.projectName}`,
      '',
      'Recent movement',
      listOrFallback(
        context.activity.map((event) => `${event.title}: ${event.detail}`),
        'No recent activity recorded.',
      ),
      '',
      'Current operational posture',
      `- Status: ${context.manual.status}`,
      `- Next action: ${context.manual.nextAction}`,
      `- Risk: ${context.manual.currentRisk || 'No current risk recorded.'}`,
      '',
      uncertaintyLine,
    ].join('\n')
  }

  if (templateId === 'codex-handoff') {
    return [
      'Template draft - not AI generated.',
      '',
      `Codex handoff for ${context.projectName}`,
      '',
      'Current state',
      `- Section/group: ${context.sectionName} / ${context.groupName}`,
      `- Status: ${context.manual.status}`,
      `- Next action: ${context.manual.nextAction}`,
      '',
      'Important context',
      listOrFallback(context.manual.notes, 'No notes recorded.'),
      '',
      'Do not change automatically',
      '- Atlas status, risk, blockers, verification, Dispatch readiness, and GitHub bindings remain human-controlled.',
      '',
      uncertaintyLine,
    ].join('\n')
  }

  return [
    'Template draft - not AI generated.',
    '',
    `Client update draft for ${context.projectName}`,
    '',
    `Current progress: ${context.manual.lastMeaningfulChange || context.manual.nextAction}`,
    '',
    `Next step: ${context.manual.nextAction}`,
    '',
    context.manual.blockers.length > 0
      ? `Needs attention: ${context.manual.blockers.join('; ')}`
      : 'Needs attention: no blocker is currently recorded.',
    '',
    uncertaintyLine,
  ].join('\n')
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
  const promptPacket = createWritingPromptPacket(templateId, contextSnapshot)

  return {
    id: `writing-${record.project.id}-${templateId}-${now.getTime()}`,
    projectId: record.project.id,
    templateId,
    title: templateTitle(templateId, record.project.name, now),
    status: 'draft',
    draftText: scaffoldForTemplate(templateId, contextSnapshot),
    promptPacket,
    contextSnapshot,
    providerResult: getStubWritingProviderResult(),
    notes: '',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
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

export function markWritingDraftReviewed(
  drafts: WritingDraft[],
  draftId: string,
  now = new Date(),
) {
  return drafts.map((draft) =>
    draft.id === draftId ? { ...draft, status: 'reviewed' as const, updatedAt: now.toISOString() } : draft,
  )
}

export function archiveWritingDraft(
  drafts: WritingDraft[],
  draftId: string,
  now = new Date(),
) {
  return drafts.map((draft) =>
    draft.id === draftId ? { ...draft, status: 'archived' as const, updatedAt: now.toISOString() } : draft,
  )
}

export function createWritingAssistDraft(
  action: AiWritingAction,
  record: ProjectRecord,
  dispatch: DispatchState,
): string {
  const context = buildWritingContextSnapshot({ record, dispatch })
  return createWritingPromptPacket(action, context)
}
