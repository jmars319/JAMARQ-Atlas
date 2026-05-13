import type { ProjectRecord } from '../domain/atlas'
import type {
  PlanningItemKind,
  PlanningSourceLink,
  PlanningState,
  PlanningStatus,
} from '../domain/planning'
import {
  addPlanningItem,
  annotatePlanningItemFromRecord,
  createPlanningItem,
  deletePlanningItem,
  emptyPlanningStore,
  normalizePlanningState,
  type PlanningItemUpdate,
  updatePlanningItem,
} from '../services/planning'
import { useLocalStoreState } from './useLocalStore'

export function useLocalPlanning() {
  const {
    state: planning,
    setState: setPlanning,
    resetState: resetPlanning,
  } = useLocalStoreState<PlanningState>({
    storeId: 'planning',
    fallback: emptyPlanningStore,
    normalize: normalizePlanningState,
  })

  function createItem({
    kind,
    record,
    title,
    detail,
    sourceLinks,
    date,
    status = 'planned',
  }: {
    kind: PlanningItemKind
    record: ProjectRecord
    title: string
    detail: string
    sourceLinks?: PlanningSourceLink[]
    date?: string
    status?: PlanningStatus
  }) {
    const item = annotatePlanningItemFromRecord(
      createPlanningItem({
        kind,
        projectId: record.project.id,
        sectionId: record.section.id,
        groupId: record.group.id,
        title,
        detail,
        sourceLinks,
        date,
        status,
      }),
      record,
    )

    setPlanning((current) => addPlanningItem(current, item))
  }

  function updateItem(kind: PlanningItemKind, itemId: string, update: PlanningItemUpdate) {
    setPlanning((current) => updatePlanningItem(current, kind, itemId, update))
  }

  function deleteItem(kind: PlanningItemKind, itemId: string) {
    setPlanning((current) => deletePlanningItem(current, kind, itemId))
  }

  return {
    planning,
    setPlanning,
    createItem,
    updateItem,
    deleteItem,
    resetPlanning,
  }
}
