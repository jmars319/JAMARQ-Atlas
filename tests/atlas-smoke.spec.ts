import { expect, test } from '@playwright/test'

test('operator can edit manual state and generate a writing prompt', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'JAMARQ Atlas' })).toBeVisible()
  await expect(page.getByLabel('Atlas status board')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Active' })).toBeVisible()

  await page.getByRole('button', { name: 'GitHub' }).click()
  await expect(page.getByRole('heading', { name: 'Repository Intake' })).toBeVisible()
  await expect(page.locator('.github-error')).toContainText(/Set GITHUB_TOKEN|GH_TOKEN/)
  await page.getByRole('button', { name: 'Board', exact: true }).click()

  await page.getByRole('button', { name: 'Verification', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Verification Queue' })).toBeVisible()
  await expect(page.getByLabel('Project verification queue')).toBeVisible()
  await page.getByLabel('Filter by cadence').selectOption('monthly')
  await expect(page.getByLabel('Project verification queue')).toContainText('Monthly')

  const verificationCadenceField = page
    .locator('label.field')
    .filter({ hasText: 'Verification cadence' })
    .locator('select')
  const verificationNoteField = page
    .locator('label.field')
    .filter({ hasText: 'Verification note' })
    .locator('textarea')
  const lastVerifiedField = page
    .locator('label.field')
    .filter({ hasText: 'Last verified' })
    .locator('input')
  const statusBeforeVerification = await page
    .locator('label.field')
    .filter({ hasText: 'Status' })
    .locator('select')
    .inputValue()
  const today = new Date().toISOString().slice(0, 10)

  await verificationCadenceField.selectOption('weekly')
  await page.reload()
  await expect(verificationCadenceField).toHaveValue('weekly')
  await verificationNoteField.fill('E2E verification note')
  await page.getByRole('button', { name: 'Mark verified today' }).click()
  await expect(lastVerifiedField).toHaveValue(today)
  await expect(page.locator('label.field').filter({ hasText: 'Status' }).locator('select')).toHaveValue(
    statusBeforeVerification,
  )
  await expect(page.locator('.project-detail')).toContainText('E2E verification note')

  await page.getByRole('button', { name: 'Board', exact: true }).click()

  await page.getByRole('button', { name: 'Dispatch' }).click()
  await expect(page.getByRole('heading', { name: 'Deployment Readiness' })).toBeVisible()
  await expect(page.locator('button.dispatch-card').filter({ hasText: 'Midway Music Hall production' })).toBeVisible()
  await page.locator('button.dispatch-card').filter({ hasText: 'Midway Music Hall production' }).click()

  const detail = page.locator('.project-detail')
  await expect(detail.getByRole('heading', { name: 'Midway Music Hall production' })).toBeVisible()
  const deploymentNotesField = detail
    .locator('label.field')
    .filter({ hasText: 'Deployment notes' })
    .locator('textarea')

  await deploymentNotesField.fill('E2E dispatch note')
  await page.reload()
  await expect(deploymentNotesField).toHaveValue('E2E dispatch note')

  await page.getByRole('button', { name: 'Board', exact: true }).click()
  await page.locator('button.project-row').filter({ hasText: 'VaexCore Studio' }).click()
  await expect(page.getByRole('heading', { name: 'VaexCore Studio' })).toBeVisible()
  await expect(page.getByText('No deployment target configured for this project')).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible()
  await expect(page.locator('.github-error')).toContainText(/missing-token|Set GITHUB_TOKEN/)

  const statusField = detail.locator('label.field').filter({ hasText: 'Status' }).locator('select')
  const nextActionField = detail
    .locator('label.field')
    .filter({ hasText: 'Next action' })
    .locator('textarea')

  await statusField.selectOption('Waiting')
  await nextActionField.fill('Interaction check persisted next action')
  await page.getByRole('button', { name: 'Summarize activity' }).click()

  await expect(page.locator('.draft-output')).toHaveValue(/Do not decide or change status/)

  await page.reload()
  await page.locator('button.project-row').filter({ hasText: 'VaexCore Studio' }).click()
  await expect(nextActionField).toHaveValue('Interaction check persisted next action')

  await page.getByRole('button', { name: 'Reset seed' }).click()
  await page.reload()
  await page.locator('button.project-row').filter({ hasText: 'VaexCore Studio' }).click()
  await expect(nextActionField).not.toHaveValue('Interaction check persisted next action')
})

test('operator can bind and import repositories from GitHub intake', async ({ page }) => {
  const repo = (name: string, description: string) => ({
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
  })

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

  await page.goto('/')
  await page.getByRole('button', { name: 'GitHub' }).click()
  await expect(page.getByRole('heading', { name: 'Repository Intake' })).toBeVisible()
  await expect(page.locator('.github-intake-card').filter({ hasText: 'jmars319/tenra.dev' })).toBeVisible()

  await page.getByLabel('Target project').selectOption('vaexcore-studio')
  const tenraCard = page.locator('.github-intake-card').filter({ hasText: 'jmars319/tenra.dev' })
  await tenraCard.getByRole('button', { name: 'Bind to selected' }).click()
  await expect(tenraCard).toContainText('Bound to VaexCore Studio')

  await page.reload()
  await page.locator('button.project-row').filter({ hasText: 'VaexCore Studio' }).click()
  await expect(page.locator('.repo-list')).toContainText('jmars319/tenra.dev')

  await page.getByRole('button', { name: 'GitHub' }).click()
  const utilityCard = page.locator('.github-intake-card').filter({ hasText: 'jmars319/new-utility' })
  await utilityCard.getByRole('button', { name: 'Create Inbox project' }).click()
  await expect(utilityCard).toContainText('Bound to new-utility')

  await page.getByRole('button', { name: 'Board', exact: true }).click()
  await page.locator('button.project-row').filter({ hasText: 'new-utility' }).click()
  await expect(page.getByRole('heading', { name: 'new-utility' })).toBeVisible()
  await expect(page.locator('label.field').filter({ hasText: 'Status' }).locator('select')).toHaveValue(
    'Inbox',
  )
})
