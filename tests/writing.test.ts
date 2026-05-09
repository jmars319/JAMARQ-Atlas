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
  markWritingDraftExported,
  markWritingDraftReviewed,
  normalizeWritingState,
  recordWritingDraftCopied,
  updateWritingDraftText,
  writingGuardrails,
} from '../src/services/aiWritingAssistant'

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
})
