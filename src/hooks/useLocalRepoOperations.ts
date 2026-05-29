import type { RepoOperationsFilters, RepoOperationsSnapshot } from '../domain/repoOperations'
import {
  addRepoOperationsSnapshot,
  emptyRepoOperationsStore,
  normalizeRepoOperationsState,
  updateRepoOperationsFilters,
} from '../services/repoOperations'
import { useLocalStoreState } from './useLocalStore'

export function useLocalRepoOperations() {
  const {
    state: repoOperations,
    setState: setRepoOperations,
    resetState: resetRepoOperations,
  } = useLocalStoreState({
    storeId: 'repo-ops',
    fallback: emptyRepoOperationsStore,
    normalize: normalizeRepoOperationsState,
  })

  function importSnapshot(snapshot: RepoOperationsSnapshot) {
    setRepoOperations((current) => addRepoOperationsSnapshot(current, snapshot))
  }

  function updateFilters(filters: Partial<RepoOperationsFilters>) {
    setRepoOperations((current) => updateRepoOperationsFilters(current, filters))
  }

  function recordPlanningLink(input: {
    repositoryId: string
    projectId: string
    planningItemId: string
    kind: 'note' | 'work-session'
  }) {
    setRepoOperations((current) => ({
      ...current,
      planningLinks: [
        {
          ...input,
          createdAt: new Date().toISOString(),
        },
        ...current.planningLinks.filter(
          (link) =>
            !(
              link.repositoryId === input.repositoryId &&
              link.projectId === input.projectId &&
              link.kind === input.kind
            ),
        ),
      ],
      updatedAt: new Date().toISOString(),
    }))
  }

  return {
    repoOperations,
    setRepoOperations,
    importSnapshot,
    updateFilters,
    recordPlanningLink,
    resetRepoOperations,
  }
}
