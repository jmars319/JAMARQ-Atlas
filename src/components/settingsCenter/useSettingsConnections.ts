import { useEffect, useMemo, useState } from 'react'
import type { AtlasSyncProviderState } from '../../domain/sync'
import {
  fetchHostedSyncStatus,
  type HostedSyncStatus,
} from '../../services/hostedSync'
import {
  fetchHostConnectionStatus,
  type HostConnectionStatusResponse,
} from '../../services/hostConnection'
import { atlasApiUrl } from '../../services/apiBase'
import { clearGithubRequestCache } from '../../services/githubIntegration'
import { fetchVercelStatus, type VercelConnectionState } from '../../services/vercelIntegration'
import { buildStaticConnectionCards } from '../../services/settings'
import {
  fetchWritingProviderStatus,
  type WritingProviderStatusResponse,
} from '../../services/writingProvider'
import {
  buildGithubCard,
  buildHostConnectionCard,
  buildHostedSyncCard,
  buildVercelCard,
  buildWritingProviderCard,
  type GithubStatusResponse,
} from '../SettingsCenterParts.helpers'

async function requestGithubStatus(signal?: AbortSignal) {
  const response = await fetch(atlasApiUrl('/api/github/status'), { signal })

  if (!response.ok) {
    throw new Error(`GitHub status returned ${response.status}.`)
  }

  return (await response.json()) as GithubStatusResponse
}

export function useSettingsConnections({
  onSyncProviderChange,
  syncProvider,
}: {
  onSyncProviderChange: (update: Partial<AtlasSyncProviderState>) => void
  syncProvider: AtlasSyncProviderState
}) {
  const [githubStatus, setGithubStatus] = useState<GithubStatusResponse | null>(null)
  const [githubError, setGithubError] = useState<string | null>(null)
  const [loadingGithub, setLoadingGithub] = useState(false)
  const [hostedSyncStatus, setHostedSyncStatus] = useState<HostedSyncStatus | null>(null)
  const [hostedSyncError, setHostedSyncError] = useState<string | null>(null)
  const [loadingHostedSync, setLoadingHostedSync] = useState(false)
  const [writingProviderStatus, setWritingProviderStatus] =
    useState<WritingProviderStatusResponse | null>(null)
  const [writingProviderError, setWritingProviderError] = useState<string | null>(null)
  const [loadingWritingProvider, setLoadingWritingProvider] = useState(false)
  const [hostConnectionStatus, setHostConnectionStatus] =
    useState<HostConnectionStatusResponse | null>(null)
  const [hostConnectionError, setHostConnectionError] = useState<string | null>(null)
  const [loadingHostConnection, setLoadingHostConnection] = useState(false)
  const [vercelStatus, setVercelStatus] = useState<VercelConnectionState | null>(null)
  const [vercelError, setVercelError] = useState<string | null>(null)
  const [loadingVercel, setLoadingVercel] = useState(false)

  async function loadGithubStatus() {
    setLoadingGithub(true)
    setGithubError(null)

    try {
      setGithubStatus(await requestGithubStatus())
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : 'GitHub status request failed.')
      setGithubStatus(null)
    } finally {
      setLoadingGithub(false)
    }
  }

  function handleGithubLogin() {
    if (window.atlasDesktop) {
      void window.atlasDesktop.github.login()
      return
    }

    window.location.assign('/api/github/auth/login')
  }

  async function handleGithubLogout() {
    setLoadingGithub(true)
    setGithubError(null)

    try {
      const response = await fetch(atlasApiUrl('/api/github/auth/logout'), { method: 'POST' })

      if (!response.ok) {
        throw new Error(`GitHub logout returned ${response.status}.`)
      }

      clearGithubRequestCache()
      setGithubStatus(await requestGithubStatus())
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : 'GitHub logout failed.')
    } finally {
      setLoadingGithub(false)
    }
  }

  async function loadHostedSyncStatus() {
    setLoadingHostedSync(true)
    setHostedSyncError(null)

    try {
      const result = await fetchHostedSyncStatus()

      if (result.ok && result.data) {
        setHostedSyncStatus(result.data)
        onSyncProviderChange({
          id: 'supabase',
          status: result.data.configured ? 'configured' : 'not-configured',
          workspaceId: result.data.workspaceId,
          message: result.data.message,
        })
      } else {
        const message = result.error?.message || 'Hosted sync status request failed.'
        setHostedSyncStatus(null)
        setHostedSyncError(message)
        onSyncProviderChange({
          id: 'supabase',
          status: result.error?.type === 'not-configured' ? 'not-configured' : 'error',
          message,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Hosted sync status request failed.'
      setHostedSyncError(message)
      setHostedSyncStatus(null)
      onSyncProviderChange({ id: 'supabase', status: 'error', message })
    } finally {
      setLoadingHostedSync(false)
    }
  }

  async function loadWritingProviderStatus() {
    setLoadingWritingProvider(true)
    setWritingProviderError(null)

    try {
      const result = await fetchWritingProviderStatus()

      if (result.ok && result.data) {
        setWritingProviderStatus(result.data)
      } else {
        setWritingProviderStatus(null)
        setWritingProviderError(
          result.error?.message || 'Writing provider status request failed.',
        )
      }
    } catch (error) {
      setWritingProviderError(
        error instanceof Error ? error.message : 'Writing provider status request failed.',
      )
      setWritingProviderStatus(null)
    } finally {
      setLoadingWritingProvider(false)
    }
  }

  async function loadHostConnectionStatus() {
    setLoadingHostConnection(true)
    setHostConnectionError(null)

    try {
      const status = await fetchHostConnectionStatus()

      setHostConnectionStatus(status)
      setHostConnectionError(status.error?.message ?? null)
    } catch (error) {
      setHostConnectionError(
        error instanceof Error ? error.message : 'Host boundary status request failed.',
      )
      setHostConnectionStatus(null)
    } finally {
      setLoadingHostConnection(false)
    }
  }

  async function loadVercelStatus() {
    setLoadingVercel(true)
    setVercelError(null)

    try {
      setVercelStatus(await fetchVercelStatus())
    } catch (error) {
      setVercelError(error instanceof Error ? error.message : 'Vercel status request failed.')
      setVercelStatus(null)
    } finally {
      setLoadingVercel(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()

    void requestGithubStatus(controller.signal)
      .then((status) => {
        setGithubStatus(status)
        setGithubError(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setGithubError(error instanceof Error ? error.message : 'GitHub status request failed.')
        setGithubStatus(null)
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void fetchVercelStatus(controller.signal)
      .then((status) => {
        setVercelStatus(status)
        setVercelError(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setVercelError(error instanceof Error ? error.message : 'Vercel status request failed.')
        setVercelStatus(null)
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void fetchHostedSyncStatus(controller.signal)
      .then((result) => {
        if (result.ok && result.data) {
          setHostedSyncStatus(result.data)
          setHostedSyncError(null)
          return
        }

        setHostedSyncStatus(null)
        setHostedSyncError(result.error?.message || 'Hosted sync status request failed.')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setHostedSyncError(
          error instanceof Error ? error.message : 'Hosted sync status request failed.',
        )
        setHostedSyncStatus(null)
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void fetchWritingProviderStatus(controller.signal)
      .then((result) => {
        if (result.ok && result.data) {
          setWritingProviderStatus(result.data)
          setWritingProviderError(null)
          return
        }

        setWritingProviderStatus(null)
        setWritingProviderError(result.error?.message || 'Writing provider status request failed.')
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setWritingProviderError(
          error instanceof Error ? error.message : 'Writing provider status request failed.',
        )
        setWritingProviderStatus(null)
      })

    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()

    void fetchHostConnectionStatus(controller.signal)
      .then((status) => {
        setHostConnectionStatus(status)
        setHostConnectionError(status.error?.message ?? null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setHostConnectionError(
          error instanceof Error ? error.message : 'Host boundary status request failed.',
        )
        setHostConnectionStatus(null)
      })

    return () => controller.abort()
  }, [])

  const connectionCards = useMemo(
    () => [
      buildGithubCard(githubStatus, githubError),
      ...buildStaticConnectionCards(),
      buildVercelCard(vercelStatus, vercelError),
      buildHostConnectionCard(hostConnectionStatus, hostConnectionError),
      buildWritingProviderCard(writingProviderStatus, writingProviderError),
      buildHostedSyncCard(hostedSyncStatus, hostedSyncError, syncProvider),
    ],
    [
      githubError,
      githubStatus,
      hostConnectionError,
      hostConnectionStatus,
      hostedSyncError,
      hostedSyncStatus,
      syncProvider,
      vercelError,
      vercelStatus,
      writingProviderError,
      writingProviderStatus,
    ],
  )
  const configuredHostTargetIds = useMemo(
    () =>
      hostConnectionStatus?.data?.configuredTargets.map((target) => target.targetId) ?? [],
    [hostConnectionStatus],
  )

  async function handleRefreshConnectionStatuses() {
    await Promise.all([
      loadGithubStatus(),
      loadVercelStatus(),
      loadHostedSyncStatus(),
      loadWritingProviderStatus(),
      loadHostConnectionStatus(),
    ])
  }

  return {
    configuredHostTargetIds,
    connectionCards,
    githubError,
    githubStatus,
    handleGithubLogin,
    handleGithubLogout,
    handleRefreshConnectionStatuses,
    hostConnectionError,
    hostConnectionStatus,
    hostedSyncError,
    hostedSyncStatus,
    loadingGithub,
    loadingHostConnection,
    loadingHostedSync,
    loadingVercel,
    loadingWritingProvider,
    loadHostedSyncStatus,
    setHostedSyncError,
    setLoadingHostedSync,
    vercelError,
    vercelStatus,
    writingProviderError,
    writingProviderStatus,
  }
}
