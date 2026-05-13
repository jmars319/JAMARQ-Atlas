import { describe, expect, it } from 'vitest'
import { seedDispatchState } from '../src/data/seedDispatch'
import { seedWorkspace } from '../src/data/seedWorkspace'
import { flattenProjects } from '../src/domain/atlas'
import { addPlanningItem, createPlanningItem, emptyPlanningStore } from '../src/services/planning'
import { emptyReportsStore } from '../src/services/reports'
import {
  addReviewNote,
  addReviewSession,
  createReviewNote,
  createReviewSession,
  emptyReviewStore,
} from '../src/services/review'
import { emptySyncState } from '../src/services/syncSnapshots'
import { deriveTimelineEvents, filterTimelineEvents } from '../src/services/timeline'

const projectRecords = flattenProjects(seedWorkspace)
const planning = addPlanningItem(
  emptyPlanningStore(new Date('2026-05-10T09:00:00Z')),
  createPlanningItem({
    kind: 'objective',
    projectId: 'vaexcore-studio',
    title: 'Timeline planning objective',
    detail: 'Planning evidence for the derived ledger.',
    status: 'active',
    now: new Date('2026-05-10T10:00:00Z'),
  }),
  new Date('2026-05-10T10:00:00Z'),
)
const reports = {
  ...emptyReportsStore(new Date('2026-05-10T09:00:00Z')),
  packets: [
    {
      id: 'report-1',
      type: 'client-update-packet' as const,
      title: 'Timeline report packet',
      status: 'exported' as const,
      projectIds: ['vaexcore-studio'],
      writingDraftIds: [],
      markdown: 'Report',
      sourceSummary: [],
      contextWarnings: [],
      auditEvents: [
        {
          id: 'report-1-exported',
          type: 'markdown-exported' as const,
          occurredAt: '2026-05-10T14:00:00Z',
          detail: 'Report exported locally.',
        },
      ],
      createdAt: '2026-05-10T13:30:00Z',
      updatedAt: '2026-05-10T14:00:00Z',
      exportedAt: '2026-05-10T14:00:00Z',
    },
  ],
}
const writing = {
  drafts: [
    {
      id: 'draft-1',
      projectId: 'vaexcore-studio',
      templateId: 'client-update' as const,
      title: 'Client update - VaexCore Studio',
      status: 'approved' as const,
      reviewEvents: [
        {
          id: 'draft-1-approved',
          type: 'approved' as const,
          occurredAt: '2026-05-10T12:00:00Z',
          detail: 'Draft approved for local export.',
        },
      ],
      draftText: 'Draft',
      promptPacket: 'Prompt',
      contextSnapshot: {
        projectId: 'vaexcore-studio',
        projectName: 'VaexCore Studio',
        sectionName: 'VaexCore',
        groupName: 'Studio',
        capturedAt: '2026-05-10T11:00:00Z',
        manual: {
          status: 'Active' as const,
          nextAction: '',
          lastMeaningfulChange: '',
          lastVerified: '2026-05-10',
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
          lastVerified: '2026-05-10',
          dueDate: '2026-06-09',
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
      createdAt: '2026-05-10T11:00:00Z',
      updatedAt: '2026-05-10T12:00:00Z',
    },
  ],
}
const review = addReviewNote(
  addReviewSession(
    emptyReviewStore(new Date('2026-05-10T09:00:00Z')),
    createReviewSession({
      id: 'review-session-1',
      title: 'Timeline review session',
      itemIds: ['review-item-1'],
      projectIds: ['vaexcore-studio'],
      now: new Date('2026-05-10T15:00:00Z'),
    }),
  ),
  createReviewNote({
    id: 'review-note-1',
    projectId: 'vaexcore-studio',
    itemId: 'review-item-1',
    source: 'workspace',
    outcome: 'needs-follow-up',
    body: 'Review note for timeline evidence.',
    now: new Date('2026-05-10T15:05:00Z'),
  }),
)

describe('timeline evidence ledger', () => {
  it('derives sorted evidence across workspace, Dispatch, Writing, and Sync stores', () => {
    const sync = {
      ...emptySyncState(new Date('2026-05-10T09:00:00Z')),
      snapshots: [
        {
          id: 'sync-1',
          label: 'Checkpoint',
          note: '',
          createdAt: '2026-05-10T13:00:00Z',
          deviceId: 'device',
          deviceLabel: 'Device',
          fingerprint: 'fnv1a-test',
          summary: {
            workspace: {
              sections: 1,
              groups: 1,
              projects: 1,
              repositoryBindings: 0,
              activityEvents: 0,
            },
            dispatch: {
              targets: 0,
              records: 0,
              readinessEntries: 0,
              preflightRuns: 0,
            },
            writing: {
              drafts: 0,
              reviewEvents: 0,
              approvedDrafts: 0,
              exportedDrafts: 0,
              archivedDrafts: 0,
            },
            planning: {
              objectives: 0,
              milestones: 0,
              workSessions: 0,
              notes: 0,
              active: 0,
              planned: 0,
              waiting: 0,
            },
            reports: {
              packets: 0,
              auditEvents: 0,
              exportedPackets: 0,
              archivedPackets: 0,
            },
            review: {
              sessions: 0,
              notes: 0,
              followUps: 0,
              planned: 0,
            },
          },
          stores: {
            workspace: seedWorkspace,
            dispatch: seedDispatchState,
            writing: { drafts: [] },
            planning,
            reports,
            review,
          },
        },
      ],
    }
    const events = deriveTimelineEvents({
      projectRecords,
      dispatch: seedDispatchState,
      writing,
      planning,
      reports,
      review,
      sync,
    })

    expect(events[0].source).toBe('review')
    expect(events.some((event) => event.source === 'dispatch')).toBe(true)
    expect(events.some((event) => event.source === 'writing')).toBe(true)
    expect(events.some((event) => event.source === 'planning')).toBe(true)
    expect(events.some((event) => event.source === 'reports')).toBe(true)
    expect(events.some((event) => event.source === 'review')).toBe(true)
    expect(events.some((event) => event.projectId === 'vaexcore-studio')).toBe(true)
  })

  it('filters evidence by project, source, type, date range, and query', () => {
    const events = deriveTimelineEvents({
      projectRecords,
      dispatch: seedDispatchState,
      writing,
      planning,
      reports,
      review,
      sync: emptySyncState(new Date('2026-05-10T09:00:00Z')),
    })

    expect(
      filterTimelineEvents(events, {
        projectId: 'vaexcore-studio',
        sectionId: 'all',
        source: 'writing',
        type: 'writing',
        dateRange: '30d',
        query: 'approved',
      }, new Date('2026-05-11T12:00:00Z')),
    ).toHaveLength(1)

    expect(
      filterTimelineEvents(events, {
        projectId: 'all',
        sectionId: 'client-systems',
        source: 'dispatch',
        type: 'deployment',
        dateRange: '90d',
        query: 'baseline',
      }, new Date('2026-05-11T12:00:00Z')).length,
    ).toBeGreaterThan(0)

    expect(
      filterTimelineEvents(events, {
        projectId: 'vaexcore-studio',
        sectionId: 'all',
        source: 'planning',
        type: 'planning',
        dateRange: '30d',
        query: 'objective',
      }, new Date('2026-05-11T12:00:00Z')),
    ).toHaveLength(1)

    expect(
      filterTimelineEvents(events, {
        projectId: 'vaexcore-studio',
        sectionId: 'all',
        source: 'reports',
        type: 'report',
        dateRange: '30d',
        query: 'exported',
      }, new Date('2026-05-11T12:00:00Z')),
    ).toHaveLength(1)

    expect(
      filterTimelineEvents(events, {
        projectId: 'vaexcore-studio',
        sectionId: 'all',
        source: 'review',
        type: 'review',
        dateRange: '30d',
        query: 'follow-up',
      }, new Date('2026-05-11T12:00:00Z')),
    ).toHaveLength(1)
  })
})
