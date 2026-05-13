import { seedWorkspace } from '../data/seedWorkspace'
import type { Workspace } from '../domain/atlas'
import { normalizeWorkspaceVerificationCadence } from '../services/verification'
import { useLocalStoreState } from './useLocalStore'

function cloneSeedWorkspace(): Workspace {
  return normalizeWorkspaceVerificationCadence(
    JSON.parse(JSON.stringify(seedWorkspace)) as Workspace,
  )
}

function normalizeWorkspaceStore(value: unknown): Workspace {
  return normalizeWorkspaceVerificationCadence(value as Workspace)
}

export function useLocalWorkspace() {
  const {
    state: workspace,
    setState: setWorkspace,
    resetState: resetWorkspace,
  } = useLocalStoreState({
    storeId: 'workspace',
    fallback: cloneSeedWorkspace,
    normalize: normalizeWorkspaceStore,
  })

  return {
    workspace,
    setWorkspace,
    resetWorkspace,
  }
}
