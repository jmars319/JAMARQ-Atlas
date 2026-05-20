import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildGithubRepoCommandSummary, githubApiMiddleware } from '../server/githubApi'
import {
  deriveGithubProjectCommandRollup,
  deriveGithubRepoCommandSummary,
  type GithubFailureExplanation,
} from '../src/services/githubCommand'
import type {
  GithubCheckRun,
  GithubCommit,
  GithubRepositorySummary,
  GithubWorkflowRun,
} from '../src/services/githubIntegration'
import type { LocalGitRepositoryStatusResponse } from '../src/services/localGit'

const repository: GithubRepositorySummary = {
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
  openIssuesCount: 0,
  stargazersCount: 0,
  forksCount: 0,
  archived: false,
  disabled: false,
}

const latestCommit: GithubCommit = {
  sha: 'latest1234567890',
  shortSha: 'latest1',
  message: 'Latest commit',
  author: 'Jason',
  date: '2026-05-19T12:00:00Z',
  htmlUrl: 'https://github.com/jmars319/JAMARQ-Atlas/commit/latest1',
  verified: true,
  verificationReason: 'valid',
}

const passingCheck: GithubCheckRun = {
  id: 20,
  name: 'Atlas CI',
  status: 'completed',
  conclusion: 'success',
  startedAt: '2026-05-19T12:01:00Z',
  completedAt: '2026-05-19T12:03:00Z',
  htmlUrl: 'https://github.com/jmars319/JAMARQ-Atlas/checks/20',
  app: 'GitHub Actions',
  detailsUrl: null,
}

function workflowRun(update: Partial<GithubWorkflowRun> = {}): GithubWorkflowRun {
  return {
    id: 10,
    name: 'Atlas CI',
    displayTitle: 'Atlas CI',
    status: 'completed',
    conclusion: 'success',
    headSha: latestCommit.sha,
    branch: 'main',
    event: 'push',
    actor: 'jmars319',
    runNumber: 42,
    runAttempt: 1,
    createdAt: '2026-05-19T12:00:00Z',
    updatedAt: '2026-05-19T12:04:00Z',
    runStartedAt: '2026-05-19T12:01:00Z',
    htmlUrl: 'https://github.com/jmars319/JAMARQ-Atlas/actions/runs/10',
    ...update,
  }
}

function localGit(
  update: Partial<NonNullable<LocalGitRepositoryStatusResponse['data']>> = {},
): LocalGitRepositoryStatusResponse {
  return {
    ok: true,
    configured: true,
    status: 'available',
    roots: ['/Users/jason_marshall/JAMARQ'],
    data: {
      owner: 'jmars319',
      repo: 'JAMARQ-Atlas',
      path: '/Users/jason_marshall/JAMARQ/Atlas',
      remoteUrl: 'git@github.com:jmars319/JAMARQ-Atlas.git',
      branch: 'main',
      upstream: 'origin/main',
      dirty: false,
      changedFiles: 0,
      ahead: 0,
      behind: 0,
      latestCommit: null,
      checkedAt: '2026-05-19T12:05:00Z',
      diagnostic: 'Working tree is clean.',
      ...update,
    },
    error: null,
  }
}

function commandSummaryInput(update: Partial<Parameters<typeof deriveGithubRepoCommandSummary>[0]> = {}) {
  return {
    owner: 'jmars319',
    repo: 'JAMARQ-Atlas',
    repository,
    latestCommit,
    openPullRequests: [],
    openIssues: [],
    latestWorkflowRun: workflowRun(),
    latestCheckRun: passingCheck,
    checkRuns: [passingCheck],
    latestRelease: null,
    latestDeployment: null,
    branches: [
      {
        name: 'main',
        protected: true,
        commitSha: latestCommit.sha,
        commitUrl: 'https://api.github.com/repos/jmars319/JAMARQ-Atlas/commits/latest1',
      },
    ],
    tags: [],
    localGit: localGit(),
    githubErrors: [],
    failureExplanation: null,
    fetchedAt: '2026-05-19T12:05:00Z',
    ...update,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('GitHub command summaries', () => {
  it('derives danger attention from current failed workflow evidence', () => {
    const failure: GithubFailureExplanation = {
      type: 'workflow-run',
      workflowRunId: 10,
      workflowName: 'Atlas CI',
      jobName: 'test',
      stepName: 'npm run test:unit',
      conclusion: 'failure',
      completedAt: '2026-05-19T12:04:00Z',
      htmlUrl: 'https://github.com/jmars319/JAMARQ-Atlas/actions/runs/10/job/1',
      commitSha: latestCommit.sha,
      stale: false,
      staleReason: null,
    }
    const summary = deriveGithubRepoCommandSummary(
      commandSummaryInput({
        latestWorkflowRun: workflowRun({ conclusion: 'failure' }),
        failureExplanation: failure,
      }),
    )

    expect(summary.state).toBe('attention')
    expect(summary.severity).toBe('danger')
    expect(summary.failureExplanation).toMatchObject({
      jobName: 'test',
      stepName: 'npm run test:unit',
    })
    expect(summary.signals.some((signal) => signal.title === 'Latest workflow failed')).toBe(true)
  })

  it('labels failed workflow evidence as stale when repo head moved on', () => {
    const summary = deriveGithubRepoCommandSummary(
      commandSummaryInput({
        latestWorkflowRun: workflowRun({
          conclusion: 'failure',
          headSha: 'older1234567890',
        }),
        failureExplanation: {
          type: 'workflow-run',
          workflowRunId: 10,
          workflowName: 'Atlas CI',
          jobName: 'build',
          stepName: 'npm run build',
          conclusion: 'failure',
          completedAt: '2026-05-19T11:00:00Z',
          htmlUrl: 'https://github.com/jmars319/JAMARQ-Atlas/actions/runs/10',
          commitSha: 'older1234567890',
          stale: true,
          staleReason: 'Latest commit differs from run head.',
        },
      }),
    )

    expect(summary.state).toBe('stale')
    expect(summary.severity).toBe('warning')
    expect(summary.signals.map((signal) => signal.title)).toEqual(
      expect.arrayContaining(['Latest workflow is historical', 'Historical workflow failure']),
    )
  })

  it('promotes permission gaps and local dirty state into evidence signals', () => {
    const summary = deriveGithubRepoCommandSummary(
      commandSummaryInput({
        checkRuns: [],
        latestCheckRun: null,
        localGit: localGit({ dirty: true, changedFiles: 4 }),
        githubErrors: [
          {
            type: 'insufficient-permission',
            status: 403,
            resource: 'deployments',
            message: 'Deployment access is not available.',
          },
        ],
      }),
    )

    expect(summary.permissionGaps).toContainEqual(
      expect.objectContaining({ resource: 'deployments', permission: 'insufficient' }),
    )
    expect(summary.signals.map((signal) => signal.title)).toEqual(
      expect.arrayContaining(['Local clone has changes', 'GitHub data gap']),
    )
  })

  it('derives project rollups from bound repository summaries', () => {
    const clean = deriveGithubRepoCommandSummary(commandSummaryInput())
    const dirty = deriveGithubRepoCommandSummary(
      commandSummaryInput({
        repo: 'tenra.dev',
        repository: { ...repository, name: 'tenra.dev', fullName: 'jmars319/tenra.dev' },
        openIssues: [
          {
            id: 1,
            number: 2,
            state: 'open',
            title: 'Open issue',
            user: 'Jason',
            labels: [],
            comments: 0,
            createdAt: '2026-05-19T12:00:00Z',
            updatedAt: '2026-05-19T12:00:00Z',
            closedAt: null,
            htmlUrl: 'https://github.com/jmars319/tenra.dev/issues/2',
          },
        ],
        localGit: localGit({ repo: 'tenra.dev', dirty: true, changedFiles: 2 }),
      }),
    )
    const rollup = deriveGithubProjectCommandRollup({
      projectId: 'atlas',
      projectName: 'Atlas',
      repositories: [
        { owner: 'jmars319', name: 'JAMARQ-Atlas', defaultBranch: 'main', url: '' },
        { owner: 'jmars319', name: 'tenra.dev', defaultBranch: 'main', url: '' },
      ],
      summaries: [clean, dirty],
    })

    expect(rollup.boundRepoCount).toBe(2)
    expect(rollup.loadedRepoCount).toBe(2)
    expect(rollup.dirtyLocalRepoCount).toBe(1)
    expect(rollup.openIssues).toBe(1)
    expect(rollup.severity).toBe('warning')
  })

  it('aggregates GitHub resources and failed job steps on the server route foundation', async () => {
    const rawRepo = {
      id: 1,
      name: 'JAMARQ-Atlas',
      full_name: 'jmars319/JAMARQ-Atlas',
      private: false,
      html_url: 'https://github.com/jmars319/JAMARQ-Atlas',
      default_branch: 'main',
      visibility: 'public',
      language: 'TypeScript',
      updated_at: '2026-05-19T12:00:00Z',
      pushed_at: '2026-05-19T12:00:00Z',
      open_issues_count: 0,
      stargazers_count: 0,
      forks_count: 0,
      archived: false,
      disabled: false,
    }
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)

      if (url.includes('/actions/runs/10/jobs')) {
        return new Response(
          JSON.stringify({
            jobs: [
              {
                id: 100,
                name: 'unit tests',
                status: 'completed',
                conclusion: 'failure',
                completed_at: '2026-05-19T12:06:00Z',
                html_url: 'https://github.com/jmars319/JAMARQ-Atlas/actions/runs/10/job/100',
                steps: [
                  {
                    name: 'npm run test:unit',
                    status: 'completed',
                    conclusion: 'failure',
                    completed_at: '2026-05-19T12:05:00Z',
                  },
                ],
              },
            ],
          }),
          { status: 200 },
        )
      }

      if (url.endsWith('/repos/jmars319/JAMARQ-Atlas')) {
        return new Response(JSON.stringify(rawRepo), { status: 200 })
      }

      if (url.includes('/commits?')) {
        return new Response(
          JSON.stringify([
            {
              sha: latestCommit.sha,
              html_url: latestCommit.htmlUrl,
              commit: {
                message: latestCommit.message,
                author: {
                  name: 'Jason',
                  date: latestCommit.date,
                },
                verification: {
                  verified: true,
                  reason: 'valid',
                },
              },
              author: {
                login: 'jmars319',
              },
            },
          ]),
          { status: 200 },
        )
      }

      if (url.includes('/actions/runs?')) {
        return new Response(
          JSON.stringify({
            workflow_runs: [
              {
                id: 10,
                name: 'Atlas CI',
                display_title: 'Atlas CI',
                status: 'completed',
                conclusion: 'failure',
                head_sha: latestCommit.sha,
                head_branch: 'main',
                event: 'push',
                run_number: 12,
                run_attempt: 1,
                created_at: '2026-05-19T12:00:00Z',
                updated_at: '2026-05-19T12:06:00Z',
                run_started_at: '2026-05-19T12:01:00Z',
                html_url: 'https://github.com/jmars319/JAMARQ-Atlas/actions/runs/10',
                actor: { login: 'jmars319' },
              },
            ],
          }),
          { status: 200 },
        )
      }

      if (url.includes('/check-runs?')) {
        return new Response(JSON.stringify({ check_runs: [] }), { status: 200 })
      }

      if (url.includes('/branches?')) {
        return new Response(JSON.stringify([{ name: 'main', protected: true, commit: { sha: latestCommit.sha } }]), {
          status: 200,
        })
      }

      if (
        url.includes('/pulls?') ||
        url.includes('/issues?') ||
        url.includes('/releases?') ||
        url.includes('/deployments?') ||
        url.includes('/tags?')
      ) {
        return new Response(JSON.stringify([]), { status: 200 })
      }

      return new Response(JSON.stringify({ message: `Unexpected URL ${url}` }), { status: 404 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const summary = await buildGithubRepoCommandSummary({
      owner: 'jmars319',
      repo: 'JAMARQ-Atlas',
      auth: {
        mode: 'github-app-user',
        token: 'token',
        session: null,
        error: null,
      },
      env: {},
    })

    expect(summary.failureExplanation).toMatchObject({
      jobName: 'unit tests',
      stepName: 'npm run test:unit',
      conclusion: 'failure',
    })
    expect(summary.severity).toBe('danger')
  })

  it('keeps command summary API routes GET-only', async () => {
    const chunks: string[] = []
    const response = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn((chunk: string) => {
        chunks.push(chunk)
      }),
    }

    await githubApiMiddleware(
      {
        method: 'POST',
        url: '/api/github/command-summaries?repos=jmars319/JAMARQ-Atlas',
      } as Parameters<typeof githubApiMiddleware>[0],
      response as unknown as Parameters<typeof githubApiMiddleware>[1],
    )

    expect(response.statusCode).toBe(405)
    expect(chunks.join('')).toContain('read-only GET routes only')
  })

  it('normalizes read-only pull request command detail routes', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'ghp_test')
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input)

      if (url.endsWith('/repos/jmars319/JAMARQ-Atlas/pulls/7')) {
        return new Response(
          JSON.stringify({
            id: 7,
            number: 7,
            state: 'open',
            title: 'Planner preview',
            draft: false,
            merged_at: null,
            user: { login: 'jmars319' },
            base: { ref: 'main', sha: 'base1234567890' },
            head: { ref: 'planner', sha: 'head1234567890' },
            labels: [{ name: 'review' }],
            assignees: [{ login: 'jmars319' }],
            requested_reviewers: [{ login: 'reviewer' }],
            comments: 2,
            review_comments: 1,
            changed_files: 3,
            additions: 20,
            deletions: 4,
            mergeable: true,
            body: 'Adds command detail evidence.',
            created_at: '2026-05-19T12:00:00Z',
            updated_at: '2026-05-19T12:10:00Z',
            html_url: 'https://github.com/jmars319/JAMARQ-Atlas/pull/7',
          }),
          { status: 200 },
        )
      }

      if (url.includes('/pulls/7/reviews')) {
        return new Response(
          JSON.stringify([{ id: 1, state: 'APPROVED', submitted_at: '2026-05-19T12:08:00Z' }]),
          { status: 200 },
        )
      }

      if (url.includes('/pulls/7/files')) {
        return new Response(JSON.stringify([{ filename: 'src/App.tsx' }]), { status: 200 })
      }

      if (url.includes('/commits/head1234567890/check-runs')) {
        return new Response(
          JSON.stringify({
            check_runs: [
              {
                id: 5,
                name: 'Atlas CI',
                status: 'completed',
                conclusion: 'success',
                started_at: '2026-05-19T12:01:00Z',
                completed_at: '2026-05-19T12:06:00Z',
                html_url: 'https://github.com/jmars319/JAMARQ-Atlas/checks/5',
                app: { name: 'GitHub Actions' },
              },
            ],
          }),
          { status: 200 },
        )
      }

      return new Response(JSON.stringify({ message: `Unexpected URL ${url}` }), { status: 404 })
    })
    const chunks: string[] = []
    const response = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn((chunk: string) => {
        chunks.push(chunk)
      }),
    }
    vi.stubGlobal('fetch', fetchMock)

    await githubApiMiddleware(
      {
        method: 'GET',
        url: '/api/github/repos/jmars319/JAMARQ-Atlas/pulls/7/command-detail',
        headers: {},
      } as Parameters<typeof githubApiMiddleware>[0],
      response as unknown as Parameters<typeof githubApiMiddleware>[1],
    )
    const body = JSON.parse(chunks.join(''))

    expect(response.statusCode).toBe(200)
    expect(body.data).toMatchObject({
      changedFiles: 3,
      additions: 20,
      deletions: 4,
      latestReviewState: 'APPROVED',
      checkConclusionCounts: { success: 1 },
      writeControlsEnabled: false,
    })
    expect(body.data.permissionGaps).toEqual([])
  })

  it('normalizes read-only issue command detail permission gaps', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'ghp_test')
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: Parameters<typeof fetch>[0]) => {
        const url = String(input)

        if (url.endsWith('/repos/jmars319/JAMARQ-Atlas/issues/9')) {
          return new Response(
            JSON.stringify({
              id: 9,
              number: 9,
              state: 'open',
              title: 'Planner issue',
              user: { login: 'jmars319' },
              labels: [{ name: 'bug' }],
              assignees: [],
              comments: 1,
              locked: false,
              body: 'Issue body.',
              created_at: '2026-05-19T12:00:00Z',
              updated_at: '2026-05-19T12:10:00Z',
              closed_at: null,
              html_url: 'https://github.com/jmars319/JAMARQ-Atlas/issues/9',
            }),
            { status: 200 },
          )
        }

        if (url.includes('/issues/9/comments')) {
          return new Response(JSON.stringify({ message: 'Forbidden' }), { status: 403 })
        }

        return new Response(JSON.stringify({ message: `Unexpected URL ${url}` }), { status: 404 })
      }),
    )
    const chunks: string[] = []
    const response = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn((chunk: string) => {
        chunks.push(chunk)
      }),
    }

    await githubApiMiddleware(
      {
        method: 'GET',
        url: '/api/github/repos/jmars319/JAMARQ-Atlas/issues/9/command-detail',
        headers: {},
      } as Parameters<typeof githubApiMiddleware>[0],
      response as unknown as Parameters<typeof githubApiMiddleware>[1],
    )
    const body = JSON.parse(chunks.join(''))

    expect(body.data).toMatchObject({
      comments: 1,
      labels: ['bug'],
      writeControlsEnabled: false,
    })
    expect(body.data.permissionGaps).toEqual([
      expect.objectContaining({
        resource: 'issue-comments',
        type: 'insufficient-permission',
        permission: 'insufficient',
      }),
    ])
  })
})
