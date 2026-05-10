import type { HealthCheckResult } from '../domain/dispatch'

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
        const response = await fetch(`/api/dispatch/health?url=${encodeURIComponent(url)}`, {
          signal,
        })

        if (!response.ok) {
          return fallbackResult(url, index, `Atlas health API returned ${response.status}.`)
        }

        const body = (await response.json()) as DispatchHealthResponse
        return body.result
      } catch (error) {
        if (signal?.aborted) {
          return fallbackResult(url, index, 'Health check was cancelled.')
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
