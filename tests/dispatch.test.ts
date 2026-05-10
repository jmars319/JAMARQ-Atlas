import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DeploymentTarget, DispatchReadiness } from '../src/domain/dispatch'
import { evaluateDispatchReadiness } from '../src/services/dispatchReadiness'
import { probeHealthChecks } from '../src/services/dispatchHealthChecks'
import { deploymentRunnerPhases, runDeploymentPhase, runDeploymentPlan } from '../src/services/dispatchRunner'
import { buildTargetPreflightChecks, runDispatchPreflight } from '../src/services/dispatchPreflight'
import { normalizeDispatchState } from '../src/services/dispatchStorage'
import { flattenProjects } from '../src/domain/atlas'
import { seedWorkspace } from '../src/data/seedWorkspace'

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

afterEach(() => {
  vi.unstubAllGlobals()
})

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

  it('probes health checks through the read-only local API boundary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            result: {
              id: 'health-1',
              url: 'https://example.com/health',
              status: 'passing',
              checkedAt: '2026-05-10T12:00:00Z',
              statusCode: 200,
              message: 'Health URL responded successfully.',
            },
          }),
          { status: 200 },
        ),
      ),
    )

    const results = await probeHealthChecks(['https://example.com/health'])

    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      status: 'passing',
      statusCode: 200,
    })
  })

  it('returns failed health check evidence without throwing when probing fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })))

    const results = await probeHealthChecks(['https://example.com/health'])

    expect(results[0]).toMatchObject({
      status: 'failed',
      message: 'Atlas health API returned 503.',
    })
  })

  it('normalizes older dispatch storage with empty preflight history', () => {
    const normalized = normalizeDispatchState({
      targets: [target],
      records: [],
      readiness: [readiness],
    })

    expect(normalized.preflightRuns).toEqual([])
  })

  it('returns safe preflight evidence when no target is configured', () => {
    const checks = buildTargetPreflightChecks({ checkedAt: '2026-05-10T12:00:00Z' })

    expect(checks[0]).toMatchObject({
      type: 'target-config',
      status: 'failed',
    })
  })

  it('flags placeholder target config and backup posture during preflight', () => {
    const checks = buildTargetPreflightChecks({
      target,
      readiness,
      checkedAt: '2026-05-10T12:00:00Z',
    })

    expect(checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Host and paths', status: 'warning' }),
        expect.objectContaining({ label: 'Backup posture', status: 'warning' }),
      ]),
    )
  })

  it('records missing GitHub token as scoped preflight warnings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.startsWith('/api/dispatch/health')) {
          return new Response(
            JSON.stringify({
              result: {
                id: 'health-1',
                url: 'https://example.com',
                status: 'passing',
                checkedAt: '2026-05-10T12:00:00Z',
                statusCode: 200,
                message: 'Health URL responded successfully.',
              },
            }),
            { status: 200 },
          )
        }

        return new Response(
          JSON.stringify({
            data: null,
            pageInfo: {
              currentPage: 1,
              hasNextPage: false,
              nextPage: null,
              perPage: 1,
            },
            error: {
              type: 'missing-token',
              status: 401,
              resource: 'github',
              message: 'Set GITHUB_TOKEN or GH_TOKEN and restart the local server.',
            },
            permission: 'missing-token',
          }),
          { status: 200 },
        )
      }),
    )
    const repoTarget = { ...target, projectId: 'vaexcore-studio' }
    const repoReadiness = { ...readiness, projectId: 'vaexcore-studio' }
    const record = flattenProjects(seedWorkspace).find(
      (candidate) => candidate.project.id === 'vaexcore-studio',
    )
    const dispatch = {
      targets: [repoTarget],
      records: [],
      readiness: [repoReadiness],
      preflightRuns: [],
    }

    if (!record) {
      throw new Error('Expected seed project')
    }

    const run = await runDispatchPreflight({ record, dispatch, target: repoTarget })

    expect(run.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'github-permission',
          status: 'warning',
        }),
      ]),
    )
  })

  it('does not mutate dispatch state while assembling preflight evidence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)

        if (url.startsWith('/api/dispatch/health')) {
          return new Response(
            JSON.stringify({
              result: {
                id: 'health-1',
                url: 'https://example.com',
                status: 'passing',
                checkedAt: '2026-05-10T12:00:00Z',
                statusCode: 200,
                message: 'Health URL responded successfully.',
              },
            }),
            { status: 200 },
          )
        }

        return new Response(
          JSON.stringify({
            data: [],
            pageInfo: {
              currentPage: 1,
              hasNextPage: false,
              nextPage: null,
              perPage: 1,
            },
            error: null,
            permission: 'available',
          }),
          { status: 200 },
        )
      }),
    )
    const record = flattenProjects(seedWorkspace).find(
      (candidate) => candidate.project.id === 'midway-music-hall-site',
    )
    const dispatch = {
      targets: [target],
      records: [],
      readiness: [readiness],
      preflightRuns: [],
    }
    const before = JSON.stringify(dispatch)

    if (!record) {
      throw new Error('Expected seed project')
    }

    await runDispatchPreflight({ record, dispatch, target })

    expect(JSON.stringify(dispatch)).toBe(before)
  })
})
