import { describe, expect, it } from 'vitest'
import { seedDispatchState } from '../src/data/seedDispatch'
import { seedWorkspace } from '../src/data/seedWorkspace'
import { flattenProjects } from '../src/domain/atlas'
import type { GithubRepositorySummary } from '../src/services/githubIntegration'
import { emptyPlanningStore } from '../src/services/planning'
import { deriveRepoPlacementSuggestions } from '../src/services/repoSuggestions'
import { emptyReportsStore } from '../src/services/reports'
import {
  addReviewNote,
  addReviewSession,
  createReviewNote,
  createReviewSavedFilter,
  createReviewSession,
  createReviewSessionFromPreset,
  deleteReviewFilter,
  deriveReviewQueue,
  emptyReviewStore,
  saveReviewFilter,
  normalizeReviewState,
  summarizeReviewQueue,
} from '../src/services/review'
import { emptySyncState } from '../src/services/syncSnapshots'

const now = new Date('2026-05-13T12:00:00Z')
const projectRecords = flattenProjects(seedWorkspace)
const writing = {
  drafts: [
    {
      id: 'review-draft-1',
      projectId: 'midway-music-hall-site',
      templateId: 'client-update' as const,
      title: 'MMH client update',
      status: 'draft' as const,
      reviewEvents: [],
      draftText: 'Draft text',
      promptPacket: 'Prompt',
      contextSnapshot: {
        projectId: 'midway-music-hall-site',
        projectName: 'Midway Music Hall website',
        sectionName: 'Client Systems',
        groupName: 'Midway Music Hall',
        capturedAt: now.toISOString(),
        manual: {
          status: 'Active' as const,
          nextAction: '',
          lastMeaningfulChange: '',
          lastVerified: '2026-05-08',
          currentRisk: '',
          blockers: [],
          deferredItems: [],
          notDoingItems: [],
          notes: [],
          decisions: [],
        },
        activity: [],
        verification: {
          cadence: 'monthly',
          dueState: 'recent',
          lastVerified: '2026-05-08',
          dueDate: '2026-06-07',
        },
        dispatch: [],
        github: {
          repository: null,
          overview: null,
          latestCommits: [],
          warnings: [],
        },
        warnings: [],
      },
      providerResult: {
        status: 'stub' as const,
        providerName: 'local-stub',
        model: '',
        message: '',
        generatedText: null,
        generatedAt: null,
      },
      notes: '',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ],
}

const unboundRepository: GithubRepositorySummary = {
  id: 99,
  name: 'midway-music-hall-admin',
  fullName: 'jmars319/midway-music-hall-admin',
  private: true,
  description: 'Admin repo for Midway Music Hall.',
  htmlUrl: 'https://github.com/jmars319/midway-music-hall-admin',
  defaultBranch: 'main',
  visibility: 'private',
  language: 'TypeScript',
  updatedAt: now.toISOString(),
  pushedAt: now.toISOString(),
  openIssuesCount: 0,
  stargazersCount: 0,
  forksCount: 0,
  archived: false,
  disabled: false,
}

describe('operator review center', () => {
  it('normalizes missing Review storage into a safe empty store', () => {
    const review = normalizeReviewState(null, now)

    expect(review.schemaVersion).toBe(2)
    expect(review.sessions).toEqual([])
    expect(review.notes).toEqual([])
    expect(review.savedFilters).toEqual([])
  })

  it('derives review queue items from existing advisory stores without mutating them', () => {
    const before = JSON.stringify({ workspace: seedWorkspace, dispatch: seedDispatchState })
    const repoSuggestions = deriveRepoPlacementSuggestions(projectRecords, [unboundRepository])
    const queue = deriveReviewQueue({
      projectRecords,
      dispatch: seedDispatchState,
      planning: emptyPlanningStore(now),
      reports: emptyReportsStore(now),
      writing,
      sync: emptySyncState(now),
      timelineEvents: [],
      repoSuggestions,
      now,
    })
    const summary = summarizeReviewQueue(queue)

    expect(queue.some((item) => item.source === 'verification')).toBe(true)
    expect(queue.some((item) => item.source === 'dispatch')).toBe(true)
    expect(queue.some((item) => item.source === 'workspace')).toBe(true)
    expect(queue.some((item) => item.source === 'github')).toBe(true)
    expect(queue.some((item) => item.source === 'writing')).toBe(true)
    expect(queue.some((item) => item.source === 'data-sync')).toBe(true)
    expect(summary.unboundRepos).toBe(1)
    expect(summary.deployFollowUp).toBeGreaterThan(0)
    expect(JSON.stringify({ workspace: seedWorkspace, dispatch: seedDispatchState })).toBe(before)
  })

  it('adds sessions and notes only to Review state', () => {
    const initial = emptyReviewStore(now)
    const session = createReviewSession({
      id: 'review-session-test',
      title: 'Manual review',
      itemIds: ['workspace-blocked-midway-music-hall-site'],
      projectIds: ['midway-music-hall-site'],
      now,
    })
    const note = createReviewNote({
      id: 'review-note-test',
      sessionId: session.id,
      itemId: 'workspace-blocked-midway-music-hall-site',
      projectId: 'midway-music-hall-site',
      source: 'workspace',
      outcome: 'needs-follow-up',
      body: 'Need source-of-truth follow-up.',
      now,
    })
    const updated = addReviewNote(addReviewSession(initial, session), note)

    expect(updated.sessions).toHaveLength(1)
    expect(updated.notes).toHaveLength(1)
    expect(updated.notes[0].outcome).toBe('needs-follow-up')
    expect(seedWorkspace.sections[0].groups[0].projects[0].manual.status).toBe('Active')
  })

  it('saves filters and creates preset sessions without mutating source stores', () => {
    const repoSuggestions = deriveRepoPlacementSuggestions(projectRecords, [unboundRepository])
    const queue = deriveReviewQueue({
      projectRecords,
      dispatch: seedDispatchState,
      planning: emptyPlanningStore(now),
      reports: emptyReportsStore(now),
      writing,
      sync: emptySyncState(now),
      timelineEvents: [],
      repoSuggestions,
      now,
    })
    const filter = createReviewSavedFilter({
      id: 'review-filter-dispatch',
      label: 'Dispatch only',
      sourceFilter: 'dispatch',
      severityFilter: 'high',
      dueFilter: 'blocked',
      now,
    })
    const saved = saveReviewFilter(emptyReviewStore(now), filter)
    const deleted = deleteReviewFilter(saved, filter.id, now)
    const deploySession = createReviewSessionFromPreset({
      presetId: 'deploy-follow-up',
      queue,
      now,
    })
    const githubSession = createReviewSessionFromPreset({
      presetId: 'github-intake-review',
      queue,
      now,
    })

    expect(saved.savedFilters[0]).toMatchObject({ label: 'Dispatch only' })
    expect(deleted.savedFilters).toEqual([])
    expect(deploySession?.scope).toBe('dispatch')
    expect(deploySession?.itemIds.every((id) => id.startsWith('dispatch-'))).toBe(true)
    expect(githubSession?.scope).toBe('github')
    expect(githubSession?.itemIds.every((id) => id.startsWith('github-'))).toBe(true)
    expect(seedWorkspace.sections[0].groups[0].projects[0].manual.status).toBe('Active')
  })
})
