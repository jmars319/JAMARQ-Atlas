import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHostConnectionStatus, getHostConnectionConfig } from './dispatch/config'
import { healthResult, parseHealthUrl, probeUrl } from './dispatch/health'
import { runHostConnectionPreflight, type HostConnectionTargetInput } from './dispatch/preflight'

export { createHostConnectionStatus, getHostConnectionConfig } from './dispatch/config'
export { runHostConnectionPreflight } from './dispatch/preflight'

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body, null, 2))
}

function readHostPreflightTarget(url: URL): HostConnectionTargetInput {
  return {
    targetId: url.searchParams.get('targetId') ?? '',
    credentialRef: url.searchParams.get('credentialRef') ?? '',
    remoteHost: url.searchParams.get('remoteHost') ?? '',
    remoteUser: url.searchParams.get('remoteUser') ?? '',
    remoteFrontendPath: url.searchParams.get('remoteFrontendPath') ?? '',
    remoteBackendPath: url.searchParams.get('remoteBackendPath') ?? '',
  }
}

export async function dispatchApiMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next?: () => void,
) {
  if (!request.url?.startsWith('/api/dispatch')) {
    next?.()
    return
  }

  try {
    const url = new URL(request.url, 'http://localhost')
    if (url.pathname === '/api/dispatch/host-status') {
      json(response, 200, createHostConnectionStatus(getHostConnectionConfig()))
      return
    }

    if (url.pathname === '/api/dispatch/host-preflight') {
      const target = readHostPreflightTarget(url)

      if (!target.targetId) {
        json(response, 200, {
          result: {
            targetId: '',
            configured: false,
            status: 'not-configured',
            checkedAt: new Date().toISOString(),
            credentialRef: '',
            probeMode: 'tcp',
            authMethod: 'not-configured',
            message: 'Host preflight requires a targetId.',
            checks: [],
            warnings: ['Host preflight requires a targetId.'],
          },
        })
        return
      }

      const result = await runHostConnectionPreflight({
        target,
        preservePaths: url.searchParams.getAll('preservePath'),
        config: getHostConnectionConfig(),
      })
      json(response, 200, { result })
      return
    }

    const requestedHealthUrl = url.searchParams.get('url') ?? ''

    if (url.pathname !== '/api/dispatch/health') {
      json(response, 404, {
        error: {
          type: 'unknown-route',
          message: 'Unknown Dispatch API route.',
        },
      })
      return
    }

    const healthUrl = parseHealthUrl(requestedHealthUrl)
    const result = await probeUrl(healthUrl)
    json(response, 200, { result })
  } catch (error) {
    const url = new URL(request.url ?? '', 'http://localhost')

    if (url.pathname === '/api/dispatch/host-preflight') {
      json(response, 200, {
        result: {
          targetId: url.searchParams.get('targetId') ?? '',
          configured: false,
          status: 'failed',
          checkedAt: new Date().toISOString(),
          credentialRef: url.searchParams.get('credentialRef') ?? '',
          message: error instanceof Error ? error.message : 'Atlas host preflight API failed.',
          checks: [],
          warnings: [error instanceof Error ? error.message : 'Atlas host preflight API failed.'],
        },
      })
      return
    }

    json(response, 200, {
      result: healthResult({
        url: url.searchParams.get('url') ?? '',
        status: 'failed',
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Atlas Dispatch API failed.',
      }),
    })
  }
}
