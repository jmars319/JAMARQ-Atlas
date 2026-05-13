import type { HealthCheckResult } from '../domain/dispatch'
import { AtlasRequestError, requestJson } from './requestClient'

interface DispatchHealthResponse {
  result: HealthCheckResult
}

function fallbackResult(url: string, index: number, message: string): HealthCheckResult {
  return {
    id: `health-${index + 1}`,
    url,
    status: 'failed',
    checkedAt: new Date().toISOString(),
    message,
  }
}

export async function probeHealthChecks(
  urls: string[],
  signal?: AbortSignal,
): Promise<HealthCheckResult[]> {
  return Promise.all(
    urls.map(async (url, index) => {
      try {
        const body = await requestJson<DispatchHealthResponse>(
          `/api/dispatch/health?url=${encodeURIComponent(url)}`,
          {},
          { signal, retries: 1, retrySafe: true, timeoutMs: 10_000 },
        )
        return body.result
      } catch (error) {
        if (signal?.aborted) {
          return fallbackResult(url, index, 'Health check was cancelled.')
        }

        if (error instanceof AtlasRequestError && error.status) {
          return fallbackResult(url, index, `Atlas health API returned ${error.status}.`)
        }

        return fallbackResult(
          url,
          index,
          error instanceof Error ? error.message : 'Health check request failed.',
        )
      }
    }),
  )
}
