import type { RepoWorkflowRun } from '../domain/repoWorkflowRuns'
import {
  addRepoWorkflowRun,
  emptyRepoWorkflowRunsStore,
  normalizeRepoWorkflowRunsState,
} from '../services/repoWorkflowRuns'
import { useLocalStoreState } from './useLocalStore'

export function useLocalRepoWorkflowRuns() {
  const {
    state: repoWorkflowRuns,
    setState: setRepoWorkflowRuns,
    resetState: resetRepoWorkflowRuns,
  } = useLocalStoreState({
    storeId: 'repo-workflow-runs',
    fallback: emptyRepoWorkflowRunsStore,
    normalize: normalizeRepoWorkflowRunsState,
  })

  function recordWorkflowRun(run: RepoWorkflowRun) {
    setRepoWorkflowRuns((current) => addRepoWorkflowRun(current, run))
  }

  return {
    repoWorkflowRuns,
    setRepoWorkflowRuns,
    recordWorkflowRun,
    resetRepoWorkflowRuns,
  }
}
