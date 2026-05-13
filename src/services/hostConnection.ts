import type {
  DeploymentTarget,
  HostConnectionPreflightResult,
} from '../domain/dispatch'
import { requestJson } from './requestClient'

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
  return requestJson<HostConnectionStatusResponse>(
    '/api/dispatch/host-status',
    {},
    { signal, retries: 1, retrySafe: true, timeoutMs: 10_000 },
  )
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

  const body = await requestJson<{ result: HostConnectionPreflightResult }>(
    `/api/dispatch/host-preflight?${params.toString()}`,
    {},
    { signal, retries: 1, retrySafe: true, timeoutMs: 20_000 },
  )
  return body.result
}
