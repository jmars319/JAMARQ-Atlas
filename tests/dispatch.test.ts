import { describe, expect, it } from 'vitest'
import type { DeploymentTarget, DispatchReadiness } from '../src/domain/dispatch'
import { evaluateDispatchReadiness } from '../src/services/dispatchReadiness'
import { probeHealthChecks } from '../src/services/dispatchHealthChecks'
import { deploymentRunnerPhases, runDeploymentPhase, runDeploymentPlan } from '../src/services/dispatchRunner'

const target: DeploymentTarget = {
  id: 'target-1',
  projectId: 'project-1',
  name: 'Production',
  environment: 'production',
  hostType: 'godaddy-cpanel',
  remoteHost: 'placeholder.godaddy-cpanel.example',
  remoteUser: 'placeholder-user',
  remoteFrontendPath: '/home/placeholder/public_html',
  remoteBackendPath: '/home/placeholder/app',
  publicUrl: 'https://example.com',
  healthCheckUrls: ['https://example.com'],
  hasDatabase: true,
  databaseName: 'placeholder_db',
  backupRequired: true,
  destructiveOperationsRequireConfirmation: true,
  status: 'configured',
  lastVerified: '2026-05-08',
  deploymentNotes: [],
  blockers: [],
  notes: [],
}

const readiness: DispatchReadiness = {
  projectId: 'project-1',
  targetId: 'target-1',
  repoCleanKnown: false,
  buildStatusKnown: false,
  artifactReady: false,
  backupReady: false,
  healthChecksDefined: true,
  ready: false,
  blocked: false,
  blockers: [],
  warnings: [],
  lastCheckedAt: '2026-05-08T14:00:00Z',
}

describe('dispatch readiness', () => {
  it('returns a safe blocked state when no target is configured', () => {
    const result = evaluateDispatchReadiness({})

    expect(result.ready).toBe(false)
    expect(result.blocked).toBe(true)
    expect(result.blockers).toContain('No deployment target is configured.')
  })

  it('warns when backups are required but not ready', () => {
    const result = evaluateDispatchReadiness({ target, readiness })

    expect(result.ready).toBe(false)
    expect(result.warnings).toContain('Backup is required but not marked ready.')
  })

  it('does not convert destructive confirmation flags into executable actions', async () => {
    const result = await runDeploymentPhase('release', target)

    expect(result.status).toBe('not-implemented')
    expect(result.requiresConfirmation).toBe(true)
    expect(result.message).toContain('No network write')
  })

  it('returns no-op runner results for every future phase', async () => {
    const results = await runDeploymentPlan(target)

    expect(results.map((result) => result.phase)).toEqual(deploymentRunnerPhases)
    expect(results.every((result) => result.status === 'not-implemented')).toBe(true)
  })

  it('keeps health checks stubbed and read-only', async () => {
    const results = await probeHealthChecks(['https://example.com/health'])

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      status: 'not-checked',
      checkedAt: null,
    })
  })
})
