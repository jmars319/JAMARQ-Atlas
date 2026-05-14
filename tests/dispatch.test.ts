import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getRunbookForTarget,
  type DeploymentTarget,
  type DispatchHostEvidenceRun,
  type DispatchPreflightRun,
  type DispatchReadiness,
  type DispatchState,
  type DispatchVerificationEvidenceRun,
} from '../src/domain/dispatch'
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
import {
  addDispatchHostEvidenceRun,
  addDispatchPreflightRun,
  addDispatchVerificationEvidenceRun,
  normalizeDispatchState,
  replaceDeploymentArtifact,
} from '../src/services/dispatchStorage'
import {
  inspectDeploymentArtifact,
  runDeploymentVerificationChecks,
} from '../src/services/deployPreflight'
import {
  applyDeploySessionChecklistPreset,
  attachEvidenceToDeploySession,
  DEPLOY_SESSION_CHECKLIST_PRESETS,
  MANUAL_DEPLOYMENT_RECORD_CONFIRMATION,
  recordManualDeploymentFromSession,
  startDeploySession,
  updateDeploySession,
  updateDeploySessionStep,
} from '../src/services/deploySessions'
import {
  addHostEvidenceRun,
  addVerificationEvidenceRun,
  compareHostEvidenceRuns,
  compareVerificationEvidenceRuns,
  createHostEvidenceRun,
  createVerificationEvidenceRun,
  formatHostEvidenceProbeLabel,
  normalizeEvidenceRetentionPolicy,
} from '../src/services/dispatchEvidence'
import {
  createHostConnectionStatus,
  getHostConnectionConfig,
  runHostConnectionPreflight,
} from '../server/dispatchApi'
import { flattenProjects } from '../src/domain/atlas'
import { seedWorkspace } from '../src/data/seedWorkspace'
import {
  deriveDispatchQueueItems,
  summarizeArtifactInspectionDetails,
} from '../src/services/dispatchQueue'
import { deriveDispatchCloseoutForTarget } from '../src/services/dispatchCloseout'
import { emptyPlanningStore } from '../src/services/planning'
import { addReportPacket, createReportPacket, emptyReportsStore } from '../src/services/reports'

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

const projectRecords = flattenProjects(seedWorkspace)

function passingPreflightRun(projectId: string, targetId: string): DispatchPreflightRun {
  return {
    id: `preflight-${targetId}`,
    projectId,
    targetId,
    startedAt: '2026-05-10T12:00:00Z',
    completedAt: '2026-05-10T12:01:00Z',
    status: 'passing',
    summary: 'Read-only preflight passed.',
    checks: [],
  }
}

function hostEvidenceRun(
  projectId: string,
  targetId: string,
  status: DispatchHostEvidenceRun['status'] = 'passing',
): DispatchHostEvidenceRun {
  return {
    id: `host-evidence-${targetId}`,
    source: 'host-preflight',
    projectId,
    targetId,
    startedAt: '2026-05-10T12:02:00Z',
    completedAt: '2026-05-10T12:03:00Z',
    status,
    summary:
      status === 'passing'
        ? 'SFTP read-only host inspection passed.'
        : 'Read-only host preflight is not configured for this target.',
    credentialRef: `credential-${targetId}`,
    probeMode: status === 'passing' ? 'sftp-readonly' : 'tcp',
    authMethod: status === 'passing' ? 'password-env' : 'not-configured',
    checks: [],
    warnings:
      status === 'passing' ? [] : ['Read-only host preflight is not configured for this target.'],
  }
}

function verificationEvidenceRun(
  projectId: string,
  targetId: string,
  runbookId: string,
): DispatchVerificationEvidenceRun {
  return {
    id: `verification-evidence-${targetId}`,
    source: 'runbook-verification',
    projectId,
    targetId,
    runbookId,
    startedAt: '2026-05-10T12:04:00Z',
    completedAt: '2026-05-10T12:05:00Z',
    status: 'passing',
    summary: 'Runbook verification checks matched expected statuses.',
    checks: [],
    warnings: [],
  }
}

function inspectRequiredRunbookArtifacts(state: DispatchState, runbookId: string) {
  const runbook = state.runbooks.find((candidate) => candidate.id === runbookId)

  if (!runbook) {
    throw new Error(`Expected runbook ${runbookId}`)
  }

  return runbook.artifacts.reduce(
    (current, artifact) =>
      artifact.required
        ? replaceDeploymentArtifact(current, runbook.id, artifact.id, {
            checksum: `sha256-${artifact.id}`,
            inspectedAt: '2026-05-10T12:00:00Z',
            warnings: [],
          })
        : current,
    state,
  )
}

function completeDeploySessionSteps(state: DispatchState, sessionId: string) {
  const session = state.deploySessions.find((candidate) => candidate.id === sessionId)

  if (!session) {
    throw new Error(`Expected session ${sessionId}`)
  }

  return session.steps.reduce(
    (current, step, index) =>
      updateDeploySessionStep(
        current,
        sessionId,
        step.id,
        {
          status: 'confirmed',
          notes: `Confirmed ${step.kind}.`,
          evidence: `evidence-${step.kind}`,
        },
        new Date(`2026-05-10T12:${String(10 + index).padStart(2, '0')}:00Z`),
      ),
    state,
  )
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
    expect(normalized.hostEvidenceRuns).toEqual([])
    expect(normalized.verificationEvidenceRuns).toEqual([])
    expect(normalized.evidenceRetentionPolicy).toMatchObject({
      hostRunLimit: 50,
      verificationRunLimit: 50,
      preserveFailedRuns: true,
    })
  })

  it('normalizes dispatch evidence retention policy safely', () => {
    expect(
      normalizeEvidenceRetentionPolicy({
        hostRunLimit: 2,
        verificationRunLimit: 500,
        preserveFailedRuns: false,
      }),
    ).toEqual({
      hostRunLimit: 5,
      verificationRunLimit: 50,
      preserveFailedRuns: false,
    })
  })

  it('retains dispatch evidence by normalized policy while preserving failed runs', () => {
    const runs = Array.from({ length: 7 }, (_, index) => ({
      ...hostEvidenceRun('project-1', 'target-1', index === 0 ? 'failed' : 'passing'),
      id: `host-evidence-${index}`,
      startedAt: `2026-05-10T12:0${index}:00Z`,
      completedAt: `2026-05-10T12:0${index}:30Z`,
    }))
    const updated = runs.reduce(
      (current, run) => addHostEvidenceRun(current, run),
      {
        targets: [target],
        records: [],
        readiness: [readiness],
        preflightRuns: [],
        automationReadiness: [],
        runbooks: [],
        orderGroups: [],
        deploySessions: [],
        hostEvidenceRuns: [],
        verificationEvidenceRuns: [],
        evidenceRetentionPolicy: {
          hostRunLimit: 5,
          verificationRunLimit: 5,
          preserveFailedRuns: true,
        },
      } satisfies DispatchState,
    )

    expect(updated.hostEvidenceRuns.map((run) => run.id)).toContain('host-evidence-0')
    expect(updated.hostEvidenceRuns).toHaveLength(6)
  })

  it('summarizes host and verification evidence changes against the previous run', () => {
    const previousHost = {
      ...hostEvidenceRun('project-1', 'target-1'),
      id: 'host-previous',
      checks: [
        {
          id: 'root',
          type: 'target-root',
          label: 'Target root',
          status: 'passing',
          message: 'Found target root.',
          checkedAt: '2026-05-10T12:00:00Z',
          path: '/public_html',
          probeMode: 'sftp-readonly',
          authMethod: 'password-env',
        },
      ],
    } satisfies DispatchHostEvidenceRun
    const currentHost = {
      ...previousHost,
      id: 'host-current',
      checks: [
        {
          ...previousHost.checks[0],
          status: 'failed',
          message: 'Target root missing.',
        },
      ],
    } satisfies DispatchHostEvidenceRun
    const hostComparison = compareHostEvidenceRuns(currentHost, previousHost)

    expect(hostComparison.changed).toBe(true)
    expect(hostComparison.summary).toBe('Changed since last evidence: 1 changed.')

    const previousVerification = verificationEvidenceRun('project-1', 'target-1', 'runbook-1')
    const currentVerification = {
      ...previousVerification,
      id: 'verification-current',
      checks: [
        {
          id: 'homepage',
          label: 'Homepage',
          method: 'HEAD',
          url: 'https://example.com',
          urlPath: '/',
          expectedStatuses: [200],
          protectedResource: false,
          status: 'passing',
          observedStatusCode: 200,
          message: 'Matched expected status.',
          checkedAt: '2026-05-10T12:10:00Z',
        },
      ],
    } satisfies DispatchVerificationEvidenceRun
    const verificationComparison = compareVerificationEvidenceRuns(
      currentVerification,
      previousVerification,
    )

    expect(verificationComparison.summary).toBe('Changed since last evidence: 1 added.')
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
      hostEvidenceRuns: [],
      verificationEvidenceRuns: [],
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
      hostEvidenceRuns: [],
      verificationEvidenceRuns: [],
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
      hostEvidenceRuns: [],
      verificationEvidenceRuns: [],
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

  it('derives Dispatch queue rows in the current cPanel order without mutating state', () => {
    const before = JSON.stringify(seedDispatchState)
    const items = deriveDispatchQueueItems({ dispatch: seedDispatchState, projectRecords })

    expect(items.map((item) => item.runbook.id)).toEqual([
      'mms-cpanel-runbook',
      'mmh-cpanel-runbook',
      'surplus-cpanel-runbook',
      'trbg-cpanel-runbook',
      'bow-wow-cpanel-runbook',
    ])
    expect(items.map((item) => item.order)).toEqual([1, 2, 3, 4, 5])
    expect(items[0]).toMatchObject({
      projectName: 'Midway Mobile Storage website',
      state: 'needs-artifacts',
    })
    expect(JSON.stringify(seedDispatchState)).toBe(before)
  })

  it('derives queue state for active sessions and recorded manual deployments', () => {
    const sessionState = startDeploySession(
      seedDispatchState,
      'mms-cpanel-runbook',
      new Date('2026-05-10T12:00:00Z'),
    )
    const sessionItem = deriveDispatchQueueItems({ dispatch: sessionState, projectRecords })[0]
    const recorded = recordManualDeploymentFromSession(
      sessionState,
      sessionState.deploySessions[0].id,
      MANUAL_DEPLOYMENT_RECORD_CONFIRMATION,
      new Date('2026-05-10T12:30:00Z'),
    )
    const recordedItem = deriveDispatchQueueItems({
      dispatch: recorded.state,
      projectRecords,
    })[0]

    expect(sessionItem.state).toBe('session-active')
    expect(sessionItem.activeSession?.id).toBe(sessionState.deploySessions[0].id)
    expect(recordedItem.state).toBe('recorded')
    expect(recordedItem.latestManualDeploymentRecord?.id).toBe(recorded.recordId)
  })

  it('derives queue state from artifacts and read-only evidence signals', () => {
    const runbook = getRunbookForTarget(seedDispatchState, 'midway-mobile-storage-production')

    if (!runbook) {
      throw new Error('Expected MMS runbook')
    }

    const artifactReady = inspectRequiredRunbookArtifacts(seedDispatchState, runbook.id)
    const missingEvidenceItem = deriveDispatchQueueItems({
      dispatch: artifactReady,
      projectRecords,
    })[0]
    const withEvidence = addDispatchVerificationEvidenceRun(
      addDispatchHostEvidenceRun(
        addDispatchPreflightRun(
          artifactReady,
          passingPreflightRun(runbook.projectId, runbook.targetId),
        ),
        hostEvidenceRun(runbook.projectId, runbook.targetId),
      ),
      verificationEvidenceRun(runbook.projectId, runbook.targetId, runbook.id),
    )
    const readyItem = deriveDispatchQueueItems({ dispatch: withEvidence, projectRecords })[0]
    const missingHostConfig = addDispatchHostEvidenceRun(
      addDispatchPreflightRun(
        artifactReady,
        passingPreflightRun(runbook.projectId, runbook.targetId),
      ),
      hostEvidenceRun(runbook.projectId, runbook.targetId, 'not-configured'),
    )
    const missingHostItem = deriveDispatchQueueItems({
      dispatch: addDispatchVerificationEvidenceRun(
        missingHostConfig,
        verificationEvidenceRun(runbook.projectId, runbook.targetId, runbook.id),
      ),
      projectRecords,
    })[0]

    expect(missingEvidenceItem.state).toBe('needs-evidence')
    expect(missingEvidenceItem.stateDetail).toContain('read-only evidence')
    expect(missingEvidenceItem.artifactSummary.totalRequired).toBe(2)
    expect(missingEvidenceItem.artifactSummary.inspectedRequired).toBe(2)
    expect(readyItem.state).toBe('ready-for-manual-upload')
    expect(readyItem.stateDetail).toContain('outside Atlas')
    expect(readyItem.hostStatus.label).toContain('sftp-readonly')
    expect(readyItem.hostStatus.detail).toContain('SFTP read-only')
    expect(missingHostItem.state).toBe('needs-evidence')
    expect(missingHostItem.warnings.join(' ')).toContain('not configured')
  })

  it('summarizes artifact inspection evidence for operator queue rows', () => {
    const runbook = getRunbookForTarget(seedDispatchState, 'midway-mobile-storage-production')

    if (!runbook) {
      throw new Error('Expected MMS runbook')
    }

    const summary = summarizeArtifactInspectionDetails(runbook.artifacts)
    const inspectedState = inspectRequiredRunbookArtifacts(seedDispatchState, runbook.id)
    const inspectedRunbook = getRunbookForTarget(inspectedState, runbook.targetId)
    const inspectedSummary = inspectedRunbook
      ? summarizeArtifactInspectionDetails(inspectedRunbook.artifacts)
      : null

    expect(summary.totalRequired).toBe(2)
    expect(summary.inspectedRequired).toBe(0)
    expect(summary.lines.join(' ')).toContain('frontend-deploy.zip')
    expect(inspectedSummary?.inspectedRequired).toBe(2)
    expect(inspectedSummary?.lastInspectedAt).toBeTruthy()
  })

  it('derives closeout analytics without mutating dispatch or report state', () => {
    const runbook = getRunbookForTarget(seedDispatchState, 'midway-mobile-storage-production')
    const target = seedDispatchState.targets.find(
      (candidate) => candidate.id === 'midway-mobile-storage-production',
    )

    if (!runbook || !target) {
      throw new Error('Expected MMS runbook and target')
    }

    const reports = emptyReportsStore(new Date('2026-05-10T12:00:00Z'))
    const dispatchBefore = JSON.stringify(seedDispatchState)
    const reportsBefore = JSON.stringify(reports)
    const summary = deriveDispatchCloseoutForTarget({
      dispatch: seedDispatchState,
      reports,
      target,
      runbook,
    })

    expect(summary.state).toBe('not-started')
    expect(summary.requirements.map((requirement) => requirement.id)).toContain('report-packet')
    expect(JSON.stringify(seedDispatchState)).toBe(dispatchBefore)
    expect(JSON.stringify(reports)).toBe(reportsBefore)
  })

  it('derives closeout states for active, completed, and failed-evidence sessions', () => {
    const runbook = getRunbookForTarget(seedDispatchState, 'midway-mobile-storage-production')
    const target = seedDispatchState.targets.find(
      (candidate) => candidate.id === 'midway-mobile-storage-production',
    )

    if (!runbook || !target) {
      throw new Error('Expected MMS runbook and target')
    }

    const artifactReady = inspectRequiredRunbookArtifacts(seedDispatchState, runbook.id)
    const withEvidence = addDispatchVerificationEvidenceRun(
      addDispatchHostEvidenceRun(
        artifactReady,
        hostEvidenceRun(runbook.projectId, runbook.targetId),
      ),
      verificationEvidenceRun(runbook.projectId, runbook.targetId, runbook.id),
    )
    const active = startDeploySession(withEvidence, runbook.id, new Date('2026-05-10T12:00:00Z'))
    const activeSummary = deriveDispatchCloseoutForTarget({ dispatch: active, target })
    const completed = completeDeploySessionSteps(active, active.deploySessions[0].id)
    const completedSummary = deriveDispatchCloseoutForTarget({
      dispatch: completed,
      target,
    })
    const failedActive = startDeploySession(
      artifactReady,
      runbook.id,
      new Date('2026-05-10T12:00:00Z'),
    )
    const failedEvidence = addDispatchHostEvidenceRun(
      completeDeploySessionSteps(failedActive, failedActive.deploySessions[0].id),
      hostEvidenceRun(runbook.projectId, runbook.targetId, 'failed'),
    )
    const failedSummary = deriveDispatchCloseoutForTarget({
      dispatch: addDispatchVerificationEvidenceRun(
        failedEvidence,
        verificationEvidenceRun(runbook.projectId, runbook.targetId, runbook.id),
      ),
      target,
    })

    expect(activeSummary.state).toBe('session-active')
    expect(completedSummary.state).toBe('needs-manual-record')
    expect(failedSummary.state).toBe('needs-evidence')
  })

  it('derives closeout-ready when manual record, evidence, references, and report packet exist', () => {
    const runbook = getRunbookForTarget(seedDispatchState, 'midway-mobile-storage-production')
    const target = seedDispatchState.targets.find(
      (candidate) => candidate.id === 'midway-mobile-storage-production',
    )

    if (!runbook || !target) {
      throw new Error('Expected MMS runbook and target')
    }

    const withEvidence = addDispatchVerificationEvidenceRun(
      addDispatchHostEvidenceRun(
        inspectRequiredRunbookArtifacts(seedDispatchState, runbook.id),
        hostEvidenceRun(runbook.projectId, runbook.targetId),
      ),
      verificationEvidenceRun(runbook.projectId, runbook.targetId, runbook.id),
    )
    const active = startDeploySession(withEvidence, runbook.id, new Date('2026-05-10T12:00:00Z'))
    const completed = completeDeploySessionSteps(active, active.deploySessions[0].id)
    const withReferences = updateDeploySession(
      completed,
      completed.deploySessions[0].id,
      {
        rollbackRef: 'rollback-mms-2026-05-10',
        databaseBackupRef: 'backup-mms-2026-05-10',
      },
      new Date('2026-05-10T12:30:00Z'),
    )
    const recorded = recordManualDeploymentFromSession(
      withReferences,
      withReferences.deploySessions[0].id,
      MANUAL_DEPLOYMENT_RECORD_CONFIRMATION,
      new Date('2026-05-10T12:35:00Z'),
    )
    const packet = createReportPacket({
      type: 'post-deploy-verification-packet',
      projectRecords,
      dispatch: recorded.state,
      reports: emptyReportsStore(new Date('2026-05-10T12:00:00Z')),
      planning: emptyPlanningStore(new Date('2026-05-10T12:00:00Z')),
      writingDrafts: [],
      projectIds: [runbook.projectId],
      writingDraftIds: [],
      now: new Date('2026-05-10T12:40:00Z'),
    })
    const reports = addReportPacket(
      emptyReportsStore(new Date('2026-05-10T12:00:00Z')),
      packet,
      new Date('2026-05-10T12:40:00Z'),
    )
    const summary = deriveDispatchCloseoutForTarget({
      dispatch: recorded.state,
      reports,
      target,
    })

    expect(summary.state).toBe('closeout-ready')
    expect(summary.latestManualDeploymentRecordId).toBe(recorded.recordId)
    expect(summary.latestReportPacketId).toBe(packet.id)
  })

  it('creates deployment readiness report packets from queue scope without mutating sources', () => {
    const runbook = getRunbookForTarget(seedDispatchState, 'midway-mobile-storage-production')

    if (!runbook) {
      throw new Error('Expected MMS runbook')
    }

    const dispatchWithEvidence = addDispatchVerificationEvidenceRun(
      addDispatchHostEvidenceRun(
        addDispatchPreflightRun(
          inspectRequiredRunbookArtifacts(seedDispatchState, runbook.id),
          passingPreflightRun(runbook.projectId, runbook.targetId),
        ),
        hostEvidenceRun(runbook.projectId, runbook.targetId),
      ),
      verificationEvidenceRun(runbook.projectId, runbook.targetId, runbook.id),
    )
    const before = JSON.stringify(dispatchWithEvidence)
    const packet = createReportPacket({
      type: 'deployment-readiness-packet',
      projectRecords,
      dispatch: dispatchWithEvidence,
      planning: emptyPlanningStore(new Date('2026-05-10T12:00:00Z')),
      writingDrafts: [],
      projectIds: [runbook.projectId],
      writingDraftIds: [],
      now: new Date('2026-05-10T12:10:00Z'),
    })

    expect(packet.markdown).toContain('Deployment Runbooks & Artifact Readiness')
    expect(packet.markdown).toContain('frontend-deploy.zip')
    expect(packet.markdown).toContain('/api/.env')
    expect(packet.markdown).toContain('host-evidence-midway-mobile-storage-production')
    expect(packet.markdown).toContain('verification-evidence-midway-mobile-storage-production')
    expect(JSON.stringify(dispatchWithEvidence)).toBe(before)
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

  it('applies deploy session checklist presets only after explicit human action', () => {
    const state = startDeploySession(
      seedDispatchState,
      'mms-cpanel-runbook',
      new Date('2026-05-10T12:00:00Z'),
    )
    const session = state.deploySessions[0]
    const targetsBefore = JSON.stringify(state.targets)
    const readinessBefore = JSON.stringify(state.readiness)
    const updated = applyDeploySessionChecklistPreset(
      state,
      session.id,
      'pre-upload-evidence-reviewed',
      new Date('2026-05-10T12:20:00Z'),
    )
    const updatedSession = updated.deploySessions.find((candidate) => candidate.id === session.id)

    expect(DEPLOY_SESSION_CHECKLIST_PRESETS.map((preset) => preset.id)).toContain(
      'pre-upload-evidence-reviewed',
    )
    expect(
      updatedSession?.steps
        .filter((step) =>
          ['preflight', 'artifact-inspection', 'preserve-paths', 'backup-readiness'].includes(
            step.kind,
          ),
        )
        .every((step) => step.status === 'confirmed'),
    ).toBe(true)
    expect(updatedSession?.events.at(-1)?.detail).toContain('checklist preset')
    expect(JSON.stringify(updated.targets)).toBe(targetsBefore)
    expect(JSON.stringify(updated.readiness)).toBe(readinessBefore)
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

  it('attaches stored evidence only to the selected deploy session', () => {
    const state = startDeploySession(
      startDeploySession(seedDispatchState, 'mms-cpanel-runbook', new Date('2026-05-10T12:00:00Z')),
      'mmh-cpanel-runbook',
      new Date('2026-05-10T12:05:00Z'),
    )
    const mmsSession = state.deploySessions.find(
      (session) => session.runbookId === 'mms-cpanel-runbook',
    )
    const mmhSession = state.deploySessions.find(
      (session) => session.runbookId === 'mmh-cpanel-runbook',
    )
    const targetsBefore = JSON.stringify(state.targets)
    const readinessBefore = JSON.stringify(state.readiness)
    const recordsBefore = JSON.stringify(state.records)

    if (!mmsSession || !mmhSession) {
      throw new Error('Expected deploy sessions')
    }

    const updated = attachEvidenceToDeploySession(
      state,
      mmsSession.id,
      {
        stepKind: 'verification-checks',
        label: 'Verification evidence linked: verification-evidence-e2e',
        detail: 'verification-evidence-e2e: passing at 2026-05-10T12:10:00Z.',
      },
      new Date('2026-05-10T12:15:00Z'),
    )
    const updatedMms = updated.deploySessions.find((session) => session.id === mmsSession.id)
    const updatedMmh = updated.deploySessions.find((session) => session.id === mmhSession.id)

    expect(
      updatedMms?.steps.find((step) => step.kind === 'verification-checks')?.evidence,
    ).toContain('verification-evidence-e2e')
    expect(
      updatedMmh?.steps.find((step) => step.kind === 'verification-checks')?.evidence,
    ).toBe('')
    expect(JSON.stringify(updated.targets)).toBe(targetsBefore)
    expect(JSON.stringify(updated.readiness)).toBe(readinessBefore)
    expect(JSON.stringify(updated.records)).toBe(recordsBefore)
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

  it('stores runbook verification evidence with protected 403/404 results as passing', async () => {
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
    const run = createVerificationEvidenceRun({
      projectId: target.projectId,
      targetId: target.id,
      runbookId: runbook.id,
      evidence,
      now: new Date('2026-05-10T12:05:00Z'),
    })
    const updated = addVerificationEvidenceRun(seedDispatchState, run)

    expect(run.status).toBe('passing')
    expect(run.checks.find((check) => check.urlPath === '/api/.env')).toMatchObject({
      status: 'passing',
      observedStatusCode: 403,
    })
    expect(updated.verificationEvidenceRuns[0].id).toBe(run.id)
    expect(updated.targets).toBe(seedDispatchState.targets)
    expect(updated.readiness).toBe(seedDispatchState.readiness)
    expect(updated.records).toBe(seedDispatchState.records)
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

  it('stores missing host config as scoped host evidence without mutating dispatch posture', async () => {
    const result = await runHostConnectionPreflight({
      target,
      preservePaths: ['/api/.env'],
      config: getHostConnectionConfig({}),
      now: new Date('2026-05-10T12:00:00Z'),
    })
    const run = createHostEvidenceRun({
      projectId: target.projectId,
      result,
      now: new Date('2026-05-10T12:01:00Z'),
    })
    const updated = addHostEvidenceRun(seedDispatchState, run)

    expect(run).toMatchObject({
      source: 'host-preflight',
      projectId: target.projectId,
      targetId: target.id,
      status: 'not-configured',
    })
    expect(run.warnings.join(' ')).toContain('configured')
    expect(updated.hostEvidenceRuns[0].id).toBe(run.id)
    expect(updated.targets).toBe(seedDispatchState.targets)
    expect(updated.readiness).toBe(seedDispatchState.readiness)
    expect(updated.records).toBe(seedDispatchState.records)
    expect(updated.deploySessions).toBe(seedDispatchState.deploySessions)
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
    expect(config.entries[0].probeMode).toBe('local-mirror')
  })

  it('accepts env-var SFTP credential references without returning secrets in status', () => {
    const config = getHostConnectionConfig({
      TARGET_SFTP_PASSWORD: 'never-return-this',
      ATLAS_HOST_PREFLIGHT_CONFIG: JSON.stringify([
        {
          targetId: target.id,
          credentialRef: target.credentialRef,
          probeMode: 'sftp-readonly',
          host: 'cpanel.example.test',
          port: 22,
          username: 'cpanel_user',
          passwordEnvVar: 'TARGET_SFTP_PASSWORD',
        },
      ]),
    })
    const status = createHostConnectionStatus(config)
    const serialized = JSON.stringify(status)

    expect(status.configured).toBe(true)
    expect(status.data.configuredTargets[0]).toMatchObject({
      targetId: target.id,
      credentialRef: target.credentialRef,
      probeMode: 'sftp-readonly',
      authMethod: 'password-env',
      sftpEnabled: true,
    })
    expect(status.data.sftpEnabledCount).toBe(1)
    expect(serialized).not.toContain('never-return-this')
    expect(serialized).not.toContain('cpanel_user')
    expect(serialized).not.toContain('TARGET_SFTP_PASSWORD')
  })

  it('formats host evidence probe labels without exposing secrets', () => {
    expect(
      formatHostEvidenceProbeLabel({
        probeMode: 'sftp-readonly',
        authMethod: 'private-key-env',
        credentialRef: 'godaddy-mms-production',
      }),
    ).toBe('SFTP read-only / private key env ref / godaddy-mms-production')
    expect(
      formatHostEvidenceProbeLabel({
        probeMode: 'tcp',
        authMethod: 'none',
      }),
    ).toBe('TCP reachability / no auth')
  })

  it('stores missing SFTP env credentials as scoped host evidence without mutating posture', async () => {
    const config = getHostConnectionConfig({
      ATLAS_HOST_PREFLIGHT_CONFIG: JSON.stringify([
        {
          targetId: target.id,
          credentialRef: target.credentialRef,
          probeMode: 'sftp-readonly',
          host: 'cpanel.example.test',
          port: 22,
          username: 'cpanel_user',
          passwordEnvVar: 'TARGET_SFTP_PASSWORD',
        },
      ]),
    })
    const result = await runHostConnectionPreflight({
      target: {
        ...target,
        remoteHost: 'cpanel.example.test',
        remoteUser: 'cpanel_user',
        remoteFrontendPath: '/home/cpanel_user/public_html',
        remoteBackendPath: '/home/cpanel_user/public_html/api',
      },
      preservePaths: ['/api/.env'],
      config,
      now: new Date('2026-05-10T12:00:00Z'),
      probeHost: async () => ({
        ok: true,
        message: 'Mock read-only TCP check passed.',
      }),
    })
    const run = createHostEvidenceRun({
      projectId: target.projectId,
      result,
      now: new Date('2026-05-10T12:01:00Z'),
    })
    const updated = addHostEvidenceRun(seedDispatchState, run)

    expect(result.status).toBe('warning')
    expect(result.probeMode).toBe('sftp-readonly')
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'sftp-connect',
          status: 'not-configured',
          authMethod: 'password-env',
        }),
      ]),
    )
    expect(updated.hostEvidenceRuns[0].probeMode).toBe('sftp-readonly')
    expect(updated.targets).toBe(seedDispatchState.targets)
    expect(updated.readiness).toBe(seedDispatchState.readiness)
    expect(updated.records).toBe(seedDispatchState.records)
    expect(updated.deploySessions).toBe(seedDispatchState.deploySessions)
  })

  it('runs mocked SFTP read-only stat and directory summary checks', async () => {
    const statPaths: string[] = []
    const listPaths: string[] = []
    const connectOptions: Record<string, unknown>[] = []
    const client = {
      connect: vi.fn(async (options: Record<string, unknown>) => {
        connectOptions.push(options)
      }),
      stat: vi.fn(async (remotePath: string) => {
        statPaths.push(remotePath)
        return {
          isDirectory:
            remotePath.endsWith('public_html') ||
            remotePath.endsWith('/api') ||
            remotePath.endsWith('/uploads'),
          isFile:
            !remotePath.endsWith('public_html') &&
            !remotePath.endsWith('/api') &&
            !remotePath.endsWith('/uploads'),
        }
      }),
      list: vi.fn(async (remotePath: string) => {
        listPaths.push(remotePath)
        return [{ type: '-' }, { type: 'd' }, { type: 'l' }]
      }),
      end: vi.fn(async () => true),
    }
    const config = getHostConnectionConfig({
      TARGET_SFTP_PASSWORD: 'never-return-this',
      ATLAS_HOST_PREFLIGHT_CONFIG: JSON.stringify([
        {
          targetId: target.id,
          credentialRef: target.credentialRef,
          probeMode: 'sftp-readonly',
          host: 'cpanel.example.test',
          port: 22,
          username: 'cpanel_user',
          passwordEnvVar: 'TARGET_SFTP_PASSWORD',
        },
      ]),
    })
    const result = await runHostConnectionPreflight({
      target: {
        ...target,
        remoteHost: 'cpanel.example.test',
        remoteUser: 'cpanel_user',
        remoteFrontendPath: '/home/cpanel_user/public_html',
        remoteBackendPath: '/home/cpanel_user/public_html/api',
      },
      preservePaths: ['/api/.env', '/api/uploads'],
      config,
      env: { TARGET_SFTP_PASSWORD: 'never-return-this' },
      now: new Date('2026-05-10T12:00:00Z'),
      probeHost: async () => ({
        ok: true,
        message: 'Mock read-only TCP check passed.',
      }),
      createSftp: () => client,
    })

    expect(result.status).toBe('passing')
    expect(result.authMethod).toBe('password-env')
    expect(connectOptions[0]).toMatchObject({
      host: 'cpanel.example.test',
      port: 22,
      username: 'cpanel_user',
      password: 'never-return-this',
    })
    expect(statPaths).toEqual([
      '/home/cpanel_user/public_html',
      '/home/cpanel_user/public_html/api',
      '/home/cpanel_user/public_html/api/.env',
      '/home/cpanel_user/public_html/api/uploads',
    ])
    expect(listPaths).toEqual([
      '/home/cpanel_user/public_html',
      '/home/cpanel_user/public_html/api',
      '/home/cpanel_user/public_html/api/uploads',
    ])
    expect(result.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'sftp-connect', status: 'passing' }),
        expect.objectContaining({
          type: 'target-root',
          status: 'passing',
          entryCount: 3,
          fileCount: 1,
          directoryCount: 1,
          symlinkCount: 1,
        }),
        expect.objectContaining({
          type: 'preserve-path',
          path: '/home/cpanel_user/public_html/api/.env',
          status: 'passing',
        }),
      ]),
    )
    expect(client.end).toHaveBeenCalledTimes(1)
  })

  it('turns SFTP auth and path failures into evidence without throwing', async () => {
    const config = getHostConnectionConfig({
      TARGET_SFTP_PASSWORD: 'never-return-this',
      ATLAS_HOST_PREFLIGHT_CONFIG: JSON.stringify([
        {
          targetId: target.id,
          credentialRef: target.credentialRef,
          probeMode: 'sftp-readonly',
          host: 'cpanel.example.test',
          username: 'cpanel_user',
          passwordEnvVar: 'TARGET_SFTP_PASSWORD',
        },
      ]),
    })
    const authFailure = await runHostConnectionPreflight({
      target: {
        ...target,
        remoteHost: 'cpanel.example.test',
        remoteUser: 'cpanel_user',
        remoteFrontendPath: '/home/cpanel_user/public_html',
        remoteBackendPath: '/home/cpanel_user/public_html/api',
      },
      preservePaths: ['/api/.env'],
      config,
      env: { TARGET_SFTP_PASSWORD: 'never-return-this' },
      now: new Date('2026-05-10T12:00:00Z'),
      probeHost: async () => ({
        ok: true,
        message: 'Mock read-only TCP check passed.',
      }),
      createSftp: () => ({
        connect: vi.fn(async () => {
          throw new Error('Authentication failed.')
        }),
        stat: vi.fn(async () => ({ isDirectory: false, isFile: false })),
        list: vi.fn(async () => []),
        end: vi.fn(async () => true),
      }),
    })
    const pathFailure = await runHostConnectionPreflight({
      target: {
        ...target,
        remoteHost: 'cpanel.example.test',
        remoteUser: 'cpanel_user',
        remoteFrontendPath: '/home/cpanel_user/public_html',
        remoteBackendPath: '/home/cpanel_user/public_html/api',
      },
      preservePaths: ['/api/.env'],
      config,
      env: { TARGET_SFTP_PASSWORD: 'never-return-this' },
      now: new Date('2026-05-10T12:05:00Z'),
      probeHost: async () => ({
        ok: true,
        message: 'Mock read-only TCP check passed.',
      }),
      createSftp: () => ({
        connect: vi.fn(async () => undefined),
        stat: vi.fn(async (remotePath: string) => {
          if (remotePath.endsWith('/api')) {
            throw new Error('No such file.')
          }

          return { isDirectory: true, isFile: false }
        }),
        list: vi.fn(async () => []),
        end: vi.fn(async () => true),
      }),
    })

    expect(authFailure.status).toBe('failed')
    expect(authFailure.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'sftp-connect',
          status: 'failed',
          message: 'Authentication failed.',
        }),
      ]),
    )
    expect(pathFailure.status).toBe('failed')
    expect(pathFailure.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'api-root',
          status: 'failed',
          message: 'No such file.',
        }),
      ]),
    )
  })

  it('does not call SFTP write methods or shell execution from the host inspector', () => {
    const source = readFileSync('server/dispatchApi.ts', 'utf8')

    expect(source).not.toMatch(/\.(put|fastPut|delete|mkdir|rmdir|rename|chmod|exec)\s*\(/)
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
