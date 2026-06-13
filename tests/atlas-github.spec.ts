import { expect, test, type Page } from '@playwright/test'
import { clickAtlasNav } from './helpers/atlasTestUtils'

const commandSummariesRoute = /\/api\/github\/command-summaries(?:\?.*)?$/

function repo(name: string, description: string) {
  return {
    id: name.length,
    name,
    fullName: `jmars319/${name}`,
    private: false,
    description,
    htmlUrl: `https://github.com/jmars319/${name}`,
    defaultBranch: 'main',
    visibility: 'public',
    language: 'TypeScript',
    updatedAt: '2026-05-09T12:00:00Z',
    pushedAt: '2026-05-09T12:00:00Z',
    openIssuesCount: 0,
    stargazersCount: 0,
    forksCount: 0,
    archived: false,
    disabled: false,
  }
}

function commandSummary(
  name: string,
  options: {
    dirty?: boolean
    failed?: boolean
    stale?: boolean
    permissionGap?: boolean
  } = {},
) {
  const repository = repo(name, `${name} overview.`)
  const headSha = options.stale ? 'older1234567890' : 'abcdef1234567890'
  const localGit = {
    ok: name === 'JAMARQ-Atlas',
    configured: true,
    status: name === 'JAMARQ-Atlas' ? 'available' : 'not-found',
    roots: ['/Users/jason_marshall/JAMARQ'],
    data:
      name === 'JAMARQ-Atlas'
        ? {
            owner: 'jmars319',
            repo: 'JAMARQ-Atlas',
            path: '/Users/jason_marshall/JAMARQ/Side Projects/Atlas',
            remoteUrl: 'git@github.com:jmars319/JAMARQ-Atlas.git',
            branch: 'main',
            upstream: 'origin/main',
            dirty: Boolean(options.dirty),
            changedFiles: options.dirty ? 30 : 0,
            ahead: 0,
            behind: 0,
            latestCommit: {
              sha: 'abcdef1234567890',
              shortSha: 'abcdef1',
              subject: 'GitHub checkpoint',
              author: 'Jason',
              date: '2026-05-18T14:00:00Z',
            },
            checkedAt: '2026-05-18T14:05:00Z',
            diagnostic: options.dirty ? '30 changed file(s) detected.' : 'Working tree is clean.',
          }
        : null,
    error:
      name === 'JAMARQ-Atlas'
        ? null
        : {
            type: 'not-found',
            message: `${name} was not found under configured local repo roots.`,
          },
  }
  const failureExplanation =
    options.failed || options.stale
      ? {
          type: 'workflow-run',
          workflowRunId: 10,
          workflowName: 'Atlas CI',
          jobName: 'unit tests',
          stepName: 'npm run test:unit',
          conclusion: 'failure',
          completedAt: '2026-05-18T14:10:00Z',
          htmlUrl: `https://github.com/jmars319/${name}/actions/runs/10`,
          commitSha: headSha,
          stale: Boolean(options.stale),
          staleReason: options.stale ? 'Latest commit differs from run head.' : null,
        }
      : null
  const signals = [
    options.failed || options.stale
      ? {
          id: `jmars319/${name}-workflow-10-failure`,
          category: 'workflow',
          severity: options.stale ? 'warning' : 'danger',
          title: options.stale ? 'Historical workflow failure' : 'Latest workflow failed',
          detail: 'unit tests / npm run test:unit / failure',
          evidence: ['Atlas CI', headSha.slice(0, 7), options.stale ? 'stale' : 'current'],
          occurredAt: '2026-05-18T14:10:00Z',
          url: `https://github.com/jmars319/${name}/actions/runs/10`,
          stale: Boolean(options.stale),
        }
      : null,
    options.dirty
      ? {
          id: `jmars319/${name}-local-dirty`,
          category: 'local-git',
          severity: 'warning',
          title: 'Local clone has changes',
          detail: '30 changed file(s) under /Users/jason_marshall/JAMARQ/Side Projects/Atlas.',
          evidence: ['main', 'origin/main', 'abcdef1'],
          occurredAt: '2026-05-18T14:05:00Z',
          url: null,
          stale: false,
        }
      : null,
    options.permissionGap
      ? {
          id: `jmars319/${name}-permission-checks-insufficient-permission`,
          category: 'permissions',
          severity: 'warning',
          title: 'GitHub data gap',
          detail: 'The token does not have permission to read checks.',
          evidence: ['checks', 'insufficient-permission', 'insufficient'],
          occurredAt: null,
          url: repository.htmlUrl,
          stale: false,
        }
      : null,
  ].filter(Boolean)

  return {
    owner: 'jmars319',
    repo: name,
    fullName: `jmars319/${name}`,
    repository,
    state: options.stale ? 'stale' : signals.length > 0 ? 'attention' : 'healthy',
    severity: options.failed ? 'danger' : signals.length > 0 ? 'warning' : 'muted',
    signals,
    permissionGaps: options.permissionGap
      ? [
          {
            resource: 'checks',
            type: 'insufficient-permission',
            message: 'The token does not have permission to read checks.',
            status: 403,
            permission: 'insufficient',
          },
        ]
      : [],
    latestCommit: {
      sha: 'abcdef1234567890',
      shortSha: 'abcdef1',
      message: 'GitHub checkpoint',
      author: 'Jason',
      date: '2026-05-18T14:00:00Z',
      htmlUrl: `https://github.com/jmars319/${name}/commit/abcdef1`,
      verified: true,
      verificationReason: 'valid',
    },
    latestWorkflowRun: {
      id: 10,
      name: 'Atlas CI',
      displayTitle: 'Atlas CI',
      status: 'completed',
      conclusion: options.failed || options.stale ? 'failure' : 'success',
      headSha,
      branch: 'main',
      event: 'push',
      actor: 'jmars319',
      runNumber: 12,
      runAttempt: 1,
      createdAt: '2026-05-18T14:00:00Z',
      updatedAt: '2026-05-18T14:10:00Z',
      runStartedAt: '2026-05-18T14:01:00Z',
      htmlUrl: `https://github.com/jmars319/${name}/actions/runs/10`,
    },
    latestCheckRun: null,
    latestRelease: null,
    latestDeployment: null,
    failureExplanation,
    localGit,
    counts: {
      openPullRequests: 0,
      openIssues: 0,
      checkRuns: 0,
      branches: 1,
      tags: 1,
    },
    branchNames: ['main'],
    tagNames: ['v0.1.0'],
    fetchedAt: '2026-05-18T14:10:00Z',
    writeControlsEnabled: false,
  }
}

function localGitPreviewResponse(name: string, dirty = false) {
  const available = name === 'JAMARQ-Atlas'
  const statusData = available
    ? {
        owner: 'jmars319',
        repo: 'JAMARQ-Atlas',
        path: '/Users/jason_marshall/JAMARQ/Side Projects/Atlas',
        remoteUrl: 'git@github.com:jmars319/JAMARQ-Atlas.git',
        branch: 'main',
        upstream: 'origin/main',
        dirty,
        changedFiles: dirty ? 2 : 0,
        ahead: 0,
        behind: 0,
        latestCommit: {
          sha: 'abcdef1234567890',
          shortSha: 'abcdef1',
          subject: 'GitHub checkpoint',
          author: 'Jason',
          date: '2026-05-18T14:00:00Z',
        },
        checkedAt: '2026-05-18T14:05:00Z',
        diagnostic: dirty ? '2 changed file(s) detected.' : 'Working tree is clean.',
      }
    : null

  return {
    ok: available,
    configured: true,
    status: available ? 'available' : 'not-found',
    roots: ['/Users/jason_marshall/JAMARQ'],
    data: statusData
      ? {
          status: statusData,
          stagedCount: dirty ? 1 : 0,
          unstagedCount: dirty ? 1 : 0,
          untrackedCount: 0,
          additions: dirty ? 12 : 0,
          deletions: dirty ? 2 : 0,
          changedFiles: dirty
            ? [
                {
                  path: 'src/App.tsx',
                  previousPath: null,
                  indexStatus: ' ',
                  worktreeStatus: 'M',
                  change: 'modified',
                  staged: false,
                  unstaged: true,
                  untracked: false,
                  additions: 10,
                  deletions: 2,
                },
                {
                  path: 'src/services/actionPlanner.ts',
                  previousPath: null,
                  indexStatus: 'A',
                  worktreeStatus: ' ',
                  change: 'added',
                  staged: true,
                  unstaged: false,
                  untracked: false,
                  additions: 2,
                  deletions: 0,
                },
              ]
            : [],
          diffStat: {
            unstaged: dirty ? 'M\tsrc/App.tsx\n src/App.tsx | 12 ++++++++++--' : '',
            staged: dirty ? 'A\tsrc/services/actionPlanner.ts' : '',
          },
          dryRunCommit: {
            available: dirty,
            blocked: true,
            subjectSuggestion: dirty ? 'Review 2 local changes on main' : 'No local changes on main',
            bodyLines: dirty ? ['jmars319/JAMARQ-Atlas', '1 staged file(s).'] : ['Working tree is clean.'],
            commandPreview: [
              'git status --short --branch',
              'git diff --stat',
              'git diff --cached --stat',
              'future locked: git add <reviewed-files>',
            ],
            blockers: [
              'Local Git write execution is locked in this Atlas cycle.',
              'Atlas did not stage, commit, branch, pull, push, reset, stash, or checkout anything.',
            ],
          },
        }
      : null,
    error: available
      ? null
      : {
          type: 'not-found',
          message: `${name} was not found under configured local repo roots.`,
        },
  }
}

async function openGithubDisclosure(page: Page, label: string) {
  const summary = page.locator('details.github-disclosure > summary').filter({ hasText: label })
  const open = await summary.evaluate((element) => {
    const details = element.parentElement as HTMLDetailsElement | null

    return Boolean(details?.open)
  })

  if (!open) {
    await summary.click()
  }
}

function githubStatus() {
  return {
    configured: true,
    githubAppConfigured: true,
    envTokenConfigured: false,
    authenticated: true,
    configuredRepos: ['jmars319/JAMARQ-Atlas', 'jmars319/tenra.dev'],
    authMode: 'github-app-user',
    appSlug: 'atlas-local',
    callbackUrlConfigured: true,
    missingConfig: [],
    user: {
      login: 'jmars319',
      id: 1,
      name: 'Jason',
      avatarUrl: 'https://github.com/images/error/octocat_happy.gif',
      htmlUrl: 'https://github.com/jmars319',
    },
    tokenExpiresAt: '2026-05-18T20:00:00Z',
    refreshTokenExpiresAt: '2026-11-18T20:00:00Z',
    installCount: 1,
    repoCount: 3,
    writeControlsEnabled: false,
    issueCommentPilotEnabled: true,
    permissionPlan: [
      { key: 'metadata', label: 'Metadata', access: 'read', activeControls: false },
      { key: 'contents', label: 'Contents', access: 'write', activeControls: false },
      { key: 'issues', label: 'Issues', access: 'write', activeControls: false },
    ],
    message: 'Signed in as jmars319 with 1 installation(s). Future write controls are locked.',
  }
}

async function installGithubApiMocks(page: Page) {
  await page.route('**/api/github/status', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(githubStatus()),
    })
  })

  await page.route('**/api/github/auth/status', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(githubStatus()),
    })
  })

  await page.route('**/api/github/auth/logout', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        authenticated: false,
        writeControlsEnabled: false,
        issueCommentPilotEnabled: false,
      }),
    })
  })

  await page.route('**/api/git/repositories/status?**', async (route) => {
    const url = new URL(route.request().url())
    const name = url.searchParams.get('repo') ?? 'unknown'
    const available = name === 'JAMARQ-Atlas'

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: available,
        configured: true,
        status: available ? 'available' : 'not-found',
        roots: ['/Users/jason_marshall/JAMARQ'],
        data: available
          ? {
              owner: 'jmars319',
              repo: 'JAMARQ-Atlas',
              path: '/Users/jason_marshall/JAMARQ/Side Projects/Atlas',
              remoteUrl: 'git@github.com:jmars319/JAMARQ-Atlas.git',
              branch: 'main',
              upstream: 'origin/main',
              dirty: false,
              changedFiles: 0,
              ahead: 0,
              behind: 0,
              latestCommit: {
                sha: 'abcdef1234567890',
                shortSha: 'abcdef1',
                subject: 'GitHub checkpoint',
                author: 'Jason',
                date: '2026-05-18T14:00:00Z',
              },
              checkedAt: '2026-05-18T14:05:00Z',
              diagnostic: 'Working tree is clean.',
            }
          : null,
        error: available
          ? null
          : {
              type: 'not-found',
              message: `${name} was not found under configured local repo roots.`,
            },
      }),
    })
  })

  await page.route('**/api/git/repositories/preview?**', async (route) => {
    const url = new URL(route.request().url())
    const name = url.searchParams.get('repo') ?? 'unknown'

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(localGitPreviewResponse(name)),
    })
  })

  await page.route(commandSummariesRoute, async (route) => {
    const url = new URL(route.request().url())
    const repos = (url.searchParams.get('repos') ?? '')
      .split(',')
      .map((fullName) => fullName.split('/')[1])
      .filter(Boolean)

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: repos.map((name) =>
          commandSummary(name, { permissionGap: name === 'JAMARQ-Atlas' }),
        ),
        pageInfo: {
          currentPage: 1,
          hasNextPage: false,
          nextPage: null,
          perPage: 20,
        },
        error: null,
        permission: 'available',
      }),
    })
  })

  await page.route('**/api/github/write/capability?**', async (route) => {
    const url = new URL(route.request().url())
    const owner = url.searchParams.get('owner') ?? 'jmars319'
    const name = url.searchParams.get('repo') ?? 'JAMARQ-Atlas'

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        owner,
        repo: name,
        repositoryKey: `${owner}/${name}`,
        configured: true,
        authenticated: true,
        authMode: 'github-app-user',
        issueCommentPilotEnabled: true,
        writeControlsEnabled: false,
        requiredPermissions: ['Issues: write'],
        blockers: [],
        confirmationPhrases: {
          createIssue: `CREATE ISSUE ${owner}/${name}`,
          createCommentPrefix: `COMMENT ${owner}/${name}#`,
        },
        message: 'GitHub issue/comment pilot is available.',
      }),
    })
  })

  await page.route('**/api/github/write/issues', async (route) => {
    const body = route.request().postDataJSON() as { owner: string; repo: string; title: string }

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        kind: 'create-issue',
        owner: body.owner,
        repo: body.repo,
        repositoryKey: `${body.owner}/${body.repo}`,
        number: 44,
        id: 4400,
        title: body.title,
        htmlUrl: `https://github.com/${body.owner}/${body.repo}/issues/44`,
        apiUrl: `https://api.github.com/repos/${body.owner}/${body.repo}/issues/44`,
        bodyExcerpt: 'Atlas write pilot issue.',
        createdAt: '2026-05-20T12:00:00Z',
        actor: 'jmars319',
        sourceIntentId: null,
        sourceDetailId: null,
        projectId: null,
        writeControlsEnabled: false,
        issueCommentPilotEnabled: true,
        message: `Created GitHub issue in ${body.owner}/${body.repo}.`,
      }),
    })
  })

  await page.route('**/api/github/write/comments', async (route) => {
    const body = route.request().postDataJSON() as {
      owner: string
      repo: string
      issueNumber: number
    }

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        kind: 'create-comment',
        owner: body.owner,
        repo: body.repo,
        repositoryKey: `${body.owner}/${body.repo}`,
        number: body.issueNumber,
        id: 5500,
        title: null,
        htmlUrl: `https://github.com/${body.owner}/${body.repo}/issues/${body.issueNumber}#issuecomment-5500`,
        apiUrl: `https://api.github.com/repos/${body.owner}/${body.repo}/issues/comments/5500`,
        bodyExcerpt: 'Atlas write pilot comment.',
        createdAt: '2026-05-20T12:05:00Z',
        actor: 'jmars319',
        sourceIntentId: null,
        sourceDetailId: `github-issues-${body.owner}/${body.repo}-${body.issueNumber}`,
        projectId: null,
        writeControlsEnabled: false,
        issueCommentPilotEnabled: true,
        message: `Posted GitHub comment to ${body.owner}/${body.repo}#${body.issueNumber}.`,
      }),
    })
  })

  await page.route('**/api/github/repos?**', async (route) => {
    const url = new URL(route.request().url())
    const source = url.searchParams.get('source')
    const data =
      source === 'configured'
        ? [
            repo('JAMARQ-Atlas', 'Local-first operator dashboard.'),
            repo('tenra.dev', 'Software systems platform.'),
          ]
        : [
            repo('tenra.dev', 'Software systems platform.'),
            repo('midway-mobile-storage-website', 'Midway Mobile Storage public website.'),
            repo('new-utility', 'Small utility awaiting triage.'),
          ]

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data,
        pageInfo: {
          currentPage: 1,
          hasNextPage: false,
          nextPage: null,
          perPage: 20,
        },
        error: null,
        permission: 'available',
      }),
    })
  })

  await page.route(
    /\/api\/github\/repos\/jmars319\/[^/]+\/(pulls|issues)\/\d+\/command-detail(?:\?.*)?$/,
    async (route) => {
      const url = new URL(route.request().url())
      const match = url.pathname.match(
        /\/api\/github\/repos\/jmars319\/([^/]+)\/(pulls|issues)\/(\d+)\/command-detail/,
      )
      const name = match?.[1] ?? 'JAMARQ-Atlas'
      const kind = match?.[2] ?? 'issues'
      const number = Number(match?.[3] ?? '12')

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data:
            kind === 'pulls'
              ? {
                  pullRequest: {
                    id: number,
                    number,
                    state: 'open',
                    title: 'Pilot PR detail',
                    draft: false,
                    mergedAt: null,
                    user: 'jmars319',
                    base: 'main',
                    head: 'pilot',
                    createdAt: '2026-05-20T11:00:00Z',
                    updatedAt: '2026-05-20T11:30:00Z',
                    htmlUrl: `https://github.com/jmars319/${name}/pull/${number}`,
                  },
                  bodyExcerpt: 'PR detail for write pilot.',
                  labels: [],
                  assignees: [],
                  requestedReviewers: [],
                  milestone: null,
                  comments: 1,
                  reviewComments: 0,
                  changedFiles: 2,
                  additions: 10,
                  deletions: 1,
                  mergeable: true,
                  headRef: 'pilot',
                  headSha: 'abcdef1234567890',
                  baseRef: 'main',
                  baseSha: '123456abcdef',
                  latestReviewState: null,
                  reviewStates: [],
                  checkRuns: [],
                  checkConclusionCounts: {},
                  htmlUrl: `https://github.com/jmars319/${name}/pull/${number}`,
                  updatedAt: '2026-05-20T11:30:00Z',
                  fetchedAt: '2026-05-20T11:31:00Z',
                  permissionGaps: [],
                  writeControlsEnabled: false,
                }
              : {
                  issue: {
                    id: number,
                    number,
                    state: 'open',
                    title: 'Pilot issue detail',
                    user: 'jmars319',
                    labels: [],
                    comments: 1,
                    createdAt: '2026-05-20T11:00:00Z',
                    updatedAt: '2026-05-20T11:30:00Z',
                    closedAt: null,
                    htmlUrl: `https://github.com/jmars319/${name}/issues/${number}`,
                  },
                  bodyExcerpt: 'Issue detail for write pilot.',
                  labels: [],
                  assignees: [],
                  milestone: null,
                  locked: false,
                  comments: 1,
                  latestCommentAt: '2026-05-20T11:20:00Z',
                  commentPreviews: [],
                  htmlUrl: `https://github.com/jmars319/${name}/issues/${number}`,
                  updatedAt: '2026-05-20T11:30:00Z',
                  fetchedAt: '2026-05-20T11:31:00Z',
                  permissionGaps: [],
                  writeControlsEnabled: false,
                },
          pageInfo: {
            currentPage: 1,
            hasNextPage: false,
            nextPage: null,
            perPage: 20,
          },
          error: null,
          permission: 'available',
        }),
      })
    },
  )

  await page.route(/\/api\/github\/repos\/jmars319\/[^/?]+(?:\/([^/?]+))?(?:\?.*)?$/, async (route) => {
    const url = new URL(route.request().url())
    const match = url.pathname.match(/\/api\/github\/repos\/jmars319\/([^/]+)(?:\/([^/]+))?/)
    const name = match?.[1] ?? 'JAMARQ-Atlas'
    const resource = match?.[2] ?? 'repo'
    const pageNumber = Number(url.searchParams.get('page') ?? '1')
    const pageInfo = {
      currentPage: pageNumber,
      hasNextPage: resource === 'commits' && pageNumber === 1,
      nextPage: resource === 'commits' && pageNumber === 1 ? 2 : null,
      perPage: 20,
    }
    const dataByResource: Record<string, unknown> = {
      repo: repo(name, `${name} overview.`),
      commits: [
        {
          sha: `commit-${pageNumber}`,
          shortSha: `c${pageNumber}c${pageNumber}c${pageNumber}`,
          message: `Commit page ${pageNumber}`,
          author: 'Jason',
          date: '2026-05-09T12:00:00Z',
          htmlUrl: `https://github.com/jmars319/${name}/commit/${pageNumber}`,
          verified: true,
          verificationReason: 'valid',
        },
      ],
      pulls: [
        {
          id: 7,
          number: 7,
          state: 'open',
          title: 'Pilot PR detail',
          draft: false,
          mergedAt: null,
          user: 'jmars319',
          base: 'main',
          head: 'pilot',
          createdAt: '2026-05-20T11:00:00Z',
          updatedAt: '2026-05-20T11:30:00Z',
          htmlUrl: `https://github.com/jmars319/${name}/pull/7`,
        },
      ],
      issues: [
        {
          id: 12,
          number: 12,
          state: 'open',
          title: 'Pilot issue detail',
          user: 'jmars319',
          labels: [],
          comments: 1,
          createdAt: '2026-05-20T11:00:00Z',
          updatedAt: '2026-05-20T11:30:00Z',
          closedAt: null,
          htmlUrl: `https://github.com/jmars319/${name}/issues/12`,
        },
      ],
      workflows: [],
      'workflow-runs': [],
      releases: [],
      deployments: [],
      branches: [
        {
          name: 'main',
          protected: true,
          commitSha: 'abcdef1234567890',
          commitUrl: 'https://api.github.com/repos/jmars319/JAMARQ-Atlas/commits/abcdef1',
        },
      ],
      tags: [
        {
          name: 'v0.1.0',
          commitSha: '123456abcdef',
          zipballUrl: 'https://github.com/jmars319/JAMARQ-Atlas/archive/v0.1.0.zip',
          tarballUrl: 'https://github.com/jmars319/JAMARQ-Atlas/archive/v0.1.0.tar.gz',
        },
      ],
    }

    if (resource === 'checks') {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: null,
          pageInfo,
          error: {
            type: 'insufficient-permission',
            status: 403,
            resource: 'checks',
            message: 'The token does not have permission to read this GitHub resource.',
          },
          permission: 'insufficient',
        }),
      })
      return
    }

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: dataByResource[resource] ?? [],
        pageInfo,
        error: null,
        permission: 'available',
      }),
    })
  })
}

test('operator can connect and import repositories from GitHub command center', async ({ page }) => {
  await installGithubApiMocks(page)

  await page.goto('/')
  await clickAtlasNav(page, 'GitHub')
  await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible()
  await openGithubDisclosure(page, 'Connection and permission details')
  await expect(page.getByLabel('GitHub future controls locked')).toContainText(
    'writeControlsEnabled: false',
  )
  await openGithubDisclosure(page, 'Action planner')
  const actionPlanner = page.getByRole('region', { name: 'Action Planner' })
  await expect(actionPlanner).toContainText('writeControlsEnabled: false')
  await expect(actionPlanner).toContainText('investigate checks data gap')
  await expect(page.getByText(/Installed repos: 3 repos \/ issue comments/)).toBeVisible()
  await openGithubDisclosure(page, 'Suggested placement')
  await openGithubDisclosure(page, 'Repository inventory')
  const placementSuggestions = page.getByLabel('Suggested repository placement')
  await expect(placementSuggestions).toContainText('jmars319/midway-mobile-storage-website')
  await expect(placementSuggestions).toContainText('Midway Mobile Storage website')
  const mmsSuggestion = placementSuggestions
    .locator('.github-suggestion-card')
    .filter({ hasText: 'jmars319/midway-mobile-storage-website' })
  await mmsSuggestion.getByRole('button', { name: 'Connect to Midway Mobile Storage website' }).click()
  await expect(
    page.locator('.github-intake-card').filter({ hasText: 'jmars319/midway-mobile-storage-website' }),
  ).toContainText('Connected to Midway Mobile Storage website')
  await page.reload()
  await page.locator('button.project-row').filter({ hasText: 'Midway Mobile Storage' }).click()
  await expect(page.locator('.repo-list')).toContainText('jmars319/midway-mobile-storage-website')
  await clickAtlasNav(page, 'GitHub')
  await openGithubDisclosure(page, 'Suggested placement')
  await openGithubDisclosure(page, 'Repository inventory')
  await expect(page.locator('.github-intake-card').filter({ hasText: 'jmars319/tenra.dev' })).toBeVisible()
  const deepDive = page.getByLabel('GitHub selected repo details')
  await expect(deepDive).toContainText('jmars319/JAMARQ-Atlas')
  await expect(deepDive).toContainText('main / clean / 0 ahead / 0 behind')
  await expect(page.getByLabel('Local Git preview')).toContainText('Commit execution')
  await expect(page.getByLabel('Local Git preview')).toContainText('locked')
  await deepDive.getByRole('tab', { name: 'Branches' }).click()
  await expect(deepDive).toContainText('Protected branch')
  await deepDive.getByRole('tab', { name: 'Tags' }).click()
  await expect(deepDive).toContainText('v0.1.0')
  await deepDive.getByRole('tab', { name: 'Checks' }).click()
  await expect(deepDive).toContainText('insufficient-permission')
  await deepDive.getByRole('tab', { name: 'Commits' }).click()
  await expect(deepDive).toContainText('Commit page 1')
  await expect(deepDive).toContainText(/fresh fetch|cache hit/)
  await deepDive.getByRole('button', { name: 'Load more' }).click()
  await expect(deepDive).toContainText('Commit page 2')

  await page.getByLabel('Project to show or connect').selectOption('vaexcore-studio')
  const tenraCard = page.locator('.github-intake-card').filter({ hasText: 'jmars319/tenra.dev' })
  await tenraCard.getByRole('button', { name: 'Connect to selected project' }).click()
  await expect(tenraCard).toContainText('Connected to VaexCore Studio')

  await page.reload()
  await page.locator('button.project-row').filter({ hasText: 'VaexCore Studio' }).click()
  await expect(page.locator('.repo-list')).toContainText('jmars319/tenra.dev')

  await clickAtlasNav(page, 'GitHub')
  await openGithubDisclosure(page, 'Suggested placement')
  await openGithubDisclosure(page, 'Repository inventory')
  const utilitySuggestion = placementSuggestions
    .locator('.github-suggestion-card')
    .filter({ hasText: 'jmars319/new-utility' })
  await utilitySuggestion.getByRole('button', { name: 'Create Inbox project' }).click()
  const utilityCard = page.locator('.github-intake-card').filter({ hasText: 'jmars319/new-utility' })
  await expect(utilityCard).toContainText('Connected to new-utility')

  await clickAtlasNav(page, 'Board')
  await page.locator('button.project-row').filter({ hasText: 'new-utility' }).click()
  await expect(page.getByRole('heading', { name: 'new-utility' })).toBeVisible()
  await expect(page.locator('label.field').filter({ hasText: 'Status' }).locator('select')).toHaveValue(
    'Inbox',
  )
})

test('GitHub command center labels zero repositories as connection required', async ({ page }) => {
  await page.route('**/api/github/status', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        configured: false,
        githubAppConfigured: false,
        envTokenConfigured: false,
        authenticated: false,
        configuredRepos: [],
        authMode: 'none',
        appSlug: '',
        callbackUrlConfigured: false,
        missingConfig: ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY'],
        user: null,
        tokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        installCount: 0,
        repoCount: 0,
        writeControlsEnabled: false,
        issueCommentPilotEnabled: false,
        permissionPlan: [],
        message: 'GitHub connection is not configured.',
      }),
    })
  })

  await page.route('**/api/github/repos?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [],
        pageInfo: {
          currentPage: 1,
          hasNextPage: false,
          nextPage: null,
          perPage: 100,
        },
        error: {
          type: 'missing-token',
          status: 401,
          resource: 'repos',
          message:
            'Sign in with the configured GitHub App, or set GITHUB_TOKEN/GH_TOKEN for legacy local fallback.',
        },
        permission: 'missing-token',
      }),
    })
  })

  await page.route(commandSummariesRoute, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [],
        pageInfo: {
          currentPage: 1,
          hasNextPage: false,
          nextPage: null,
          perPage: 20,
        },
        error: {
          type: 'missing-token',
          status: 401,
          resource: 'command-summaries',
          message: 'GitHub connection is not configured.',
        },
        permission: 'missing-token',
      }),
    })
  })

  await page.goto('/')
  await clickAtlasNav(page, 'GitHub')

  await expect(page.getByLabel('GitHub command counts')).toContainText('Connection required')
  await expect(page.getByLabel('GitHub connection required')).toContainText(
    '0 repositories means Atlas could not read GitHub yet',
  )
  await expect(page.getByLabel('GitHub connection required')).toContainText(
    'sign-in or token required',
  )
})

test('GitHub command center auto-loads later installed repo pages for search', async ({ page }) => {
  await page.route('**/api/github/status', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ...githubStatus(),
        configuredRepos: [],
        repoCount: 2,
      }),
    })
  })

  await page.route('**/api/git/repositories/status?**', async (route) => {
    const url = new URL(route.request().url())
    const name = url.searchParams.get('repo') ?? 'unknown'
    const available = name === 'JAMARQ-Atlas'

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: available,
        configured: true,
        status: available ? 'available' : 'not-found',
        roots: ['/Users/jason_marshall/JAMARQ'],
        data: available
          ? {
              owner: 'jmars319',
              repo: 'JAMARQ-Atlas',
              path: '/Users/jason_marshall/JAMARQ/Side Projects/Atlas',
              remoteUrl: 'git@github.com:jmars319/JAMARQ-Atlas.git',
              branch: 'main',
              upstream: 'origin/main',
              dirty: true,
              changedFiles: 30,
              ahead: 0,
              behind: 0,
              latestCommit: null,
              checkedAt: '2026-05-19T20:05:00Z',
              diagnostic: '30 changed file(s) detected.',
            }
          : null,
        error: available
          ? null
          : {
              type: 'not-found',
              message: `${name} was not found under configured local repo roots.`,
            },
      }),
    })
  })

  await page.route('**/api/git/repositories/preview?**', async (route) => {
    const url = new URL(route.request().url())
    const name = url.searchParams.get('repo') ?? 'unknown'

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify(localGitPreviewResponse(name, name === 'JAMARQ-Atlas')),
    })
  })

  await page.route('**/api/github/repos?**', async (route) => {
    const url = new URL(route.request().url())
    const source = url.searchParams.get('source')
    const pageNumber = Number(url.searchParams.get('page') ?? '1')
    const isInstalledFirstPage = source === 'viewer' && pageNumber === 1
    const data =
      source === 'configured'
        ? []
        : isInstalledFirstPage
          ? [repo('Assembly', 'Assembly repo on the first installed page.')]
          : [repo('JAMARQ-Atlas', 'Local-first operator dashboard.')]

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data,
        pageInfo: {
          currentPage: pageNumber,
          hasNextPage: isInstalledFirstPage,
          nextPage: isInstalledFirstPage ? 2 : null,
          perPage: 100,
        },
        error: null,
        permission: 'available',
      }),
    })
  })

  await page.route(/\/api\/github\/repos\/jmars319\/[^/?]+(?:\/([^?]+))?/, async (route) => {
    const url = new URL(route.request().url())
    const match = url.pathname.match(/\/api\/github\/repos\/jmars319\/([^/]+)(?:\/([^/]+))?/)
    const name = match?.[1] ?? 'JAMARQ-Atlas'
    const resource = match?.[2] ?? 'repo'

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: resource === 'repo' ? repo(name, `${name} overview.`) : [],
        pageInfo: {
          currentPage: 1,
          hasNextPage: false,
          nextPage: null,
          perPage: 20,
        },
        error: null,
        permission: 'available',
      }),
    })
  })

  await page.route(commandSummariesRoute, async (route) => {
    const url = new URL(route.request().url())
    const repos = (url.searchParams.get('repos') ?? '')
      .split(',')
      .map((fullName) => fullName.split('/')[1])
      .filter(Boolean)

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: repos.map((name) => commandSummary(name, { dirty: name === 'JAMARQ-Atlas' })),
        pageInfo: {
          currentPage: 1,
          hasNextPage: false,
          nextPage: null,
          perPage: 20,
        },
        error: null,
        permission: 'available',
      }),
    })
  })

  await page.goto('/')
  await clickAtlasNav(page, 'GitHub')

  await expect(page.getByPlaceholder('Search repositories')).toBeVisible()
  await expect(
    page.locator('.github-intake-card').filter({ hasText: 'jmars319/Assembly' }),
  ).toHaveCount(1)
  await expect(
    page.locator('.github-intake-card').filter({ hasText: 'jmars319/JAMARQ-Atlas' }),
  ).toHaveCount(1)
  await page.getByPlaceholder('Search repositories').fill('JAMARQ-Atlas')
  await expect(
    page.locator('.github-intake-card').filter({ hasText: 'jmars319/JAMARQ-Atlas' }),
  ).toBeVisible()
  await expect(
    page.locator('.github-intake-card').filter({ hasText: 'jmars319/Assembly' }),
  ).toHaveCount(0)
})

test('GitHub command center shows advisory failure and stale evidence', async ({ page }) => {
  await installGithubApiMocks(page)
  await page.unroute(commandSummariesRoute)
  await page.route(commandSummariesRoute, async (route) => {
    const url = new URL(route.request().url())
    const repos = (url.searchParams.get('repos') ?? '')
      .split(',')
      .map((fullName) => fullName.split('/')[1])
      .filter(Boolean)

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: repos.map((name) =>
          name === 'tenra.dev'
            ? commandSummary(name, { stale: true })
            : commandSummary(name, { dirty: true, failed: true, permissionGap: true }),
        ),
        pageInfo: {
          currentPage: 1,
          hasNextPage: false,
          nextPage: null,
          perPage: 20,
        },
        error: null,
        permission: 'available',
      }),
    })
  })

  await page.goto('/')
  await clickAtlasNav(page, 'GitHub')
  const deepDive = page.getByLabel('GitHub selected repo details')

  await expect(deepDive).toContainText('Latest workflow failed')
  await expect(deepDive).toContainText('unit tests / npm run test:unit / failure')
  await expect(deepDive).toContainText('Local clone has changes')
  await expect(deepDive).toContainText('GitHub data gap')
  await expect(page.getByLabel('GitHub command bands')).toContainText('Local dirty clones')
  await page.getByLabel('Selected repository menu').selectOption('jmars319/tenra.dev')
  await expect(deepDive).toContainText('Historical workflow failure')
  await expect(deepDive).toContainText('Historical failure')
})

test('GitHub write pilot creates issues and comments with typed confirmation', async ({ page }) => {
  await installGithubApiMocks(page)

  await page.goto('/')
  await clickAtlasNav(page, 'GitHub')

  await openGithubDisclosure(page, 'Action planner')
  const actionPlanner = page.getByRole('region', { name: 'Action Planner' })
  // selector-intentional-first: action planner can render duplicate draft buttons across responsive controls.
  await actionPlanner.getByRole('button', { name: 'Draft GitHub issue' }).first().click()
  const writeDialog = page.getByRole('dialog', { name: 'Draft GitHub Issue' })
  await expect(writeDialog).toBeVisible()
  await expect(writeDialog.getByRole('button', { name: 'Create issue' })).toBeDisabled()
  await writeDialog.getByPlaceholder('CREATE ISSUE jmars319/JAMARQ-Atlas').fill(
    'CREATE ISSUE jmars319/JAMARQ-Atlas',
  )
  await writeDialog.getByRole('button', { name: 'Create issue' }).click()
  await expect(writeDialog).toContainText('Created GitHub issue in jmars319/JAMARQ-Atlas')
  await writeDialog.getByRole('button', { name: 'Close' }).click()

  const deepDive = page.getByLabel('GitHub selected repo details')
  await deepDive.getByRole('tab', { name: 'Issues' }).click()
  await deepDive.getByRole('button', { name: 'Detail' }).click()
  await expect(page.getByLabel('GitHub PR or issue detail')).toContainText(
    'Issue detail for write pilot',
  )
  await page.getByLabel('GitHub PR or issue detail').getByRole('button', { name: 'Draft comment' }).click()

  const commentDialog = page.getByRole('dialog', { name: 'Draft GitHub Comment' })
  await expect(commentDialog.getByRole('button', { name: 'Post comment' })).toBeDisabled()
  await commentDialog.getByPlaceholder('COMMENT jmars319/JAMARQ-Atlas#12').fill(
    'COMMENT jmars319/JAMARQ-Atlas#12',
  )
  await commentDialog.getByRole('button', { name: 'Post comment' }).click()
  await expect(commentDialog).toContainText('Posted GitHub comment to jmars319/JAMARQ-Atlas#12')
  await commentDialog.getByRole('button', { name: 'Close' }).click()

  await clickAtlasNav(page, 'Review')
  const reviewNotes = page.getByLabel('Review notes', { exact: true })
  await expect(reviewNotes).toContainText('GitHub issue created')
  await expect(reviewNotes).toContainText('GitHub comment posted')
  await expect(reviewNotes).toContainText('Open on GitHub')
})

test('settings shows GitHub App sign-in state without active write controls', async ({ page }) => {
  await installGithubApiMocks(page)

  await page.goto('/')
  await clickAtlasNav(page, 'Settings')
  const checkpoint = page.getByLabel('GitHub App auth checkpoint')

  await expect(checkpoint).toContainText('Signed in as jmars319')
  await expect(checkpoint).toContainText('Installed repos visible')
  await expect(checkpoint).toContainText('controls are locked: false')
  await expect(checkpoint.getByRole('button', { name: 'Sign out' })).toBeVisible()
})
