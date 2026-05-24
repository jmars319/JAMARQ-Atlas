import type { AtlasOptimizationState, OptimizationSnapshot } from '../domain/optimization'
import {
  addOptimizationSnapshot,
  emptyOptimizationState,
  normalizeOptimizationState,
} from '../services/optimization'
import { useLocalStoreState } from './useLocalStore'

export function useLocalOptimization() {
  const {
    state: optimization,
    setState: setOptimization,
    resetState: resetOptimization,
  } = useLocalStoreState<AtlasOptimizationState>({
    storeId: 'optimization',
    fallback: emptyOptimizationState,
    normalize: normalizeOptimizationState,
  })

  function importSnapshot(snapshot: OptimizationSnapshot) {
    setOptimization((current) => addOptimizationSnapshot(current, snapshot))
  }

  return {
    optimization,
    setOptimization,
    importSnapshot,
    resetOptimization,
  }
}
