import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchVercelCommandSummaries,
  type VercelApiError,
  type VercelDeploymentCommandSummary,
  type VercelPermissionState,
} from '../services/vercelIntegration'

interface VercelCommandSummaryState {
  data: VercelDeploymentCommandSummary[]
  loading: boolean
  error: VercelApiError | null
  permission: VercelPermissionState
  fetchedAt: string | null
}

function normalizeTargetIds(targetIds: string[]) {
  return targetIds
    .map((targetId) => targetId.trim())
    .filter(Boolean)
    .filter(
      (targetId, index, ids) =>
        ids.findIndex((candidate) => candidate.toLowerCase() === targetId.toLowerCase()) === index,
    )
}

export function useVercelCommandSummaries(targetIds: string[]) {
  const targetIdInputKey = targetIds.join('\u0000')
  const normalizedTargetIds = useMemo(
    () => normalizeTargetIds(targetIdInputKey.split('\u0000')),
    [targetIdInputKey],
  )
  const requestKey = useMemo(() => normalizedTargetIds.join(','), [normalizedTargetIds])
  const [state, setState] = useState<VercelCommandSummaryState>({
    data: [],
    loading: false,
    error: null,
    permission: 'unknown',
    fetchedAt: null,
  })

  const load = useCallback(
    async (signal?: AbortSignal, cache: 'default' | 'reload' = 'default') => {
      if (normalizedTargetIds.length === 0) {
        setState({
          data: [],
          loading: false,
          error: null,
          permission: 'available',
          fetchedAt: null,
        })
        return
      }

      setState((current) => ({ ...current, loading: true }))

      try {
        const result = await fetchVercelCommandSummaries(normalizedTargetIds, signal, cache)

        setState({
          data: result.data ?? [],
          loading: false,
          error: result.error,
          permission: result.permission,
          fetchedAt: result.fetchedAt,
        })
      } catch (error) {
        if (signal?.aborted) {
          return
        }

        setState((current) => ({
          ...current,
          loading: false,
          error: {
            type: 'vercel-unavailable',
            status: 503,
            resource: 'command-summaries',
            message: error instanceof Error ? error.message : 'Unable to load Vercel summaries.',
          },
          permission: 'unknown',
        }))
      }
    },
    [normalizedTargetIds],
  )

  useEffect(() => {
    const controller = new AbortController()

    void load(controller.signal)

    return () => controller.abort()
  }, [load, requestKey])

  return {
    ...state,
    targetIds: normalizedTargetIds,
    reload: () => load(undefined, 'reload'),
  }
}
