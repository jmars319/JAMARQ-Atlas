import type {
  DeploymentTarget,
  HostConnectionPreflightResult,
} from '../domain/dispatch'

export interface HostConnectionStatusResponse {
  ok: boolean
  configured: boolean
  data: {
    configured: boolean
    configuredTargets: {
      targetId: string
      credentialRef: string
      host: string
      port: number
      probeMode: 'tcp' | 'local-mirror' | 'sftp-readonly'
      authMethod: 'none' | 'password-env' | 'private-key-env' | 'not-configured'
      sftpEnabled: boolean
      hasLocalMirror: boolean
    }[]
    sftpEnabledCount: number
    message: string
  } | null
  error: {
    type: string
    message: string
  } | null
}

export async function fetchHostConnectionStatus(signal?: AbortSignal) {
  const response = await fetch('/api/dispatch/host-status', { signal })

  if (!response.ok) {
    throw new Error(`Host preflight status returned ${response.status}.`)
  }

  return (await response.json()) as HostConnectionStatusResponse
}

export async function requestHostConnectionPreflight({
  target,
  preservePaths,
  signal,
}: {
  target: DeploymentTarget
  preservePaths: string[]
  signal?: AbortSignal
}) {
  const params = new URLSearchParams({
    targetId: target.id,
    credentialRef: target.credentialRef,
    remoteHost: target.remoteHost,
    remoteUser: target.remoteUser,
    remoteFrontendPath: target.remoteFrontendPath,
    remoteBackendPath: target.remoteBackendPath,
  })

  for (const preservePath of preservePaths) {
    params.append('preservePath', preservePath)
  }

  const response = await fetch(`/api/dispatch/host-preflight?${params.toString()}`, {
    signal,
  })

  if (!response.ok) {
    throw new Error(`Host preflight returned ${response.status}.`)
  }

  const body = (await response.json()) as { result: HostConnectionPreflightResult }
  return body.result
}
