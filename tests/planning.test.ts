import { describe, expect, it } from 'vitest'
import { seedWorkspace } from '../src/data/seedWorkspace'
import { flattenProjects } from '../src/domain/atlas'
import {
  addPlanningItem,
  createPlanningItem,
  deletePlanningItem,
  emptyPlanningStore,
  getPlanningForProject,
  normalizePlanningState,
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

    expect(planning.schemaVersion).toBe(1)
    expect(planning.objectives).toEqual([])
    expect(planning.milestones).toEqual([])
    expect(planning.workSessions).toEqual([])
    expect(planning.notes).toEqual([])
    expect(planning.updatedAt).toBe(now.toISOString())
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
