import { describe, expect, it } from 'vitest'
import { seedWorkspace } from '../src/data/seedWorkspace'
import { flattenProjects } from '../src/domain/atlas'
import type { GithubRepoCommandSummary } from '../src/services/githubCommand'
import {
  addRepoOperationsSnapshot,
  deriveRepoOperationsRows,
  filterRepoOperationsRows,
  normalizeRepoOperationsSnapshot,
  normalizeRepoOperationsState,
  repoOperationsPlanningDetail,
  repoOperationsSourceLink,
  summarizeRepoOperationRows,
} from '../src/services/repoOperations'

const packet = {
  schemaVersion: 1,
  kind: 'repo-operations',
  id: 'repo-ops-test',
  title: 'Repo Ops Test',
  generatedAt: '2026-05-29T12:00:00.000Z',
  source: 'test registry',
  summary: {
    repoCount: 2,
    activeCount: 2,
    verificationCommandCount: 1,
    missingVerificationCount: 1,
  },
  repositories: [
    {
      id: 'atlas',
      name: 'Atlas',
      suite: 'JAMARQ',
      product: 'Atlas',
      lifecycle: 'active',
      deployCategory: 'local app',
      localPathHint: 'Apps/Atlas',
      githubRemote: 'https://github.com/jmars319/JAMARQ-Atlas',
      packageManagers: ['npm'],
      verificationCommands: ['npm run lint'],
      docs: [{ label: 'README', path: 'README.md' }],
      projectHints: [{ projectId: 'jamarq-atlas', label: 'Atlas' }],
      notes: 'Primary repo command center.',
    },
    {
      id: 'unbound',
      name: 'Unbound',
      suite: 'Other',
      product: 'Other',
      lifecycle: 'active',
      deployCategory: 'website',
      localPathHint: 'Websites/unbound',
      githubRemote: 'https://github.com/example/unbound',
      packageManagers: ['npm'],
      verificationCommands: [],
      docs: [],
      projectHints: [],
      notes: '',
    },
  ],
}

function atlasCommandSummary(): GithubRepoCommandSummary {
  return {
    fullName: 'jmars319/JAMARQ-Atlas',
    localGit: {
      ok: true,
      configured: true,
      status: 'available',
      roots: [],
      error: null,
      data: {
        owner: 'jmars319',
        repo: 'JAMARQ-Atlas',
        path: '/tmp/Atlas',
        remoteUrl: 'https://github.com/jmars319/JAMARQ-Atlas',
        branch: 'main',
        upstream: 'origin/main',
        dirty: true,
        changedFiles: 2,
        ahead: 0,
        behind: 1,
        latestCommit: {
          sha: 'abc1234',
          shortSha: 'abc1234',
          subject: 'docs: update',
          author: 'Test',
          date: '2026-05-29T12:00:00.000Z',
        },
        checkedAt: '2026-05-29T12:00:00.000Z',
        diagnostic: 'dirty',
      },
    },
  } as unknown as GithubRepoCommandSummary
}

describe('repo operations', () => {
  it('normalizes imported repo operations snapshots', () => {
    const snapshot = normalizeRepoOperationsSnapshot(packet)

    expect(snapshot?.kind).toBe('repo-operations')
    expect(snapshot?.repositories).toHaveLength(2)
    expect(snapshot?.repositories[0].githubOwner).toBe('jmars319')
    expect(snapshot?.summary.missingVerificationCount).toBe(1)
  })

  it('derives repo workflow rows from registry, Atlas bindings, and local Git evidence', () => {
    const snapshot = normalizeRepoOperationsSnapshot(packet)!
    const state = addRepoOperationsSnapshot(normalizeRepoOperationsState({}), snapshot)
    const rows = deriveRepoOperationsRows({
      state,
      projectRecords: flattenProjects(seedWorkspace),
      commandSummaries: [atlasCommandSummary()],
    })

    const atlasRow = rows.find((row) => row.repository.id === 'atlas')!
    const unboundRow = rows.find((row) => row.repository.id === 'unbound')!

    expect(atlasRow.boundProject?.project.id).toBe('jamarq-atlas')
    expect(atlasRow.gaps).toEqual(
      expect.arrayContaining([
        'dirty-local-clone',
        'behind-upstream',
        'missing-planning-follow-up',
      ]),
    )
    expect(unboundRow.gaps).toEqual(
      expect.arrayContaining([
        'missing-github-binding',
        'missing-verification-command',
        'missing-planning-follow-up',
      ]),
    )
    expect(summarizeRepoOperationRows(rows).dirty).toBe(1)
    expect(repoOperationsSourceLink(atlasRow.repository)).toMatchObject({
      type: 'repo-operations',
      id: 'atlas',
    })
    expect(repoOperationsPlanningDetail(atlasRow)).toContain('Local status: main / 2 changed')
  })

  it('filters rows by suite, query, lifecycle, and gap', () => {
    const snapshot = normalizeRepoOperationsSnapshot(packet)!
    const state = addRepoOperationsSnapshot(normalizeRepoOperationsState({}), snapshot)
    const rows = deriveRepoOperationsRows({
      state,
      projectRecords: flattenProjects(seedWorkspace),
      commandSummaries: [atlasCommandSummary()],
    })

    expect(filterRepoOperationsRows(rows, { query: 'atlas', suite: 'all', lifecycle: 'all', gap: 'all' }))
      .toHaveLength(1)
    expect(
      filterRepoOperationsRows(rows, {
        query: '',
        suite: 'JAMARQ',
        lifecycle: 'active',
        gap: 'behind-upstream',
      }),
    ).toHaveLength(1)
  })

  it('derives failed and stale Atlas workflow gaps from local run history', () => {
    const snapshot = normalizeRepoOperationsSnapshot(packet)!
    const state = addRepoOperationsSnapshot(normalizeRepoOperationsState({}), snapshot)
    const rows = deriveRepoOperationsRows({
      state,
      projectRecords: flattenProjects(seedWorkspace),
      commandSummaries: [atlasCommandSummary()],
      workflowRuns: [
        {
          id: 'run-1',
          repositoryId: 'atlas',
          owner: 'jmars319',
          repo: 'JAMARQ-Atlas',
          command: { kind: 'verify-command', command: 'npm run lint' },
          commandLabel: 'npm run lint',
          status: 'failed',
          startedAt: '2026-05-29T12:00:00.000Z',
          endedAt: '2026-05-29T12:01:00.000Z',
          exitCode: 1,
          outputExcerpt: 'lint failed',
          planningItemId: '',
          diagnostic: 'Verification failed.',
        },
      ],
    })
    const atlasRow = rows.find((row) => row.repository.id === 'atlas')!

    expect(atlasRow.gaps).toEqual(expect.arrayContaining(['failed-workflow-run', 'never-run-verification']))
    expect(summarizeRepoOperationRows(rows).failedWorkflowRuns).toBe(1)
    expect(filterRepoOperationsRows(rows, { query: '', suite: 'all', lifecycle: 'all', gap: 'failed-workflow-run' }))
      .toHaveLength(1)
  })
})
