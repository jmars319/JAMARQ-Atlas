import { useEffect, useState } from 'react'
import { seedWorkspace } from '../data/seedWorkspace'
import type { Workspace } from '../domain/atlas'
import { normalizeWorkspaceVerificationCadence } from '../services/verification'

const STORAGE_KEY = 'jamarq-atlas.workspace.v1'

function cloneSeedWorkspace(): Workspace {
  return normalizeWorkspaceVerificationCadence(
    JSON.parse(JSON.stringify(seedWorkspace)) as Workspace,
  )
}

function readWorkspace(): Workspace {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)

    if (!stored) {
      return cloneSeedWorkspace()
    }

    return normalizeWorkspaceVerificationCadence(JSON.parse(stored) as Workspace)
  } catch {
    return cloneSeedWorkspace()
  }
}

export function useLocalWorkspace() {
  const [workspace, setWorkspace] = useState<Workspace>(() => readWorkspace())

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace))
  }, [workspace])

  function resetWorkspace() {
    const freshWorkspace = cloneSeedWorkspace()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(freshWorkspace))
    setWorkspace(freshWorkspace)
  }

  return {
    workspace,
    setWorkspace,
    resetWorkspace,
  }
}
