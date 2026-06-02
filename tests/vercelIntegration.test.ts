import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createVercelStatus,
  getVercelConfig,
  vercelApiMiddleware,
} from '../server/vercelApi'
import {
  deriveVercelReadinessSignals,
  normalizeVercelDeployment,
  normalizeVercelDomain,
  normalizeVercelProject,
  type VercelDeploymentCommandSummary,
} from '../src/services/vercelIntegration'
import type { DeploymentTarget } from '../src/domain/dispatch'

class TestResponse {
  statusCode = 200
  body = ''
  headers = new Map<string, string | string[]>()

  setHeader(name: string, value: string | string[]) {
    this.headers.set(name.toLowerCase(), value)
  }

  getHeader(name: string) {
    return this.headers.get(name.toLowerCase())
  }

  end(value?: string) {
    this.body += value ?? ''
  }
}

function request(url: string, method = 'GET') {
  const stream = Readable.from([]) as IncomingMessage

  stream.url = url
  stream.method = method
  stream.headers = {}

  return stream
}

async function route(requestMessage: IncomingMessage) {
  const response = new TestResponse()

  await vercelApiMiddleware(requestMessage, response as unknown as ServerResponse)

  return {
    status: response.statusCode,
    body: JSON.parse(response.body),
  }
}

function target(): DeploymentTarget {
  return {
    id: 'jamarq-atlas-vercel-production',
    projectId: 'jamarq-atlas',
    name: 'Atlas by Tenra Vercel production',
    environment: 'production',
    hostType: 'vercel',
    credentialRef: 'vercel-atlas',
    remoteHost: 'vercel',
    remoteUser: '',
    remoteFrontendPath: 'Vercel project output',
    remoteBackendPath: 'Vercel functions',
    publicUrl: 'https://atlas.jamarq.digital',
    healthCheckUrls: ['https://atlas.jamarq.digital'],
    hasDatabase: false,
    databaseName: '',
    backupRequired: false,
    destructiveOperationsRequireConfirmation: true,
    status: 'configured',
    lastVerified: '2026-05-20',
    deploymentNotes: [],
    blockers: [],
    notes: [],
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Vercel read-only integration', () => {
  it('parses status and target mappings without exposing secrets', () => {
    const config = getVercelConfig({
      VERCEL_TOKEN: 'secret-token',
      VERCEL_ORG_ID: 'team_123',
      ATLAS_VERCEL_PROJECT_MAP:
        'jamarq-atlas-vercel-production:jamarq-atlas,broken-entry',
    })
    const status = createVercelStatus(config)

    expect(status.configured).toBe(true)
    expect(status.teamScope.usesOrgIdFallback).toBe(true)
    expect(status.mappedTargets).toEqual([
      {
        targetId: 'jamarq-atlas-vercel-production',
        projectIdOrName: 'jamarq-atlas',
      },
    ])
    expect(JSON.stringify(status)).not.toContain('secret-token')
    expect(status.missingConfig.join(' ')).toContain('Invalid Vercel project map entry')
    expect(status.writeControlsEnabled).toBe(false)
  })

  it('normalizes project, domain, and deployment payloads into safe summaries', () => {
    const project = normalizeVercelProject({
      id: 'prj_123',
      name: 'jamarq-atlas',
      framework: 'vite',
      updatedAt: 1_779_000_000_000,
      link: {
        type: 'github',
        repo: 'JAMARQ-Atlas',
        productionBranch: 'main',
      },
      latestDeployments: [
        {
          uid: 'dpl_123',
          url: 'jamarq-atlas.vercel.app',
          readyState: 'READY',
          target: 'production',
          meta: {
            githubCommitSha: 'abc123',
            githubCommitRef: 'main',
          },
        },
      ],
      env: [{ key: 'SHOULD_NOT_LEAK', value: 'secret' }],
    })
    const domain = normalizeVercelDomain({
      name: 'atlas.jamarq.digital',
      verified: true,
      createdAt: 1_779_000_000_000,
    })
    const deployment = normalizeVercelDeployment({
      uid: 'dpl_456',
      name: 'jamarq-atlas',
      url: 'jamarq-atlas-git-main.vercel.app',
      readyState: 'ERROR',
      target: 'preview',
      errorCode: 'BUILD_FAILED',
      meta: { githubCommitSha: 'def456' },
    })

    expect(project).toMatchObject({
      id: 'prj_123',
      name: 'jamarq-atlas',
      link: { repo: 'JAMARQ-Atlas' },
    })
    expect(JSON.stringify(project)).not.toContain('SHOULD_NOT_LEAK')
    expect(domain).toMatchObject({ name: 'atlas.jamarq.digital', verified: true })
    expect(deployment).toMatchObject({
      id: 'dpl_456',
      readyState: 'ERROR',
      errorCode: 'BUILD_FAILED',
    })
  })

  it('derives advisory deployment signals without mutating readiness', () => {
    const summary: VercelDeploymentCommandSummary = {
      targetId: 'jamarq-atlas-vercel-production',
      projectIdOrName: 'jamarq-atlas',
      binding: {
        targetId: 'jamarq-atlas-vercel-production',
        projectIdOrName: 'jamarq-atlas',
        mapped: true,
      },
      project: {
        id: 'prj_123',
        name: 'jamarq-atlas',
        framework: 'vite',
        accountId: null,
        createdAt: null,
        updatedAt: null,
        publicSource: null,
        rootDirectory: null,
        outputDirectory: null,
        nodeVersion: null,
        link: { type: 'github', repo: 'other-repo', productionBranch: 'main' },
        latestDeployments: [],
      },
      domains: [{ name: 'wrong.example.com', apexName: null, projectId: null, verified: false, redirect: null, redirectStatusCode: null, gitBranch: null, createdAt: null, updatedAt: null }],
      latestProduction: null,
      latestPreview: null,
      deployments: [],
      signals: [],
      permissionGaps: [],
      state: 'unknown',
      fetchedAt: '2026-05-20T12:00:00Z',
      writeControlsEnabled: false,
    }

    const signals = deriveVercelReadinessSignals({
      summary,
      target: target(),
      repositoryKeys: ['jmars319/JAMARQ-Atlas'],
      now: new Date('2026-05-20T12:00:00Z'),
    })

    expect(signals.map((signal) => signal.title)).toEqual(
      expect.arrayContaining([
        'No production deployment evidence',
        'Dispatch URL is not in Vercel domains',
        'Vercel domain verification incomplete',
        'Vercel Git repo differs from Atlas project repo',
      ]),
    )
  })

  it('keeps Vercel routes GET-only and returns missing-map summaries', async () => {
    vi.stubEnv('VERCEL_TOKEN', 'vercel_test')
    vi.stubEnv('ATLAS_VERCEL_PROJECT_MAP', '')

    const blocked = await route(request('/api/vercel/projects', 'POST'))
    const summary = await route(
      request('/api/vercel/command-summaries?targetIds=jamarq-atlas-vercel-production'),
    )

    expect(blocked.status).toBe(405)
    expect(blocked.body.error.message).toContain('read-only GET routes only')
    expect(summary.status).toBe(200)
    expect(summary.body.data[0]).toMatchObject({
      targetId: 'jamarq-atlas-vercel-production',
      binding: { mapped: false },
      writeControlsEnabled: false,
    })
  })

  it('maps Vercel API failures into Atlas evidence errors', async () => {
    vi.stubEnv('VERCEL_TOKEN', 'vercel_test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: 'Project not found' } }), {
          status: 404,
        }),
      ),
    )

    const result = await route(request('/api/vercel/projects/missing-project'))

    expect(result.status).toBe(200)
    expect(result.body.error).toMatchObject({
      type: 'not-found',
      resource: 'project:missing-project',
      message: 'Project not found',
    })
  })
})
