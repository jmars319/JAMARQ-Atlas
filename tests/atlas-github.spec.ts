import { expect, test, type Page } from '@playwright/test'
import { clickAtlasNav } from './helpers/atlasTestUtils'

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

async function installGithubApiMocks(page: Page) {
  await page.route('**/api/github/status', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        configuredRepos: ['jmars319/JAMARQ-Atlas', 'jmars319/tenra.dev'],
        authMode: 'server-env',
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
  await expect(page.getByRole('heading', { name: 'Repository Intake' })).toBeVisible()
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
