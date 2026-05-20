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
      body: JSON.stringify({ ok: true, authenticated: false, writeControlsEnabled: false }),
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

  await page.route(/\/api\/github\/repos\/jmars319\/[^/?]+(?:\/([^?]+))?/, async (route) => {
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
      pulls: [],
      issues: [],
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

test('operator can bind and import repositories from GitHub intake', async ({ page }) => {
  await installGithubApiMocks(page)

  await page.goto('/')
  await clickAtlasNav(page, 'GitHub')
  await expect(page.getByRole('heading', { name: 'Command Center' })).toBeVisible()
  await expect(page.getByLabel('GitHub future controls locked')).toContainText(
    'writeControlsEnabled: false',
  )
  await expect(page.getByText('Installed repos: 3 repos')).toBeVisible()
  const placementSuggestions = page.getByLabel('Suggested repository placement')
  await expect(placementSuggestions).toContainText('jmars319/midway-mobile-storage-website')
  await expect(placementSuggestions).toContainText('Midway Mobile Storage website')
  const mmsSuggestion = placementSuggestions
    .locator('.github-suggestion-card')
    .filter({ hasText: 'jmars319/midway-mobile-storage-website' })
  await mmsSuggestion.getByRole('button', { name: 'Bind to Midway Mobile Storage website' }).click()
  await expect(
    page.locator('.github-intake-card').filter({ hasText: 'jmars319/midway-mobile-storage-website' }),
  ).toContainText('Bound to Midway Mobile Storage website')
  await page.reload()
  await page.locator('button.project-row').filter({ hasText: 'Midway Mobile Storage' }).click()
  await expect(page.locator('.repo-list')).toContainText('jmars319/midway-mobile-storage-website')
  await clickAtlasNav(page, 'GitHub')
  await expect(page.locator('.github-intake-card').filter({ hasText: 'jmars319/tenra.dev' })).toBeVisible()
  const deepDive = page.getByLabel('GitHub repo deep dive')
  await expect(deepDive).toContainText('jmars319/JAMARQ-Atlas')
  await expect(deepDive).toContainText('main / clean / 0 ahead / 0 behind')
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

  await page.getByLabel('Target project').selectOption('vaexcore-studio')
  const tenraCard = page.locator('.github-intake-card').filter({ hasText: 'jmars319/tenra.dev' })
  await tenraCard.getByRole('button', { name: 'Bind to selected' }).click()
  await expect(tenraCard).toContainText('Bound to VaexCore Studio')

  await page.reload()
  await page.locator('button.project-row').filter({ hasText: 'VaexCore Studio' }).click()
  await expect(page.locator('.repo-list')).toContainText('jmars319/tenra.dev')

  await clickAtlasNav(page, 'GitHub')
  const utilitySuggestion = placementSuggestions
    .locator('.github-suggestion-card')
    .filter({ hasText: 'jmars319/new-utility' })
  await utilitySuggestion.getByRole('button', { name: 'Create Inbox project' }).click()
  const utilityCard = page.locator('.github-intake-card').filter({ hasText: 'jmars319/new-utility' })
  await expect(utilityCard).toContainText('Bound to new-utility')

  await clickAtlasNav(page, 'Board')
  await page.locator('button.project-row').filter({ hasText: 'new-utility' }).click()
  await expect(page.getByRole('heading', { name: 'new-utility' })).toBeVisible()
  await expect(page.locator('label.field').filter({ hasText: 'Status' }).locator('select')).toHaveValue(
    'Inbox',
  )
})

test('GitHub intake auto-loads later installed repo pages for search', async ({ page }) => {
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

  await expect(page.getByText('Installed repos: 2 repos')).toBeVisible()
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
  const deepDive = page.getByLabel('GitHub repo deep dive')

  await expect(deepDive).toContainText('Latest workflow failed')
  await expect(deepDive).toContainText('unit tests / npm run test:unit / failure')
  await expect(deepDive).toContainText('Local clone has changes')
  await expect(deepDive).toContainText('GitHub data gap')
  await expect(page.getByLabel('GitHub command bands')).toContainText('Local dirty clones')
  await page.getByLabel('Deep dive repository').selectOption('jmars319/tenra.dev')
  await expect(deepDive).toContainText('Historical workflow failure')
  await expect(deepDive).toContainText('Historical failure')
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
