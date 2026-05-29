import { describe, expect, it } from 'vitest'
import { seedWorkspace } from '../src/data/seedWorkspace'
import { flattenProjects } from '../src/domain/atlas'
import {
  addPlanningItem,
  completePlanningWorkSession,
  createPlanningItem,
  deletePlanningItem,
  emptyPlanningStore,
  getPlanningForProject,
  hasPromotedPlanningNote,
  normalizePlanningState,
  promotePlanningNote,
  setPlanningExecutionStatus,
  startPlanningWorkSession,
  summarizePlanningState,
  updatePlanningItem,
} from '../src/services/planning'

const now = new Date('2026-05-10T12:00:00Z')
const projectRecords = flattenProjects(seedWorkspace)
const vaexcoreStudio = projectRecords.find((record) => record.project.id === 'vaexcore-studio')

if (!vaexcoreStudio) {
  throw new Error('Expected VaexCore Studio seed project.')
}

describe('planning center', () => {
  it('normalizes missing planning storage into an empty local store', () => {
    const planning = normalizePlanningState(null, now)

    expect(planning.schemaVersion).toBe(2)
    expect(planning.objectives).toEqual([])
    expect(planning.milestones).toEqual([])
    expect(planning.workSessions).toEqual([])
    expect(planning.notes).toEqual([])
    expect(planning.updatedAt).toBe(now.toISOString())
  })

  it('stores source links on planning records without mutating workspace status', () => {
    const item = createPlanningItem({
      id: 'planning-note-source-link',
      kind: 'note',
      projectId: vaexcoreStudio.project.id,
      title: 'Review-linked note',
      detail: 'Planning note linked back to a Review note.',
      sourceLinks: [
        {
          type: 'review-note',
          id: 'review-note-source',
          label: 'Review note source',
        },
      ],
      now,
    })
    const planning = addPlanningItem(emptyPlanningStore(now), item, now)
    const note = getPlanningForProject(planning, vaexcoreStudio.project.id).notes[0]

    expect(note.sourceLinks).toEqual([
      {
        type: 'review-note',
        id: 'review-note-source',
        label: 'Review note source',
      },
    ])
    expect(vaexcoreStudio.project.manual.status).toBe('Active')
  })

  it('promotes Planning notes into objective and work-session records once', () => {
    const note = createPlanningItem({
      id: 'planning-note-promote',
      kind: 'note',
      projectId: vaexcoreStudio.project.id,
      sectionId: vaexcoreStudio.section.id,
      groupId: vaexcoreStudio.group.id,
      title: 'Boundary: Studio marker rehearsal',
      detail: 'Turn the boundary note into active work.',
      sourceLinks: [
        {
          type: 'optimization-recommendation',
          id: 'boundary-rec-1',
          label: 'Boundary audit: Studio marker rehearsal',
        },
      ],
      now,
    })
    const withNote = addPlanningItem(emptyPlanningStore(now), note, now)
    const withObjective = promotePlanningNote(withNote, note.id, 'objective', now)
    const promotedTwice = promotePlanningNote(withObjective, note.id, 'objective', now)
    const withWorkSession = promotePlanningNote(promotedTwice, note.id, 'work-session', now)

    expect(withWorkSession.objectives).toHaveLength(1)
    expect(withWorkSession.objectives[0]).toMatchObject({
      projectId: vaexcoreStudio.project.id,
      sectionId: vaexcoreStudio.section.id,
      groupId: vaexcoreStudio.group.id,
      title: 'Objective: Boundary: Studio marker rehearsal',
      status: 'active',
    })
    expect(withWorkSession.objectives[0].sourceLinks).toEqual([
      {
        type: 'optimization-recommendation',
        id: 'boundary-rec-1',
        label: 'Boundary audit: Studio marker rehearsal',
      },
      {
        type: 'planning-note',
        id: 'planning-note-promote',
        label: 'Boundary: Studio marker rehearsal',
      },
    ])
    expect(withWorkSession.workSessions).toHaveLength(1)
    expect(hasPromotedPlanningNote(withWorkSession, note.id, 'objective')).toBe(true)
    expect(hasPromotedPlanningNote(withWorkSession, note.id, 'work-session')).toBe(true)
  })

  it('normalizes older records while preserving manual fields', () => {
    const planning = normalizePlanningState(
      {
        objectives: [
          {
            id: 'objective-1',
            projectId: 'vaexcore-studio',
            title: 'Stabilize Studio workflows',
            detail: 'Keep client impact low.',
            status: 'active',
            targetDate: '2026-05-20',
            createdAt: '2026-05-09T12:00:00Z',
            updatedAt: '2026-05-09T12:00:00Z',
          },
        ],
      },
      now,
    )

    expect(planning.objectives[0]).toMatchObject({
      id: 'objective-1',
      projectId: 'vaexcore-studio',
      title: 'Stabilize Studio workflows',
      status: 'active',
      targetDate: '2026-05-20',
      outcome: '',
    })
  })

  it('adds, updates, filters, and deletes project planning items', () => {
    const initial = emptyPlanningStore(now)
    const objective = createPlanningItem({
      id: 'planning-objective-1',
      kind: 'objective',
      projectId: vaexcoreStudio.project.id,
      sectionId: vaexcoreStudio.section.id,
      groupId: vaexcoreStudio.group.id,
      title: 'Finish operator loop',
      detail: 'Manual planning record only.',
      date: '2026-05-22',
      status: 'planned',
      now,
    })
    const withObjective = addPlanningItem(initial, objective, now)
    const updated = updatePlanningItem(
      withObjective,
      'objective',
      'planning-objective-1',
      { status: 'active', detail: 'Updated by human.' },
      new Date('2026-05-10T13:00:00Z'),
    )

    expect(getPlanningForProject(updated, 'vaexcore-studio').objectives).toHaveLength(1)
    expect(getPlanningForProject(updated, 'vaexcore-studio').objectives[0].status).toBe('active')
    expect(summarizePlanningState(updated).active).toBe(1)

    const deleted = deletePlanningItem(updated, 'objective', 'planning-objective-1', now)

    expect(getPlanningForProject(deleted, 'vaexcore-studio').objectives).toHaveLength(0)
  })

  it('tracks Planning-only execution transitions for work sessions', () => {
    const session = createPlanningItem({
      id: 'planning-work-session-1',
      kind: 'work-session',
      projectId: vaexcoreStudio.project.id,
      title: 'Run pushed workspace pass',
      detail: 'Execution record only.',
      status: 'planned',
      now,
    })
    const initial = addPlanningItem(emptyPlanningStore(now), session, now)
    const started = startPlanningWorkSession(
      initial,
      session.id,
      new Date('2026-05-29T13:00:00Z'),
    )
    const completed = completePlanningWorkSession(
      started,
      session.id,
      new Date('2026-05-29T16:30:00Z'),
    )

    expect(started.workSessions[0]).toMatchObject({
      status: 'active',
      scheduledFor: '2026-05-29',
      completedAt: '',
    })
    expect(completed.workSessions[0]).toMatchObject({
      status: 'done',
      completedAt: '2026-05-29',
    })
    expect(vaexcoreStudio.project.manual.status).toBe('Active')
  })

  it('sets active, waiting, done, and deferred execution statuses without changing workspace records', () => {
    const objective = createPlanningItem({
      id: 'planning-objective-execution-1',
      kind: 'objective',
      projectId: vaexcoreStudio.project.id,
      title: 'Atlas execution panel',
      detail: 'Planning-only execution.',
      status: 'planned',
      now,
    })
    const initial = addPlanningItem(emptyPlanningStore(now), objective, now)
    const waiting = setPlanningExecutionStatus(
      initial,
      'objective',
      objective.id,
      'waiting',
      new Date('2026-05-29T14:00:00Z'),
    )
    const deferred = setPlanningExecutionStatus(
      waiting,
      'objective',
      objective.id,
      'deferred',
      new Date('2026-05-29T15:00:00Z'),
    )

    expect(waiting.objectives[0].status).toBe('waiting')
    expect(deferred.objectives[0].status).toBe('deferred')
    expect(JSON.stringify(seedWorkspace)).toContain('"vaexcore-studio"')
  })

  it('does not mutate workspace source-of-truth fields when planning changes', () => {
    const before = JSON.stringify(seedWorkspace)
    const item = createPlanningItem({
      id: 'planning-note-1',
      kind: 'note',
      projectId: vaexcoreStudio.project.id,
      title: 'Human note',
      detail: 'Planning records stay separate from Atlas project status.',
      now,
    })

    addPlanningItem(emptyPlanningStore(now), item, now)

    expect(JSON.stringify(seedWorkspace)).toBe(before)
    expect(vaexcoreStudio.project.manual.status).toBe('Active')
  })
})
