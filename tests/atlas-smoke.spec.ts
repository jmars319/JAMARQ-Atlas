import { expect, test } from '@playwright/test'

test('operator can edit manual state and manage writing drafts', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          window.localStorage.setItem('atlas-e2e-clipboard', text)
        },
      },
    })
  })
  await page.route('**/api/dispatch/health?**', async (route) => {
    const url = new URL(route.request().url()).searchParams.get('url') ?? 'https://example.com'

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        result: {
          id: 'health-e2e',
          url,
          status: 'passing',
          checkedAt: '2026-05-10T12:00:00Z',
          statusCode: 200,
          message: 'Health URL responded successfully.',
        },
      }),
    })
  })

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'JAMARQ Atlas' })).toBeVisible()
  await expect(page.getByLabel('Atlas status board')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Active' })).toBeVisible()

  await page.getByRole('button', { name: 'GitHub' }).click()
  await expect(page.getByRole('heading', { name: 'Repository Intake' })).toBeVisible()
  await expect(page.locator('.github-error')).toContainText(/Set GITHUB_TOKEN|GH_TOKEN/)
  await page.getByRole('button', { name: 'Writing' }).click()
  await expect(page.getByRole('heading', { name: 'Writing Workbench' })).toBeVisible()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings & Connections' })).toBeVisible()
  await expect(page.locator('.settings-connection-card').filter({ hasText: 'GitHub Local API' })).toContainText(
    'No GitHub token is configured',
  )
  await expect(page.locator('.settings-connection-card').filter({ hasText: 'Writing Provider' })).toContainText(
    'Missing',
  )
  await expect(
    page.locator('.settings-connection-card').filter({ hasText: 'Supabase Hosted Sync' }),
  ).toContainText('Missing')
  await page.locator('label.field').filter({ hasText: 'Device label' }).locator('input').fill('E2E Atlas device')
  await page.locator('label.field').filter({ hasText: 'Operator label' }).locator('input').fill('E2E operator')
  await page.reload()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.locator('label.field').filter({ hasText: 'Device label' }).locator('input')).toHaveValue(
    'E2E Atlas device',
  )
  await expect(page.locator('label.field').filter({ hasText: 'Operator label' }).locator('input')).toHaveValue(
    'E2E operator',
  )
  await page.getByRole('textbox', { name: 'Snapshot label', exact: true }).fill('E2E checkpoint')
  await page
    .getByRole('textbox', { name: 'Snapshot note', exact: true })
    .fill('Before temporary mutation')
  await page.getByRole('button', { name: 'Create local snapshot' }).click()
  await expect(page.getByLabel('Sync snapshot inventory')).toContainText('E2E checkpoint')
  await page.reload()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByLabel('Sync snapshot inventory')).toContainText('E2E checkpoint')
  await page.getByRole('button', { name: 'Board', exact: true }).click()
  const firstProjectNextAction = page
    .locator('label.field')
    .filter({ hasText: 'Next action' })
    .locator('textarea')
  await firstProjectNextAction.fill('Temporary mutation before snapshot restore')
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByLabel('Sync restore preview')).toContainText('Selected snapshot')
  await page.getByLabel('Type RESTORE ATLAS to restore snapshot', { exact: true }).fill('RESTORE ATLAS')
  await page.getByRole('button', { name: 'Restore snapshot' }).click()
  await expect(page.getByText('Snapshot restored locally')).toBeVisible()
  await page.getByRole('button', { name: 'Board', exact: true }).click()
  await expect(firstProjectNextAction).not.toHaveValue('Temporary mutation before snapshot restore')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByText('No local sync snapshots yet')).toBeVisible()

  let remoteSnapshot: Record<string, unknown> | null = null
  const remoteMetadata = (snapshot: Record<string, unknown>) => ({
    id: snapshot.id,
    label: snapshot.label,
    note: snapshot.note,
    createdAt: snapshot.createdAt,
    deviceId: snapshot.deviceId,
    deviceLabel: snapshot.deviceLabel,
    fingerprint: snapshot.fingerprint,
    summary: snapshot.summary,
  })

  await page.route('**/api/sync/status', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        configured: true,
        data: {
          provider: 'supabase',
          configured: true,
          workspaceId: 'atlas-e2e',
          table: 'atlas_sync_snapshots',
          message: 'Supabase hosted sync is configured for manual snapshots.',
        },
        error: null,
      }),
    })
  })

  await page.route(/\/api\/sync\/remote-snapshots\/[^/]+$/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        configured: true,
        data: { snapshot: remoteSnapshot },
        error: null,
      }),
    })
  })

  await page.route(/\/api\/sync\/remote-snapshots$/, async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        configured: true,
        data: { snapshots: remoteSnapshot ? [remoteMetadata(remoteSnapshot)] : [] },
        error: null,
      }),
    })
  })

  await page.route('**/api/sync/push', async (route) => {
    const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>
    const snapshot = body.snapshot as Record<string, unknown>
    remoteSnapshot = snapshot

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        configured: true,
        data: { snapshot: remoteMetadata(snapshot) },
        error: null,
      }),
    })
  })

  await page.getByRole('button', { name: 'Refresh hosted status' }).click()
  await expect(
    page.locator('.settings-connection-card').filter({ hasText: 'Supabase Hosted Sync' }),
  ).toContainText('Available')
  await page.getByRole('textbox', { name: 'Remote snapshot label' }).fill('Remote E2E checkpoint')
  await page
    .getByRole('textbox', { name: 'Remote snapshot note' })
    .fill('Before remote restore mutation')
  await page.getByRole('button', { name: 'Push current state' }).click()
  await expect(page.getByText('Remote snapshot pushed to Supabase.')).toBeVisible()
  await page.getByRole('button', { name: 'Load remote snapshots' }).click()
  await expect(page.getByLabel('Remote sync snapshot inventory')).toContainText('Remote E2E checkpoint')
  await page.getByRole('button', { name: 'Board', exact: true }).click()
  await firstProjectNextAction.fill('Temporary mutation before remote snapshot restore')
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: /Remote E2E checkpoint/ }).click()
  await expect(page.getByLabel('Remote sync restore preview')).toContainText('Remote snapshot')
  await page.getByLabel('Type RESTORE ATLAS to restore remote snapshot').fill('RESTORE ATLAS')
  await page.getByRole('button', { name: 'Restore remote snapshot' }).click()
  await expect(page.getByText('Remote snapshot restored locally')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Board', exact: true }).click()
  await expect(firstProjectNextAction).not.toHaveValue('Temporary mutation before remote snapshot restore')
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
  await expect(
    page.locator('button.dispatch-card').filter({ hasText: 'Midway Music Hall production' }),
  ).toContainText('Preflight: not run')
  await expect(page.locator('button.dispatch-card').filter({ hasText: 'Midway Music Hall production' })).toBeVisible()
  await page.locator('button.dispatch-card').filter({ hasText: 'Midway Music Hall production' }).click()

  const detail = page.locator('.project-detail')
  await expect(detail.getByRole('heading', { name: 'Midway Music Hall production' })).toBeVisible()
  const statusBeforePreflight = await detail
    .locator('label.field')
    .filter({ hasText: 'Status' })
    .locator('select')
    .inputValue()
  await detail.getByRole('button', { name: 'Run read-only preflight' }).click()
  await expect(detail.getByLabel('Midway Music Hall production preflight')).toContainText(
    'Health URL responded successfully',
  )
  await expect(detail.getByLabel('Midway Music Hall production preflight')).toContainText(
    'Preflight history',
  )
  await expect(
    detail.locator('label.field').filter({ hasText: 'Status' }).locator('select'),
  ).toHaveValue(statusBeforePreflight)

  const deploymentNotesField = detail
    .locator('label.field')
    .filter({ hasText: 'Deployment notes' })
    .locator('textarea')

  await deploymentNotesField.fill('E2E dispatch note')
  await page.reload()
  await expect(deploymentNotesField).toHaveValue('E2E dispatch note')
  await expect(detail.getByLabel('Midway Music Hall production preflight')).toContainText(
    'Preflight history',
  )

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

  await page.route('**/api/writing/status', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        configured: true,
        data: {
          provider: 'openai',
          configured: true,
          model: 'gpt-5',
          message: 'OpenAI draft-only Writing provider is configured.',
        },
        error: null,
      }),
    })
  })

  await page.route('**/api/writing/generate', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        configured: true,
        data: {
          provider: 'openai',
          model: 'gpt-5',
          generatedText: 'Provider suggestion from E2E.',
          generatedAt: '2026-05-10T12:00:00.000Z',
          message: 'OpenAI provider suggestion generated for human review. Draft text was not changed.',
        },
        error: null,
      }),
    })
  })

  await detail.getByRole('button', { name: 'Client update' }).click()
  await expect(page.getByRole('heading', { name: 'Writing Workbench' })).toBeVisible()
  await expect(page.getByLabel('Writing project')).toHaveValue('vaexcore-studio')
  await page.getByRole('button', { name: 'Create draft packet' }).click()
  const draftTextField = page.getByRole('textbox', { name: 'Draft text' })
  await expect(draftTextField).toHaveValue(/Template draft - not AI generated/)
  await expect(page.getByRole('textbox', { name: 'Prompt packet' })).toHaveValue(
    /Do not decide or change status/,
  )
  const templateDraftText = await draftTextField.inputValue()
  await page.getByRole('button', { name: 'Generate provider suggestion' }).click()
  await expect(page.getByLabel('Provider suggestion')).toContainText('Provider suggestion from E2E.')
  await expect(draftTextField).toHaveValue(templateDraftText)
  await page
    .getByLabel('Provider suggestion')
    .getByRole('button', { name: 'Apply suggestion to draft' })
    .click()
  await expect(draftTextField).toHaveValue('Provider suggestion from E2E.')
  await expect(page.getByLabel('Writing review audit')).toContainText('provider-suggestion')
  await expect(page.getByLabel('Writing review audit')).toContainText('suggestion-applied')
  await draftTextField.fill('Human-edited client update from E2E.')
  await page.getByRole('button', { name: 'Mark reviewed' }).click()
  await page.getByRole('button', { name: 'Approve', exact: true }).click()
  await page.getByRole('button', { name: 'Copy draft' }).click()
  await expect(page.locator('.writing-action-message')).toContainText('Copied locally')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export Markdown' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/client-update/)
  await expect(page.getByLabel('Writing review audit')).toContainText('markdown-exported')

  await page.reload()
  await page.getByRole('button', { name: 'Writing' }).click()
  await page.getByLabel('Search writing drafts').fill('Human-edited')
  await page.getByRole('button', { name: /Client update - VaexCore Studio/ }).click()
  await expect(draftTextField).toHaveValue('Human-edited client update from E2E.')
  await expect(page.getByLabel('Writing review audit')).toContainText('approved')
  await expect(page.getByLabel('Writing review audit')).toContainText('markdown-exported')

  await page.getByRole('button', { name: 'Data' }).click()
  await expect(page.getByRole('heading', { name: 'Backups & Restore' })).toBeVisible()
  const jsonDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download JSON backup' }).click()
  expect((await jsonDownload).suggestedFilename()).toMatch(/jamarq-atlas-backup/)
  const markdownDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Markdown report' }).click()
  expect((await markdownDownload).suggestedFilename()).toMatch(/backup-report/)

  await page.getByLabel('Import Atlas backup JSON').setInputFiles({
    name: 'invalid-atlas-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{not json'),
  })
  await expect(page.getByText('Import validation failed')).toBeVisible()

  const restoreBackup = await page.evaluate(() => {
    const workspace = JSON.parse(window.localStorage.getItem('jamarq-atlas.workspace.v1') ?? '{}')
    const dispatch = JSON.parse(window.localStorage.getItem('jamarq-atlas.dispatch.v1') ?? '{}')
    const writing = JSON.parse(window.localStorage.getItem('jamarq-atlas.writing.v1') ?? '{}')
    workspace.sections[0].groups[0].projects[0].manual.nextAction =
      'Restored from Data Center backup.'

    return JSON.stringify({
      kind: 'jamarq-atlas-backup',
      schemaVersion: 2,
      exportedAt: '2026-05-10T12:00:00.000Z',
      appName: 'JAMARQ Atlas',
      stores: {
        workspace,
        dispatch,
        writing,
        settings: JSON.parse(window.localStorage.getItem('jamarq-atlas.settings.v1') ?? '{}'),
        sync: JSON.parse(window.localStorage.getItem('jamarq-atlas.sync.v1') ?? '{}'),
      },
    })
  })

  await page.getByLabel('Import Atlas backup JSON').setInputFiles({
    name: 'valid-atlas-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(restoreBackup),
  })
  await expect(page.getByLabel('Restore preview')).toContainText('Incoming Backup')
  await page.getByLabel('Type RESTORE ATLAS to replace local stores').fill('RESTORE ATLAS')
  await page.getByRole('button', { name: 'Restore backup' }).click()
  await expect(page.getByText('Backup restored locally')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Board', exact: true }).click()
  await page.locator('button.project-row').filter({ hasText: 'Midway Music Hall' }).click()
  await expect(nextActionField).toHaveValue('Restored from Data Center backup.')
  await page.getByRole('button', { name: 'Dispatch' }).click()
  await expect(page.getByRole('heading', { name: 'Deployment Readiness' })).toBeVisible()
  await page.getByRole('button', { name: 'Verification', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Verification Queue' })).toBeVisible()
  await page.getByRole('button', { name: 'GitHub' }).click()
  await expect(page.getByRole('heading', { name: 'Repository Intake' })).toBeVisible()
  await page.getByRole('button', { name: 'Writing' }).click()
  await expect(page.getByRole('heading', { name: 'Writing Workbench' })).toBeVisible()
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings & Connections' })).toBeVisible()

  await page.getByRole('button', { name: 'Board', exact: true }).click()
  await page.locator('button.project-row').filter({ hasText: 'VaexCore Studio' }).click()
  await expect(nextActionField).toHaveValue('Interaction check persisted next action')
  await expect(detail.getByLabel('Approved writing drafts')).toContainText('exported')

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
