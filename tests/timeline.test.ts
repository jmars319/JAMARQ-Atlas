import { describe, expect, it } from 'vitest'
import { seedDispatchState } from '../src/data/seedDispatch'
import { seedWorkspace } from '../src/data/seedWorkspace'
import { flattenProjects } from '../src/domain/atlas'
import { emptySyncState } from '../src/services/syncSnapshots'
import { deriveTimelineEvents, filterTimelineEvents } from '../src/services/timeline'

const projectRecords = flattenProjects(seedWorkspace)
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
          },
          stores: {
            workspace: seedWorkspace,
            dispatch: seedDispatchState,
            writing: { drafts: [] },
          },
        },
      ],
    }
    const events = deriveTimelineEvents({
      projectRecords,
      dispatch: seedDispatchState,
      writing,
      sync,
    })

    expect(events[0].source).toBe('sync')
    expect(events.some((event) => event.source === 'dispatch')).toBe(true)
    expect(events.some((event) => event.source === 'writing')).toBe(true)
    expect(events.some((event) => event.projectId === 'vaexcore-studio')).toBe(true)
  })

  it('filters evidence by project, source, type, date range, and query', () => {
    const events = deriveTimelineEvents({
      projectRecords,
      dispatch: seedDispatchState,
      writing,
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
  })
})
