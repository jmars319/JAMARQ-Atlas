import { useEffect, useState } from 'react'
import type { ProjectRecord } from '../domain/atlas'
import type { PlanningItemKind, PlanningState, PlanningStatus } from '../domain/planning'
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

const STORAGE_KEY = 'jamarq-atlas.planning.v1'

function readPlanning(): PlanningState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)

    if (!stored) {
      return emptyPlanningStore()
    }

    return normalizePlanningState(JSON.parse(stored))
  } catch {
    return emptyPlanningStore()
  }
}

export function useLocalPlanning() {
  const [planning, setPlanning] = useState<PlanningState>(() => readPlanning())

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(planning))
  }, [planning])

  function createItem({
    kind,
    record,
    title,
    detail,
    date,
    status = 'planned',
  }: {
    kind: PlanningItemKind
    record: ProjectRecord
    title: string
    detail: string
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

  function resetPlanning() {
    const freshPlanning = emptyPlanningStore()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(freshPlanning))
    setPlanning(freshPlanning)
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
