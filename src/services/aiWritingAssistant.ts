import type { AtlasProject } from '../domain/atlas'

export type AiWritingAction =
  | 'activity-summary'
  | 'release-notes'
  | 'client-update'
  | 'codex-handoff'
  | 'clean-notes'

export interface AiWritingActionDefinition {
  id: AiWritingAction
  label: string
  intent: string
}

export const aiWritingActions: AiWritingActionDefinition[] = [
  {
    id: 'activity-summary',
    label: 'Summarize activity',
    intent: 'Summarize recent raw activity without changing status, risk, or priority.',
  },
  {
    id: 'release-notes',
    label: 'Draft release notes',
    intent: 'Turn selected activity into draft release notes for human review.',
  },
  {
    id: 'client-update',
    label: 'Draft client update',
    intent: 'Write a calm client-facing progress note from approved facts.',
  },
  {
    id: 'codex-handoff',
    label: 'Codex handoff',
    intent: 'Generate a concise implementation handoff from current notes and activity.',
  },
  {
    id: 'clean-notes',
    label: 'Clean notes',
    intent: 'Rewrite rough notes into cleaner operational language.',
  },
]

export function createWritingAssistDraft(
  action: AiWritingAction,
  project: AtlasProject,
): string {
  const definition =
    aiWritingActions.find((candidate) => candidate.id === action) ?? aiWritingActions[0]

  const activityLines = project.activity
    .slice()
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 6)
    .map((event) => `- ${event.occurredAt}: ${event.title} (${event.type}) - ${event.detail}`)
    .join('\n')

  return [
    `Task: ${definition.label}`,
    `Intent: ${definition.intent}`,
    '',
    'Guardrails:',
    '- Produce draft text only.',
    '- Do not decide or change status, priority, risk, roadmap, blockers, or next action.',
    '- Preserve human-authored operational state as the source of truth.',
    '- Call out uncertain points as questions for human review.',
    '',
    `Project: ${project.name}`,
    `Current status: ${project.manual.status}`,
    `Next action: ${project.manual.nextAction}`,
    `Current risk: ${project.manual.currentRisk}`,
    `Last verified: ${project.manual.lastVerified}`,
    '',
    'Notes:',
    ...project.manual.notes.map((note) => `- ${note}`),
    '',
    'Recent activity:',
    activityLines || '- No activity available.',
    '',
    'Return a concise draft that a human can review and edit.',
  ].join('\n')
}
