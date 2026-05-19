import { useEffect, useMemo, useState } from 'react'
import {
  fetchLocalGitStatus,
  type LocalGitRepositoryStatusResponse,
} from '../services/localGit'

interface LocalGitStatusState {
  response: LocalGitRepositoryStatusResponse | null
  loading: boolean
  error: string | null
}

export function useLocalGitStatus(owner: string, repo: string) {
  const [state, setState] = useState<LocalGitStatusState>({
    response: null,
    loading: true,
    error: null,
  })
  const requestKey = useMemo(() => `${owner}/${repo}`, [owner, repo])

  useEffect(() => {
    if (!owner || !repo) {
      return
    }

    const controller = new AbortController()

    void fetchLocalGitStatus(owner, repo, controller.signal)
      .then((response) => {
        setState({ response, loading: false, error: response.error?.message ?? null })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setState({
          response: null,
          loading: false,
          error: error instanceof Error ? error.message : 'Local Git status request failed.',
        })
      })

    return () => controller.abort()
  }, [owner, repo, requestKey])

  return state
}
