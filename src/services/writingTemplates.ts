import { formatDateLabel } from '../domain/atlas'
import { formatDeploymentStatus } from '../domain/dispatch'
import {
  getWritingTemplate,
  WRITING_TEMPLATES,
  type WritingContextSnapshot,
  type WritingDraft,
  type WritingExportPacket,
  type WritingTemplateId,
} from '../domain/writing'
import { markdownGuardrails, markdownList, slugifyFilename } from './markdownTemplates'

export const writingTemplateDefinitions = WRITING_TEMPLATES

export const writingGuardrails = [
  'Produce draft text only.',
  'Do not decide or change status, priority, risk, roadmap, blockers, next action, verification, Dispatch readiness, or what should ship.',
  'Preserve human-authored operational state as the source of truth.',
  'Treat GitHub, Dispatch, and verification data as advisory signals only.',
  'Call out uncertain points as questions for human review.',
]

function listOrFallback(items: string[], fallback: string) {
  return markdownList(items, fallback)
}

export function buildWritingContextLines(context: WritingContextSnapshot) {
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
    ...markdownGuardrails(writingGuardrails),
    '',
    'Context:',
    ...buildWritingContextLines(context),
    '',
    'Return reviewable draft text only. Include questions where facts are missing or uncertain.',
  ].join('\n')
}

export function scaffoldForWritingTemplate(
  templateId: WritingTemplateId,
  context: WritingContextSnapshot,
) {
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

export function buildWritingMarkdownPacket(
  draft: WritingDraft,
  { includePrompt = true, now = new Date() }: { includePrompt?: boolean; now?: Date } = {},
): WritingExportPacket {
  const template = getWritingTemplate(draft.templateId)
  const context = draft.contextSnapshot
  const createdAt = now.toISOString()
  const filename = `${slugifyFilename(draft.title || `${template.label}-${context.projectName}`)}.md`
  const markdown = [
    `# ${draft.title}`,
    '',
    `- Project: ${context.projectName}`,
    `- Section: ${context.sectionName}`,
    `- Group: ${context.groupName}`,
    `- Template: ${template.label}`,
    `- Draft status: ${draft.status}`,
    `- Created: ${draft.createdAt}`,
    `- Updated: ${draft.updatedAt}`,
    `- Exported: ${createdAt}`,
    '',
    '## Draft Text',
    '',
    draft.draftText || '_No draft text provided._',
    '',
    '## Review Notes',
    '',
    draft.notes || '_No review notes recorded._',
    '',
    '## Context Warnings',
    '',
    listOrFallback(context.warnings, 'No context warnings.'),
    '',
    '## Source Context Summary',
    '',
    `- Manual status: ${context.manual.status}`,
    `- Next action: ${context.manual.nextAction || 'Not recorded.'}`,
    `- Last meaningful change: ${context.manual.lastMeaningfulChange || 'Not recorded.'}`,
    `- Last verified: ${context.manual.lastVerified || 'Not recorded.'}`,
    `- Current risk: ${context.manual.currentRisk || 'No current risk recorded.'}`,
    `- Verification due state: ${context.verification.dueState}`,
    `- Dispatch targets: ${context.dispatch.length}`,
    `- GitHub repository: ${context.github.repository ?? 'No repository context included.'}`,
    '',
    '## Guardrails',
    '',
    ...markdownGuardrails(writingGuardrails),
    '',
    '## Review Audit',
    '',
    listOrFallback(
      draft.reviewEvents.map((event) => `${event.occurredAt}: ${event.type} - ${event.detail}`),
      'No review events recorded.',
    ),
    ...(includePrompt
      ? [
          '',
          '## Prompt Packet Appendix',
          '',
          '```text',
          draft.promptPacket,
          '```',
        ]
      : []),
    '',
  ].join('\n')

  return {
    format: 'markdown',
    filename,
    markdown,
    createdAt,
  }
}
