import type { IncomingMessage, ServerResponse } from 'node:http'
import type { HealthCheckResult } from '../src/domain/dispatch'

const HEALTH_TIMEOUT_MS = 5000

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body, null, 2))
}

function healthResult({
  url,
  status,
  checkedAt,
  statusCode,
  message,
}: {
  url: string
  status: HealthCheckResult['status']
  checkedAt: string
  statusCode?: number
  message: string
}): HealthCheckResult {
  return {
    id: `health-${Date.now().toString(36)}`,
    url,
    status,
    checkedAt,
    statusCode,
    message,
  }
}

function parseHealthUrl(value: string | null) {
  if (!value) {
    throw new Error('Missing required url parameter.')
  }

  const parsed = new URL(value)

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Health checks only support http and https URLs.')
  }

  if (parsed.username || parsed.password) {
    throw new Error('Health check URLs must not include credentials.')
  }

  return parsed.toString()
}

async function fetchWithTimeout(url: string, method: 'HEAD' | 'GET') {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS)

  try {
    return await fetch(url, {
      method,
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        Accept: 'text/html,application/json,text/plain,*/*',
        'User-Agent': 'jamarq-atlas-dispatch-preflight',
      },
    })
  } finally {
    clearTimeout(timeout)
  }
}

async function probeUrl(url: string) {
  const checkedAt = new Date().toISOString()

  try {
    let response = await fetchWithTimeout(url, 'HEAD')

    if ([403, 405, 501].includes(response.status)) {
      response = await fetchWithTimeout(url, 'GET')
    }

    const status =
      response.status >= 200 && response.status < 400
        ? 'passing'
        : response.status >= 400 && response.status < 500
          ? 'warning'
          : 'failed'

    return healthResult({
      url,
      status,
      checkedAt,
      statusCode: response.status,
      message:
        status === 'passing'
          ? 'Health URL responded successfully.'
          : `Health URL returned ${response.status} ${response.statusText}.`,
    })
  } catch (error) {
    return healthResult({
      url,
      status: 'failed',
      checkedAt,
      message: error instanceof Error ? error.message : 'Health check request failed.',
    })
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
    json(response, 200, {
      result: healthResult({
        url: new URL(request.url ?? '', 'http://localhost').searchParams.get('url') ?? '',
        status: 'failed',
        checkedAt: new Date().toISOString(),
        message: error instanceof Error ? error.message : 'Atlas Dispatch API failed.',
      }),
    })
  }
}
