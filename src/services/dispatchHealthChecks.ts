import type { HealthCheckResult } from '../domain/dispatch'

export async function probeHealthChecks(urls: string[]): Promise<HealthCheckResult[]> {
  return urls.map((url, index) => ({
    id: `stub-health-${index + 1}`,
    url,
    status: 'not-checked',
    checkedAt: null,
    message:
      'Health probing is stubbed. Future implementation should use a safe read-only endpoint check.',
  }))
}
