import { describe, expect, it } from 'vitest'
import { seedDispatchState } from '../src/data/seedDispatch'
import { seedWorkspace } from '../src/data/seedWorkspace'
import { flattenProjects } from '../src/domain/atlas'
import type { WritingContextGithub } from '../src/domain/writing'
import {
  approveWritingDraft,
  archiveWritingDraft,
  buildWritingContextSnapshot,
  buildWritingMarkdownPacket,
  copyTextToClipboard,
  createWritingDraft,
  createWritingPromptPacket,
  applyWritingProviderSuggestion,
  markWritingDraftExported,
  markWritingDraftReviewed,
  normalizeWritingState,
  recordWritingProviderSuggestion,
  recordWritingDraftCopied,
  updateWritingDraftText,
  writingGuardrails,
} from '../src/services/aiWritingAssistant'
import {
  buildWritingContextLines,
  scaffoldForWritingTemplate,
  writingTemplateDefinitions,
} from '../src/services/writingTemplates'
import {
  createWritingProviderInput,
  createWritingProviderNotConfiguredResponse,
  createWritingProviderStatus,
  getWritingProviderConfig,
  normalizeOpenAIResponseText,
} from '../server/writingApi'
import { normalizeWritingProviderError } from '../src/services/writingProvider'

const record = flattenProjects(seedWorkspace).find(
  (candidate) => candidate.project.id === 'midway-music-hall-site',
)!
const now = new Date('2026-05-09T14:30:00Z')

const githubContext: WritingContextGithub = {
  repository: 'jmars319/midway-music-hall',
  overview: {
    visibility: 'private',
    defaultBranch: 'main',
    language: 'TypeScript',
    pushedAt: '2026-05-09T12:00:00Z',
    updatedAt: '2026-05-09T12:00:00Z',
  },
  latestCommits: [
    {
      shortSha: 'abc1234',
      message: 'Tighten homepage copy',
      author: 'Jason',
      date: '2026-05-09T12:00:00Z',
    },
  ],
  warnings: [],
}

describe('AI writing assistant', () => {
  it('includes source-of-truth guardrails in generated prompt packets', () => {
    const context = buildWritingContextSnapshot({
      record,
      dispatch: seedDispatchState,
      github: githubContext,
      now,
    })
    const packet = createWritingPromptPacket('client-update', context)

    writingGuardrails.forEach((guardrail) => {
      expect(packet).toContain(guardrail)
    })
    expect(packet).toContain('Treat GitHub, Dispatch, and verification data as advisory signals only.')
  })

  it('creates stable packets for the core four writing templates', () => {
    const templates = ['client-update', 'release-notes', 'weekly-summary', 'codex-handoff'] as const

    const drafts = templates.map((templateId) =>
      createWritingDraft({
        templateId,
        record,
        dispatch: seedDispatchState,
        github: githubContext,
        now,
      }),
    )

    expect(drafts.map((draft) => draft.templateId)).toEqual(templates)
    expect(drafts.every((draft) => draft.promptPacket.includes('Return reviewable draft text only.'))).toBe(
      true,
    )
    expect(drafts.every((draft) => draft.draftText.includes('Template draft - not AI generated.'))).toBe(
      true,
    )
  })

  it('uses reusable writing template definitions and context sections', () => {
    const context = buildWritingContextSnapshot({
      record,
      dispatch: seedDispatchState,
      github: githubContext,
      now,
    })

    expect(writingTemplateDefinitions.map((template) => template.id)).toEqual([
      'client-update',
      'release-notes',
      'weekly-summary',
      'codex-handoff',
    ])
    expect(buildWritingContextLines(context)).toContain('GitHub snippets:')
    expect(scaffoldForWritingTemplate('codex-handoff', context)).toContain('Do not change automatically')
  })

  it('captures Atlas, verification, Dispatch, and GitHub context without changing workspace data', () => {
    const projectBefore = JSON.stringify(record.project)
    const context = buildWritingContextSnapshot({
      record,
      dispatch: seedDispatchState,
      github: githubContext,
      now,
    })

    expect(context.manual.status).toBe(record.project.manual.status)
    expect(context.activity.length).toBeGreaterThan(0)
    expect(context.verification.cadence).toBe(record.project.manual.verificationCadence)
    expect(context.dispatch.length).toBeGreaterThan(0)
    expect(context.github.latestCommits[0].shortSha).toBe('abc1234')
    expect(JSON.stringify(record.project)).toBe(projectBefore)
  })

  it('records scoped warnings when GitHub context is missing', () => {
    const context = buildWritingContextSnapshot({
      record,
      dispatch: seedDispatchState,
      now,
    })

    expect(context.github.repository).toBeNull()
    expect(context.warnings).toContain('No repository context was included.')
  })

  it('updates draft state without mutating the original draft array or project status', () => {
    const draft = createWritingDraft({
      templateId: 'client-update',
      record,
      dispatch: seedDispatchState,
      github: githubContext,
      now,
    })
    const drafts = [draft]

    const updated = updateWritingDraftText(drafts, draft.id, 'Human-edited client update.', now)
    const reviewed = markWritingDraftReviewed(updated, draft.id, now)
    const approved = approveWritingDraft(reviewed, draft.id, now)
    const copied = recordWritingDraftCopied(approved, draft.id, 'copied', now)
    const exported = markWritingDraftExported(copied, draft.id, now)
    const archived = archiveWritingDraft(exported, draft.id, now)

    expect(drafts[0].draftText).not.toBe('Human-edited client update.')
    expect(updated[0].draftText).toBe('Human-edited client update.')
    expect(reviewed[0].status).toBe('reviewed')
    expect(approved[0].status).toBe('approved')
    expect(exported[0].status).toBe('exported')
    expect(archived[0].status).toBe('archived')
    expect(archived[0].reviewEvents.map((event) => event.type)).toEqual([
      'created',
      'reviewed',
      'approved',
      'copied',
      'markdown-exported',
      'archived',
    ])
    expect(record.project.manual.status).toBe('Active')
  })

  it('normalizes old writing drafts into the new review lifecycle shape', () => {
    const draft = createWritingDraft({
      templateId: 'client-update',
      record,
      dispatch: seedDispatchState,
      github: githubContext,
      now,
    })
    const legacyDraft = {
      ...draft,
      reviewEvents: undefined,
      status: 'reviewed',
    }

    const normalized = normalizeWritingState({ drafts: [legacyDraft] })

    expect(normalized.drafts).toHaveLength(1)
    expect(normalized.drafts[0].status).toBe('reviewed')
    expect(normalized.drafts[0].reviewEvents[0].type).toBe('created')
  })

  it('builds Markdown export packets with metadata, warnings, guardrails, and prompt appendix', () => {
    const draft = createWritingDraft({
      templateId: 'client-update',
      record,
      dispatch: seedDispatchState,
      now,
    })
    const packet = buildWritingMarkdownPacket(draft, { now })

    expect(packet.format).toBe('markdown')
    expect(packet.filename).toMatch(/client-update/)
    expect(packet.markdown).toContain('## Draft Text')
    expect(packet.markdown).toContain('No repository context was included.')
    expect(packet.markdown).toContain('Produce draft text only.')
    expect(packet.markdown).toContain('## Prompt Packet Appendix')
  })

  it('reports clipboard success and unsupported states without throwing', async () => {
    const success = await copyTextToClipboard('Draft text', {
      writeText: async () => undefined,
    })
    const unsupported = await copyTextToClipboard('Draft text', undefined)

    expect(success).toEqual({ ok: true, message: 'Copied locally.' })
    expect(unsupported.ok).toBe(false)
    expect(unsupported.message).toContain('Clipboard API')
  })

  it('reports missing OpenAI credentials as a scoped provider state', () => {
    const config = getWritingProviderConfig({})
    const status = createWritingProviderStatus(config)
    const response = createWritingProviderNotConfiguredResponse(config)

    expect(status.data?.configured).toBe(false)
    expect(response.error?.type).toBe('not-configured')
    expect(response.error?.message).toContain('OPENAI_API_KEY')
  })

  it('normalizes Writing provider errors into scoped draft-only messages', () => {
    expect(
      normalizeWritingProviderError(
        { type: 'openai-error', message: 'Provider rejected the request.' },
        'Fallback writing provider error.',
      ),
    ).toEqual({
      type: 'openai-error',
      message: 'Provider rejected the request.',
    })
    expect(
      normalizeWritingProviderError({ type: 'secret-key', message: 123 }, 'Fallback writing provider error.'),
    ).toEqual({
      type: 'unknown',
      message: 'Fallback writing provider error.',
    })
  })

  it('builds provider input with draft-only guardrails', () => {
    const draft = createWritingDraft({
      templateId: 'client-update',
      record,
      dispatch: seedDispatchState,
      github: githubContext,
      now,
    })
    const input = createWritingProviderInput({
      draftId: draft.id,
      title: draft.title,
      templateId: draft.templateId,
      promptPacket: draft.promptPacket,
      contextSnapshot: draft.contextSnapshot,
    })
    const serialized = JSON.stringify(input)

    expect(serialized).toContain('Return draft text only')
    expect(serialized).toContain('must not decide or change status')
    expect(serialized).toContain('Prompt packet')
  })

  it('normalizes OpenAI response text safely', () => {
    expect(normalizeOpenAIResponseText({ output_text: '  Suggested text.  ' })).toBe('Suggested text.')
    expect(
      normalizeOpenAIResponseText({
        output: [{ content: [{ text: 'Nested suggestion.' }] }],
      }),
    ).toBe('Nested suggestion.')
  })

  it('stores provider suggestions without changing draft text until explicitly applied', () => {
    const draft = createWritingDraft({
      templateId: 'client-update',
      record,
      dispatch: seedDispatchState,
      github: githubContext,
      now,
    })
    const suggested = recordWritingProviderSuggestion(
      [draft],
      draft.id,
      {
        status: 'generated',
        providerName: 'openai',
        model: 'gpt-5',
        generatedText: 'Provider-written suggestion.',
        generatedAt: now.toISOString(),
        message: 'Provider suggestion generated.',
      },
      now,
    )

    expect(suggested[0].draftText).toBe(draft.draftText)
    expect(suggested[0].providerResult.generatedText).toBe('Provider-written suggestion.')
    expect(suggested[0].reviewEvents.map((event) => event.type)).toContain('provider-suggestion')

    const applied = applyWritingProviderSuggestion(suggested, draft.id, now)

    expect(applied[0].draftText).toBe('Provider-written suggestion.')
    expect(applied[0].status).toBe('draft')
    expect(applied[0].reviewEvents.map((event) => event.type)).toContain('suggestion-applied')
    expect(record.project.manual.status).toBe('Active')
  })

  it('records provider errors without changing lifecycle state or draft text', () => {
    const draft = createWritingDraft({
      templateId: 'client-update',
      record,
      dispatch: seedDispatchState,
      github: githubContext,
      now,
    })
    const errored = recordWritingProviderSuggestion(
      [draft],
      draft.id,
      {
        status: 'error',
        providerName: 'openai',
        model: 'gpt-5',
        generatedText: null,
        generatedAt: null,
        message: 'Provider failed.',
      },
      now,
    )

    expect(errored[0].draftText).toBe(draft.draftText)
    expect(errored[0].status).toBe('draft')
    expect(errored[0].reviewEvents.map((event) => event.type)).toEqual(['created'])
  })
})
