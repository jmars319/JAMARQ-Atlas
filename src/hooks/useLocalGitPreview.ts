import { useEffect, useMemo, useState } from 'react'
import {
  fetchLocalGitPreview,
  type LocalGitRepositoryPreviewResponse,
} from '../services/localGit'

interface LocalGitPreviewState {
  response: LocalGitRepositoryPreviewResponse | null
  loading: boolean
  error: string | null
}

export function useLocalGitPreview(owner: string, repo: string) {
  const disabled = !owner || !repo
  const [state, setState] = useState<LocalGitPreviewState>({
    response: null,
    loading: false,
    error: null,
  })
  const requestKey = useMemo(() => `${owner}/${repo}`, [owner, repo])

  useEffect(() => {
    if (disabled) {
      return
    }

    const controller = new AbortController()

    void fetchLocalGitPreview(owner, repo, controller.signal)
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
          error: error instanceof Error ? error.message : 'Local Git preview request failed.',
        })
      })

    return () => controller.abort()
  }, [disabled, owner, repo, requestKey])

  return disabled
    ? { response: null, loading: false, error: null }
    : { ...state, loading: state.loading || (!state.response && !state.error) }
}
