import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getRunbookForTarget, type DeploymentTarget, type DispatchReadiness } from '../src/domain/dispatch'
import { seedDispatchState } from '../src/data/seedDispatch'
import {
  createDefaultAutomationReadiness,
  createDispatchAutomationDryRunPlan,
  canExecuteWriteAutomation,
  evaluateAutomationReadiness,
  evaluateDispatchWriteAutomationGate,
} from '../src/services/dispatchAutomation'
import { evaluateDispatchReadiness } from '../src/services/dispatchReadiness'
import { probeHealthChecks } from '../src/services/dispatchHealthChecks'
import { deploymentRunnerPhases, runDeploymentPhase, runDeploymentPlan } from '../src/services/dispatchRunner'
import { buildTargetPreflightChecks, runDispatchPreflight } from '../src/services/dispatchPreflight'
import { normalizeDispatchState } from '../src/services/dispatchStorage'
import {
  inspectDeploymentArtifact,
  runDeploymentVerificationChecks,
} from '../src/services/deployPreflight'
import {
  MANUAL_DEPLOYMENT_RECORD_CONFIRMATION,
  recordManualDeploymentFromSession,
  startDeploySession,
  updateDeploySessionStep,
} from '../src/services/deploySessions'
import {
  createHostConnectionStatus,
  getHostConnectionConfig,
  runHostConnectionPreflight,
} from '../server/dispatchApi'
import { flattenProjects } from '../src/domain/atlas'
import { seedWorkspace } from '../src/data/seedWorkspace'

function createZipFile(name: string, entries: string[]) {
  const encoder = new TextEncoder()
  const chunks: Uint8Array[] = []

  for (const entry of entries) {
    const encoded = encoder.encode(entry)
    const chunk = new Uint8Array(46 + encoded.length)
    const view = new DataView(chunk.buffer)
    view.setUint32(0, 0x02014b50, true)
    view.setUint16(28, encoded.length, true)
    chunk.set(encoded, 46)
    chunks.push(chunk)
  }

  return new File(chunks, name, { type: 'application/zip' })
}

const target: DeploymentTarget = {
  id: 'target-1',
  projectId: 'project-1',
  name: 'Production',
  environment: 'production',
  hostType: 'godaddy-cpanel',
  credentialRef: 'godaddy-target-1-production',
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
    expect(normalized.deploySessions).toEqual([])
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
      automationReadiness: [],
      runbooks: [],
      orderGroups: [],
      deploySessions: [],
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
      automationReadiness: [],
      runbooks: [],
      orderGroups: [],
      deploySessions: [],
    }
    const before = JSON.stringify(dispatch)

    if (!record) {
      throw new Error('Expected seed project')
    }

    await runDispatchPreflight({ record, dispatch, target })

    expect(JSON.stringify(dispatch)).toBe(before)
  })

  it('normalizes older dispatch storage with automation readiness defaults', () => {
    const normalized = normalizeDispatchState({
      targets: [target],
      records: [],
      readiness: [readiness],
      preflightRuns: [],
    })

    expect(normalized.automationReadiness).toHaveLength(1)
    expect(normalized.automationReadiness[0].checklistItems.length).toBeGreaterThan(0)
  })

  it('blocks automation readiness when required checklist items are incomplete', () => {
    const automation = createDefaultAutomationReadiness(target, new Date('2026-05-10T12:00:00Z'))
    const evaluation = evaluateAutomationReadiness(target, automation)

    expect(evaluation.ready).toBe(false)
    expect(evaluation.blockers.length).toBeGreaterThan(0)
  })

  it('creates a no-op automation dry-run plan without mutating dispatch state', () => {
    const automation = createDefaultAutomationReadiness(target, new Date('2026-05-10T12:00:00Z'))
    const dispatch = {
      targets: [target],
      records: [],
      readiness: [readiness],
      preflightRuns: [],
      automationReadiness: [automation],
      runbooks: [],
      orderGroups: [],
      deploySessions: [],
    }
    const before = JSON.stringify(dispatch)
    const plan = createDispatchAutomationDryRunPlan({
      target,
      readiness: automation,
      now: new Date('2026-05-10T13:00:00Z'),
    })

    expect(plan.steps.every((step) => step.message.includes('No SSH'))).toBe(true)
    expect(plan.steps.some((step) => step.requiresConfirmation)).toBe(true)
    expect(JSON.stringify(dispatch)).toBe(before)
  })

  it('keeps write-capable deployment automation locked behind future gates', () => {
    const automation = createDefaultAutomationReadiness(target, new Date('2026-05-10T12:00:00Z'))
    const dryRunPlan = createDispatchAutomationDryRunPlan({
      target,
      readiness: automation,
      now: new Date('2026-05-10T13:00:00Z'),
    })
    const gate = evaluateDispatchWriteAutomationGate({
      target,
      readiness,
      automationReadiness: automation,
      latestDeployment: undefined,
      runbook: undefined,
      dryRunPlan,
    })

    expect(gate.status).toBe('locked')
    expect(gate.locked).toBe(true)
    expect(canExecuteWriteAutomation(gate)).toBe(false)
    expect(gate.blockers).toContain(
      'Write-capable deployment automation is intentionally locked in this Atlas phase.',
    )
    expect(gate.gates.map((candidate) => candidate.id)).toEqual([
      'verified-backup',
      'artifact-checksum',
      'preserve-path-confirmation',
      'rollback-reference',
      'typed-confirmation',
      'dry-run-pass',
      'post-deploy-verification-plan',
    ])
  })

  it('keeps the deployment runner free of production write primitives', () => {
    const runnerSource = readFileSync(
      new URL('../src/services/dispatchRunner.ts', import.meta.url),
      'utf8',
    )

    expect(runnerSource).not.toMatch(/writeFile|unlink|rm\(|rmdir|sftp\.put|ssh2|exec\(/i)
  })

  it('seeds cPanel deploy runbooks for the current five-site deploy queue', () => {
    const queue = seedDispatchState.orderGroups.find(
      (group) => group.id === 'current-cpanel-sites',
    )

    expect(queue?.runbookIds).toEqual([
      'mms-cpanel-runbook',
      'mmh-cpanel-runbook',
      'surplus-cpanel-runbook',
      'trbg-cpanel-runbook',
      'bow-wow-cpanel-runbook',
    ])
    expect(seedDispatchState.runbooks).toHaveLength(5)
    expect(
      seedDispatchState.targets.every((target) =>
        target.id === 'jamarq-website-production' ||
        target.id === 'tenra-public-site-production' ||
        Boolean(getRunbookForTarget(seedDispatchState, target.id)),
      ),
    ).toBe(true)
  })

  it('captures MMS config transition and Bow Wow placeholder-only posture', () => {
    const mms = getRunbookForTarget(seedDispatchState, 'midway-mobile-storage-production')
    const bowWow = getRunbookForTarget(seedDispatchState, 'bow-wow-production')

    expect(mms?.preservePaths.some((path) => path.path === '/api/.env')).toBe(true)
    expect(mms?.preservePaths.some((path) => path.path === '/api/config.php' && path.temporary)).toBe(
      true,
    )
    expect(bowWow?.artifacts).toEqual([
      expect.objectContaining({
        filename: 'deploy-placeholder.zip',
        role: 'placeholder',
      }),
    ])
    expect(bowWow?.manualDeployNotes.join(' ')).toContain('upload only deploy-placeholder.zip')
  })

  it('does not create deployment records or change status from runbook data', () => {
    const beforeRecordCount = seedDispatchState.records.length
    const bowWowTarget = seedDispatchState.targets.find((candidate) => candidate.id === 'bow-wow-production')

    expect(seedDispatchState.records).toHaveLength(beforeRecordCount)
    expect(bowWowTarget?.status).toBe('verification')
  })

  it('starts cPanel deploy sessions with the expected ordered manual steps', () => {
    const runbookIds = [
      'mms-cpanel-runbook',
      'mmh-cpanel-runbook',
      'surplus-cpanel-runbook',
      'trbg-cpanel-runbook',
      'bow-wow-cpanel-runbook',
    ]

    for (const runbookId of runbookIds) {
      const state = startDeploySession(
        seedDispatchState,
        runbookId,
        new Date('2026-05-10T12:00:00Z'),
      )
      const session = state.deploySessions[0]

      expect(session.runbookId).toBe(runbookId)
      expect(session.status).toBe('active')
      expect(session.steps.map((step) => step.kind)).toEqual([
        'preflight',
        'artifact-inspection',
        'preserve-paths',
        'backup-readiness',
        'outside-atlas-upload',
        'verification-checks',
        'notes',
        'post-deploy-wrap-up',
      ])
      expect(session.steps.map((step) => step.status).every((status) => status === 'pending')).toBe(
        true,
      )
    }
  })

  it('persists deploy session step notes and evidence without mutating target status or readiness', () => {
    const state = startDeploySession(
      seedDispatchState,
      'mms-cpanel-runbook',
      new Date('2026-05-10T12:00:00Z'),
    )
    const session = state.deploySessions[0]
    const step = session.steps.find((candidate) => candidate.kind === 'artifact-inspection')
    const targetsBefore = JSON.stringify(state.targets)
    const readinessBefore = JSON.stringify(state.readiness)

    if (!step) {
      throw new Error('Expected artifact step')
    }

    const updated = updateDeploySessionStep(
      state,
      session.id,
      step.id,
      {
        status: 'confirmed',
        notes: 'Frontend and backend zip filenames reviewed.',
        evidence: 'sha256-local-check',
      },
      new Date('2026-05-10T12:15:00Z'),
    )
    const updatedStep = updated.deploySessions[0].steps.find(
      (candidate) => candidate.id === step.id,
    )

    expect(updatedStep).toMatchObject({
      status: 'confirmed',
      notes: 'Frontend and backend zip filenames reviewed.',
      evidence: 'sha256-local-check',
    })
    expect(JSON.stringify(updated.targets)).toBe(targetsBefore)
    expect(JSON.stringify(updated.readiness)).toBe(readinessBefore)
  })

  it('requires typed confirmation before creating a human-confirmed deployment record', () => {
    const state = startDeploySession(
      seedDispatchState,
      'mms-cpanel-runbook',
      new Date('2026-05-10T12:00:00Z'),
    )
    const session = state.deploySessions[0]
    const targetsBefore = JSON.stringify(state.targets)
    const readinessBefore = JSON.stringify(state.readiness)
    const recordsBefore = state.records.length
    const rejected = recordManualDeploymentFromSession(
      state,
      session.id,
      'record deployment',
      new Date('2026-05-10T12:30:00Z'),
    )

    expect(rejected.ok).toBe(false)
    expect(rejected.state.records).toHaveLength(recordsBefore)
    expect(rejected.message).toContain(MANUAL_DEPLOYMENT_RECORD_CONFIRMATION)

    const accepted = recordManualDeploymentFromSession(
      state,
      session.id,
      MANUAL_DEPLOYMENT_RECORD_CONFIRMATION,
      new Date('2026-05-10T12:35:00Z'),
    )

    expect(accepted.ok).toBe(true)
    expect(accepted.state.records).toHaveLength(recordsBefore + 1)
    expect(accepted.state.records[0]).toMatchObject({
      projectId: session.projectId,
      targetId: session.targetId,
      status: 'verification',
    })
    expect(accepted.state.records[0].summary).toContain('Atlas did not perform the deployment')
    expect(accepted.state.deploySessions[0]).toMatchObject({
      status: 'recorded',
      recordedDeploymentRecordId: accepted.state.records[0].id,
    })
    expect(JSON.stringify(accepted.state.targets)).toBe(targetsBefore)
    expect(JSON.stringify(accepted.state.readiness)).toBe(readinessBefore)
  })

  it('starts Bow Wow deploy sessions with placeholder artifact expectations only', () => {
    const state = startDeploySession(
      seedDispatchState,
      'bow-wow-cpanel-runbook',
      new Date('2026-05-10T12:00:00Z'),
    )
    const session = state.deploySessions[0]
    const artifactStep = session.steps.find((step) => step.kind === 'artifact-inspection')

    expect(session.artifactName).toBe('deploy-placeholder.zip')
    expect(artifactStep?.detail).toContain('deploy-placeholder.zip')
    expect(artifactStep?.detail).not.toContain('frontend-deploy.zip')
    expect(artifactStep?.detail).not.toContain('backend-deploy.zip')
  })

  it('inspects deployment artifacts locally for filename, checksum, entries, and warnings', async () => {
    const runbook = getRunbookForTarget(seedDispatchState, 'midway-music-hall-production')
    const artifact = runbook?.artifacts.find((candidate) => candidate.role === 'frontend')

    if (!artifact) {
      throw new Error('Expected frontend artifact')
    }

    const safe = await inspectDeploymentArtifact(
      createZipFile('frontend-deploy.zip', ['index.html', 'assets/app.js']),
      artifact,
    )
    const wrong = await inspectDeploymentArtifact(
      createZipFile('wrong.zip', ['../danger.txt']),
      artifact,
    )

    expect(safe.checksum).toMatch(/^sha256-/)
    expect(safe.topLevelEntries).toContain('index.html')
    expect(safe.warnings).toEqual([])
    expect(wrong.warnings.join(' ')).toContain('Expected frontend-deploy.zip')
    expect(wrong.warnings.join(' ')).toContain('Dangerous ZIP path')
  })

  it('evaluates protected path checks as expected 403/404 evidence', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost')
        const targetUrl = url.searchParams.get('url') ?? ''
        const statusCode = targetUrl.endsWith('/api/.env') ? 403 : 200

        return new Response(
          JSON.stringify({
            result: {
              id: 'deploy-check',
              url: targetUrl,
              status: statusCode === 403 ? 'warning' : 'passing',
              checkedAt: '2026-05-10T12:00:00Z',
              statusCode,
              message: `Health URL returned ${statusCode}.`,
            },
          }),
          { status: 200 },
        )
      }),
    )
    const runbook = getRunbookForTarget(seedDispatchState, 'midway-music-hall-production')
    const target = seedDispatchState.targets.find(
      (candidate) => candidate.id === 'midway-music-hall-production',
    )

    if (!runbook || !target) {
      throw new Error('Expected MMH runbook and target')
    }

    const evidence = await runDeploymentVerificationChecks({
      target,
      checks: runbook.verificationChecks.filter((check) =>
        ['/', '/api/.env'].includes(check.urlPath),
      ),
    })

    expect(evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          passedExpectation: true,
          check: expect.objectContaining({ urlPath: '/api/.env', protectedResource: true }),
        }),
      ]),
    )
  })

  it('returns a scoped not-configured host preflight result when credentials are missing', async () => {
    const config = getHostConnectionConfig({})
    const status = createHostConnectionStatus(config)
    const result = await runHostConnectionPreflight({
      target,
      preservePaths: ['/api/.env'],
      config,
      now: new Date('2026-05-10T12:00:00Z'),
    })

    expect(status.configured).toBe(false)
    expect(result.status).toBe('not-configured')
    expect(result.message).toContain('not configured')
    expect(result.checks[0].status).toBe('not-configured')
  })

  it('runs read-only host and preserve-path checks without write probes', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'atlas-host-preflight-'))
    mkdirSync(path.join(root, 'api', 'logs'), { recursive: true })
    writeFileSync(path.join(root, 'api', '.env'), 'placeholder=1')
    const touchedPaths: string[] = []
    const config = getHostConnectionConfig({
      ATLAS_HOST_PREFLIGHT_CONFIG: JSON.stringify([
        {
          targetId: target.id,
          credentialRef: target.credentialRef,
          host: 'cpanel.example.test',
          port: 22,
          localMirrorRoot: root,
        },
      ]),
    })
    const result = await runHostConnectionPreflight({
      target,
      preservePaths: ['/api/.env', '/api/logs/app.log'],
      config,
      now: new Date('2026-05-10T12:00:00Z'),
      probeHost: async () => ({
        ok: true,
        message: 'Mock read-only TCP check passed.',
      }),
      probePath: async (checkPath) => {
        touchedPaths.push(checkPath)
        return {
          exists: !checkPath.endsWith('app.log'),
          message: 'Missing path.',
        }
      },
    })

    expect(result.configured).toBe(true)
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'host-reachable', status: 'passing' }),
        expect.objectContaining({ type: 'target-root', status: 'passing' }),
        expect.objectContaining({ type: 'api-root', status: 'passing' }),
        expect.objectContaining({
          type: 'preserve-path',
          path: '/api/.env',
          status: 'passing',
        }),
        expect.objectContaining({
          type: 'preserve-path',
          path: '/api/logs/app.log',
          status: 'warning',
        }),
      ]),
    )
    expect(touchedPaths.every((checkPath) => checkPath.startsWith(root))).toBe(true)
  })

  it('does not expose secret-shaped host config values in status responses', () => {
    const config = getHostConnectionConfig({
      ATLAS_HOST_PREFLIGHT_CONFIG: JSON.stringify([
        {
          targetId: target.id,
          credentialRef: target.credentialRef,
          host: 'cpanel.example.test',
          password: 'never-expose-this',
        },
      ]),
    })
    const status = createHostConnectionStatus(config)

    expect(status.configured).toBe(false)
    expect(JSON.stringify(status)).not.toContain('never-expose-this')
    expect(status.error?.message).toContain('secret-shaped')
  })
})
