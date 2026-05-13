import { describe, expect, it } from 'vitest'
import type {
  GithubCommit,
  GithubIssue,
  GithubPullRequest,
  GithubWorkflowRun,
} from '../src/services/githubIntegration'
import { deriveGithubHealthSummary } from '../src/services/githubHealth'

const commits: GithubCommit[] = [
  {
    sha: 'abcdef123456',
    shortSha: 'abcdef1',
    message: 'Deployable change',
    author: 'Jason',
    date: '2026-05-10T12:00:00Z',
    htmlUrl: 'https://github.com/example/repo/commit/abcdef1',
    verified: true,
    verificationReason: 'valid',
  },
  {
    sha: '123456abcdef',
    shortSha: '123456a',
    message: 'Earlier change',
    author: 'Jason',
    date: '2026-05-01T12:00:00Z',
    htmlUrl: 'https://github.com/example/repo/commit/123456a',
    verified: true,
    verificationReason: 'valid',
  },
]

const pulls: GithubPullRequest[] = [
  {
    id: 1,
    number: 12,
    state: 'open',
    title: 'Open PR',
    draft: false,
    mergedAt: null,
    user: 'Jason',
    base: 'main',
    head: 'feature',
    createdAt: '2026-05-10T10:00:00Z',
    updatedAt: '2026-05-10T11:00:00Z',
    htmlUrl: 'https://github.com/example/repo/pull/12',
  },
]

const issues: GithubIssue[] = [
  {
    id: 2,
    number: 3,
    state: 'open',
    title: 'Open issue',
    user: 'Jason',
    labels: [],
    comments: 0,
    createdAt: '2026-05-10T10:00:00Z',
    updatedAt: '2026-05-10T11:00:00Z',
    closedAt: null,
    htmlUrl: 'https://github.com/example/repo/issues/3',
  },
]

const workflowRuns: GithubWorkflowRun[] = [
  {
    id: 3,
    name: 'CI',
    displayTitle: 'CI',
    status: 'completed',
    conclusion: 'success',
    branch: 'main',
    event: 'push',
    actor: 'Jason',
    runNumber: 8,
    runAttempt: 1,
    createdAt: '2026-05-10T12:00:00Z',
    updatedAt: '2026-05-10T12:10:00Z',
    runStartedAt: '2026-05-10T12:01:00Z',
    htmlUrl: 'https://github.com/example/repo/actions/runs/3',
  },
]

describe('GitHub health summaries', () => {
  it('derives advisory repo health and deploy delta counts without decisions', () => {
    const summary = deriveGithubHealthSummary({
      commits,
      pulls,
      issues,
      workflowRuns,
      releases: [],
      deployments: [],
      checks: [],
      lastVerified: '2026-05-05',
      lastDeployed: '2026-05-02T12:00:00Z',
      errors: [
        {
          type: 'insufficient-permission',
          status: 403,
          resource: 'checks',
          message: 'No checks permission.',
        },
      ],
    })

    expect(summary.latestCommit?.shortSha).toBe('abcdef1')
    expect(summary.commitsSinceLastVerified).toBe(1)
    expect(summary.commitsSinceLastDeployed).toBe(1)
    expect(summary.openPullRequests).toBe(1)
    expect(summary.openIssues).toBe(1)
    expect(summary.latestWorkflowResult).toBe('success')
    expect(summary.permissionGaps).toContain('checks: insufficient-permission')
  })

  it('uses unknown delta counts when no comparison date exists', () => {
    const summary = deriveGithubHealthSummary({
      commits,
      pulls: [],
      issues: [],
      workflowRuns: [],
      releases: [],
      deployments: [],
      checks: [],
      lastVerified: '',
      lastDeployed: '',
      errors: [],
    })

    expect(summary.commitsSinceLastVerified).toBeNull()
    expect(summary.commitsSinceLastDeployed).toBeNull()
  })
})
