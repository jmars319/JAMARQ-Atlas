import { describe, expect, it } from 'vitest'
import type { ProjectRecord } from '../src/domain/atlas'
import {
  createAtlasActionDryRunPlan,
  deriveAtlasActionIntents,
  deriveAtlasProjectActionRollup,
  evaluateAtlasActionExecutionGate,
} from '../src/services/actionPlanner'
import type { GithubRepoCommandSummary } from '../src/services/githubCommand'

function projectRecord(): ProjectRecord {
  return {
    section: { id: 'systems', name: 'Systems', summary: '', groups: [] },
    group: { id: 'local', name: 'Local', summary: '', projects: [] },
    project: {
      id: 'atlas',
      name: 'Atlas',
      kind: 'app',
      summary: 'Operator dashboard.',
      repositories: [
        {
          owner: 'jmars319',
          name: 'JAMARQ-Atlas',
          defaultBranch: 'main',
          url: 'https://github.com/jmars319/JAMARQ-Atlas',
        },
      ],
      links: [],
      activity: [],
      manual: {
        status: 'Active',
        verificationCadence: 'weekly',
        nextAction: '',
        lastMeaningfulChange: '',
        lastVerified: '',
        currentRisk: '',
        blockers: [],
        deferredItems: [],
        notDoingItems: [],
        notes: [],
        decisions: [],
      },
    },
  }
}

function summary(update: Partial<GithubRepoCommandSummary> = {}): GithubRepoCommandSummary {
  return {
    owner: 'jmars319',
    repo: 'JAMARQ-Atlas',
    fullName: 'jmars319/JAMARQ-Atlas',
    repository: {
      id: 1,
      name: 'JAMARQ-Atlas',
      fullName: 'jmars319/JAMARQ-Atlas',
      private: false,
      description: 'Atlas dashboard.',
      htmlUrl: 'https://github.com/jmars319/JAMARQ-Atlas',
      defaultBranch: 'main',
      visibility: 'public',
      language: 'TypeScript',
      updatedAt: '2026-05-19T12:00:00Z',
      pushedAt: '2026-05-19T12:00:00Z',
      openIssuesCount: 1,
      stargazersCount: 0,
      forksCount: 0,
      archived: false,
      disabled: false,
    },
    state: 'attention',
    severity: 'danger',
    signals: [
      {
        id: 'jmars319/JAMARQ-Atlas-workflow-10-failure',
        category: 'workflow',
        severity: 'danger',
        title: 'Latest workflow failed',
        detail: 'unit tests / npm run test:unit / failure',
        evidence: ['Atlas CI', 'abcdef1', 'current'],
        occurredAt: '2026-05-19T12:10:00Z',
        url: 'https://github.com/jmars319/JAMARQ-Atlas/actions/runs/10',
        stale: false,
      },
    ],
    permissionGaps: [],
    latestCommit: {
      sha: 'abcdef1234567890',
      shortSha: 'abcdef1',
      message: 'Planner checkpoint',
      author: 'Jason',
      date: '2026-05-19T12:00:00Z',
      htmlUrl: 'https://github.com/jmars319/JAMARQ-Atlas/commit/abcdef1',
      verified: true,
      verificationReason: 'valid',
    },
    latestWorkflowRun: null,
    latestCheckRun: null,
    latestRelease: null,
    latestDeployment: null,
    failureExplanation: {
      type: 'workflow-run',
      workflowRunId: 10,
      workflowName: 'Atlas CI',
      jobName: 'unit tests',
      stepName: 'npm run test:unit',
      conclusion: 'failure',
      completedAt: '2026-05-19T12:10:00Z',
      htmlUrl: 'https://github.com/jmars319/JAMARQ-Atlas/actions/runs/10',
      commitSha: 'abcdef1234567890',
      stale: false,
      staleReason: null,
    },
    localGit: {
      ok: true,
      configured: true,
      status: 'available',
      roots: ['/Users/jason_marshall/JAMARQ'],
      data: {
        owner: 'jmars319',
        repo: 'JAMARQ-Atlas',
        path: '/Users/jason_marshall/JAMARQ/Side Projects/Atlas',
        remoteUrl: 'git@github.com:jmars319/JAMARQ-Atlas.git',
        branch: 'main',
        upstream: 'origin/main',
        dirty: true,
        changedFiles: 3,
        ahead: 0,
        behind: 0,
        latestCommit: null,
        checkedAt: '2026-05-19T12:11:00Z',
        diagnostic: '3 changed file(s) detected.',
      },
      error: null,
    },
    counts: {
      openPullRequests: 1,
      openIssues: 1,
      checkRuns: 0,
      branches: 1,
      tags: 0,
    },
    branchNames: ['main'],
    tagNames: [],
    fetchedAt: '2026-05-19T12:11:00Z',
    writeControlsEnabled: false,
    ...update,
  }
}

describe('Atlas action planner', () => {
  it('derives deterministic planner intents from command summary evidence', () => {
    const intents = deriveAtlasActionIntents({
      projectRecords: [projectRecord()],
      summaries: [summary()],
    })

    expect(intents.map((intent) => intent.kind)).toEqual(
      expect.arrayContaining([
        'investigate-failed-ci',
        'prepare-commit',
        'review-dirty-local-changes',
        'review-open-issue',
        'review-open-pr',
        'prepare-deployment-readiness',
      ]),
    )
    expect(intents.every((intent) => intent.locked)).toBe(true)
    expect(new Set(intents.map((intent) => intent.id)).size).toBe(intents.length)
  })

  it('creates locked dry-run plans for future GitHub and local Git mutations', () => {
    const intents = deriveAtlasActionIntents({
      projectRecords: [projectRecord()],
      summaries: [summary()],
    })
    const commitIntent = intents.find((intent) => intent.kind === 'prepare-commit')
    const ciIntent = intents.find((intent) => intent.kind === 'investigate-failed-ci')

    expect(commitIntent).toBeDefined()
    expect(ciIntent).toBeDefined()

    const commitPlan = createAtlasActionDryRunPlan(commitIntent!)
    const ciGate = evaluateAtlasActionExecutionGate(ciIntent!)

    expect(commitPlan.status).toBe('locked')
    expect(commitPlan.writeControlsEnabled).toBe(false)
    expect(commitPlan.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          commandPreview: 'git add <reviewed-files> && git commit -m <message>',
          locked: true,
          mutating: true,
        }),
      ]),
    )
    expect(ciGate.locked).toBe(true)
    expect(ciGate.blockers.join(' ')).toContain('No GitHub')
  })

  it('rolls up project action state without changing project status', () => {
    const record = projectRecord()
    const intents = deriveAtlasActionIntents({
      projectRecords: [record],
      summaries: [summary()],
    })
    const rollup = deriveAtlasProjectActionRollup({ projectRecord: record, intents })

    expect(rollup.projectId).toBe('atlas')
    expect(rollup.totalIntents).toBeGreaterThan(0)
    expect(rollup.highestRisk).toBe('high')
    expect(rollup.dirtyLocalRepoCount).toBe(1)
    expect(rollup.failedOrStaleCiCount).toBe(1)
    expect(record.project.manual.status).toBe('Active')
  })
})
