import { expect, test } from '@playwright/test'
import { clickAtlasNav, installAtlasClipboardMock } from './helpers/atlasTestUtils'

function createZipBuffer(entries: string[]) {
  const chunks = entries.map((entry) => {
    const encoded = Buffer.from(entry)
    const chunk = Buffer.alloc(46 + encoded.length)

    chunk.writeUInt32LE(0x02014b50, 0)
    chunk.writeUInt16LE(encoded.length, 28)
    encoded.copy(chunk, 46)

    return chunk
  })

  return Buffer.concat(chunks)
}

test('operator can edit manual state and manage writing drafts', async ({ page }) => {
  await installAtlasClipboardMock(page)
  await page.route('**/api/dispatch/health?**', async (route) => {
    const url = new URL(route.request().url()).searchParams.get('url') ?? 'https://example.com'
    const protectedPath = url.endsWith('/api/.env') || url.endsWith('/api/logs/app.log')
    const statusCode = protectedPath ? 403 : 200

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        result: {
          id: 'health-e2e',
          url,
          status: protectedPath ? 'warning' : 'passing',
          checkedAt: '2026-05-10T12:00:00Z',
          statusCode,
          message: protectedPath
            ? `Protected URL returned ${statusCode}.`
            : 'Health URL responded successfully.',
        },
      }),
    })
  })

  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'JAMARQ Atlas' })).toBeVisible()
  await expect(page.getByLabel('Atlas status board')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Active' })).toBeVisible()

  await clickAtlasNav(page, 'Timeline')
  await expect(page.getByRole('heading', { name: 'Timeline', exact: true })).toBeVisible()
  await expect(page.getByLabel('Timeline evidence rows')).toContainText('Deployment record')
  await page.getByLabel('Filter timeline source').selectOption('dispatch')
  await page.getByLabel('Search timeline').fill('baseline')
  await expect(page.getByLabel('Timeline evidence rows')).toContainText('baseline')
  await expect(page.locator('.project-detail')).toContainText('Evidence Timeline')

  await clickAtlasNav(page, 'GitHub')
  await expect(page.getByRole('heading', { name: 'Repository Intake' })).toBeVisible()
  await expect(page.locator('.github-error')).toContainText(/Set GITHUB_TOKEN|GH_TOKEN/)
  await clickAtlasNav(page, 'Review')
  await expect(page.getByRole('heading', { name: 'Review Center' })).toBeVisible()
  await expect(page.getByLabel('Operator review queue')).toContainText('Midway Music Hall')
  await page.getByLabel('Filter review source').selectOption('workspace')
  const statusBeforeReview = await page
    .locator('label.field')
    .filter({ hasText: 'Status' })
    .locator('select')
    .inputValue()
  const reviewQueue = page.getByLabel('Operator review queue')
  await reviewQueue.getByRole('button', { name: 'Start session' }).first().click()
  await expect(page.getByText('Review session started locally.')).toBeVisible()
  await reviewQueue.locator('textarea[aria-label^="Review note for"]').first().fill('E2E review follow-up note')
  await reviewQueue.getByRole('button', { name: 'Add review note' }).first().click()
  await expect(page.getByText('Review note captured locally.')).toBeVisible()
  await reviewQueue.locator('textarea[aria-label^="Review note for"]').first().fill('E2E planning note from review')
  await reviewQueue.getByRole('button', { name: 'Create planning note' }).first().click()
  await expect(page.getByText('Planning note created from Review')).toBeVisible()
  await expect(
    page.locator('label.field').filter({ hasText: 'Status' }).locator('select'),
  ).toHaveValue(statusBeforeReview)
  await page.reload()
  await clickAtlasNav(page, 'Review')
  await expect(page.locator('.review-history-list[aria-label="Review sessions"]')).toContainText('Review:')
  await expect(page.locator('.review-history-list[aria-label="Review notes"]')).toContainText(
    'E2E review follow-up note',
  )
  await clickAtlasNav(page, 'Planning')
  await expect(page.getByLabel('Planning records', { exact: true })).toContainText(
    'E2E planning note from review',
  )
  await clickAtlasNav(page, 'Writing')
  await expect(page.getByRole('heading', { name: 'Writing Workbench' })).toBeVisible()
  await clickAtlasNav(page, 'Settings')
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
  await expect(
    page.locator('.settings-connection-card').filter({ hasText: 'Read-Only Host Boundary' }),
  ).toContainText('Missing')
  await expect(page.getByLabel('Calibration group counts')).toContainText('Host config')
  await page.getByRole('button', { name: /Host config/ }).click()
  await expect(page.getByLabel('Atlas calibration checks')).toContainText('Remote host')
  await page.getByLabel('Bulk calibration field').selectOption('remoteHost')
  await page.getByLabel('Bulk calibration value').fill('password=do-not-store')
  await page.getByRole('button', { name: /Apply to/ }).click()
  await expect(page.getByText('This looks credential-shaped')).toBeVisible()
  await page.locator('label.field').filter({ hasText: 'Device label' }).locator('input').fill('E2E Atlas device')
  await page.locator('label.field').filter({ hasText: 'Operator label' }).locator('input').fill('E2E operator')
  await page.reload()
  await clickAtlasNav(page, 'Settings')
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
  await clickAtlasNav(page, 'Settings')
  await expect(page.getByLabel('Sync snapshot inventory')).toContainText('E2E checkpoint')
  await clickAtlasNav(page, 'Board')
  const firstProjectNextAction = page
    .locator('label.field')
    .filter({ hasText: 'Next action' })
    .locator('textarea')
  await firstProjectNextAction.fill('Temporary mutation before snapshot restore')
  await clickAtlasNav(page, 'Settings')
  await expect(page.getByLabel('Sync restore preview')).toContainText('Selected snapshot')
  await page.getByLabel('Type RESTORE ATLAS to restore snapshot', { exact: true }).fill('RESTORE ATLAS')
  await page.getByRole('button', { name: 'Restore snapshot' }).click()
  await expect(page.getByText('Snapshot restored locally')).toBeVisible()
  await clickAtlasNav(page, 'Board')
  await expect(firstProjectNextAction).not.toHaveValue('Temporary mutation before snapshot restore')
  await clickAtlasNav(page, 'Settings')
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
  await page.reload()
  await clickAtlasNav(page, 'Settings')
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
    if (route.request().method() === 'DELETE') {
      const snapshotId = remoteSnapshot?.id ?? 'remote-e2e'
      remoteSnapshot = null

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          configured: true,
          data: { snapshotId },
          error: null,
        }),
      })
      return
    }

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
  await clickAtlasNav(page, 'Board')
  await firstProjectNextAction.fill('Temporary mutation before remote snapshot restore')
  await clickAtlasNav(page, 'Settings')
  await page.getByRole('button', { name: /Remote E2E checkpoint/ }).click()
  await expect(page.getByLabel('Remote sync restore preview')).toContainText('Remote snapshot')
  await expect(page.getByLabel('Remote/local snapshot comparison')).toContainText(
    'Fingerprints differ',
  )
  await page.getByLabel('Type RESTORE ATLAS to restore remote snapshot').fill('RESTORE ATLAS')
  await page.getByRole('button', { name: 'Restore remote snapshot' }).click()
  await expect(page.getByText('Remote snapshot restored locally')).toBeVisible()
  await page.getByRole('button', { name: 'Delete remote snapshot' }).click()
  await page.getByRole('button', { name: 'Confirm remote delete' }).click()
  await expect(page.getByText('Remote snapshot deleted from Supabase.')).toBeVisible()
  await expect(page.getByText('No remote snapshots loaded')).toBeVisible()
  await page.reload()
  await clickAtlasNav(page, 'Board')
  await expect(firstProjectNextAction).not.toHaveValue('Temporary mutation before remote snapshot restore')
  await clickAtlasNav(page, 'Board')

  await clickAtlasNav(page, 'Verification')
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

  await clickAtlasNav(page, 'Planning')
  await expect(page.getByRole('heading', { name: 'Planning Center' })).toBeVisible()
  const planningCreatePanel = page.getByLabel('Create planning item')
  await planningCreatePanel.getByLabel('Planning project').selectOption('vaexcore-studio')
  const statusBeforePlanning = await page
    .locator('.project-detail')
    .locator('label.field')
    .filter({ hasText: 'Status' })
    .locator('select')
    .inputValue()
  await planningCreatePanel.getByLabel('Planning kind', { exact: true }).selectOption('objective')
  await planningCreatePanel.getByLabel('New planning status').selectOption('active')
  await planningCreatePanel.getByLabel('Planning title', { exact: true }).fill('E2E planning objective')
  await planningCreatePanel
    .getByLabel('Planning detail', { exact: true })
    .fill('Human-authored planning note from E2E.')
  await planningCreatePanel.getByRole('button', { name: 'Add planning record' }).click()
  await expect(page.getByLabel('Planning records', { exact: true })).toContainText(
    'E2E planning objective',
  )
  await expect(page.locator('.project-detail').locator('label.field').filter({ hasText: 'Status' }).locator('select')).toHaveValue(
    statusBeforePlanning,
  )
  await page.reload()
  await clickAtlasNav(page, 'Planning')
  await expect(page.getByLabel('Planning records', { exact: true })).toContainText(
    'E2E planning objective',
  )
  await clickAtlasNav(page, 'Board')
  await page.locator('button.project-row').filter({ hasText: 'VaexCore Studio' }).click()
  await expect(page.getByLabel('Project planning')).toContainText('E2E planning objective')
  await expect(page.locator('.project-detail').locator('label.field').filter({ hasText: 'Status' }).locator('select')).toHaveValue(
    statusBeforePlanning,
  )

  await clickAtlasNav(page, 'Board')

  await clickAtlasNav(page, 'Dispatch')
  await expect(page.getByRole('heading', { name: 'Deployment Readiness' })).toBeVisible()
  await expect(page.getByLabel('Dispatch closeout analytics')).toBeVisible()
  await expect(page.getByLabel('Dispatch closeout analytics')).toContainText('Closeout ready')
  const queue = page.getByLabel('Dispatch queue command center')
  await expect(queue).toBeVisible()
  await expect(queue).toContainText('#1 / Midway Mobile Storage')
  await expect(queue).toContainText('#2 / Midway Music Hall')
  await expect(queue).toContainText('#3 / Surplus Containers')
  await expect(queue).toContainText('#4 / Thunder Road')
  await expect(queue).toContainText('#5 / Bow Wow')
  const mmsQueueItem = queue.locator('.dispatch-queue-item').filter({
    hasText: 'Midway Mobile Storage',
  })
  await expect(mmsQueueItem).toContainText('Needs artifacts')
  await mmsQueueItem
    .getByLabel('Inspect MMS frontend-deploy.zip')
    .setInputFiles({
      name: 'frontend-deploy.zip',
      mimeType: 'application/zip',
      buffer: createZipBuffer(['index.html', 'assets/app.js']),
    })
  await expect(mmsQueueItem).toContainText('checksum captured')
  await page.reload()
  await clickAtlasNav(page, 'Dispatch')
  await expect(
    page
      .getByLabel('Dispatch queue command center')
      .locator('.dispatch-queue-item')
      .filter({ hasText: 'Midway Mobile Storage' }),
  ).toContainText('sha256-')
  await page
    .getByLabel('Dispatch queue command center')
    .locator('.dispatch-queue-item')
    .filter({ hasText: 'Midway Music Hall' })
    .getByRole('button', { name: 'Run preflight' })
    .click()
  await expect(
    page
      .getByLabel('Dispatch queue command center')
      .locator('.dispatch-queue-item')
      .filter({ hasText: 'Midway Music Hall' }),
  ).toContainText('2 warnings need human review')
  await page
    .getByLabel('Dispatch queue command center')
    .locator('.dispatch-queue-item')
    .filter({ hasText: 'Midway Music Hall' })
    .getByRole('button', { name: 'Inspect host' })
    .click()
  await expect(
    page
      .getByLabel('Dispatch queue command center')
      .locator('.dispatch-queue-item')
      .filter({ hasText: 'Midway Music Hall' }),
  ).toContainText('Read-only host preflight is not configured')
  await page
    .getByLabel('Dispatch queue command center')
    .locator('.dispatch-queue-item')
    .filter({ hasText: 'Midway Music Hall' })
    .getByRole('button', { name: 'Run checks' })
    .click()
  await expect(
    page
      .getByLabel('Dispatch queue command center')
      .locator('.dispatch-queue-item')
      .filter({ hasText: 'Midway Music Hall' }),
  ).toContainText('Runbook verification checks matched expected statuses')
  await expect(page.getByLabel('Deploy session queue')).toBeVisible()
  const mmhDispatchCard = page
    .locator('.dispatch-card')
    .filter({ hasText: 'Midway Music Hall production' })
  await expect(
    mmhDispatchCard,
  ).toContainText('Preflight:')
  await expect(mmhDispatchCard).toBeVisible()
  await mmhDispatchCard.getByRole('button', { name: 'Open project' }).click()

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
  await detail.getByRole('button', { name: 'Run read-only host check' }).click()
  await expect(detail.getByLabel('Midway Music Hall production host connection')).toContainText(
    'Read-only host preflight is not configured',
  )
  await expect(detail.getByLabel('Midway Music Hall production host connection')).toContainText(
    'Host evidence history',
  )
  await detail.getByRole('button', { name: 'Run read-only checks' }).click()
  await expect(detail.getByLabel('Midway Music Hall production deploy runbook')).toContainText(
    'Stored verification evidence',
  )
  await expect(detail.getByLabel('Midway Music Hall production automation readiness')).toContainText(
    'Automation Readiness',
  )
  const automationRunbookCheck = detail
    .getByLabel('Midway Music Hall production automation readiness')
    .locator('label.check-field')
    .filter({ hasText: 'Runbook reviewed for this target' })
    .locator('input')
  await automationRunbookCheck.check()
  await detail.getByRole('button', { name: 'Generate no-op dry-run plan' }).click()
  await expect(detail.getByLabel('Midway Music Hall production dry-run plan')).toContainText(
    'No SSH',
  )
  await expect(
    detail.locator('label.field').filter({ hasText: 'Status' }).locator('select'),
  ).toHaveValue(statusBeforePreflight)
  await expect(detail.getByLabel('Midway Music Hall production write automation gate')).toContainText(
    'Write Automation Locked',
  )
  await expect(detail.getByLabel('Midway Music Hall production write automation gate')).toContainText(
    'No execution action is available',
  )

  const deploymentNotesField = detail
    .locator('label.field')
    .filter({ hasText: 'Deployment notes' })
    .locator('textarea')

  await deploymentNotesField.fill('E2E dispatch note')
  await page.reload()
  await expect(deploymentNotesField).toHaveValue('E2E dispatch note')
  await expect(automationRunbookCheck).toBeChecked()
  await expect(detail.getByLabel('Midway Music Hall production preflight')).toContainText(
    'Preflight history',
  )
  await expect(detail.getByLabel('Midway Music Hall production host connection')).toContainText(
    'Host evidence history',
  )
  await expect(detail.getByLabel('Midway Music Hall production deploy runbook')).toContainText(
    'Stored verification evidence',
  )

  await page.route('**/api/dispatch/host-status', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        configured: true,
        data: {
          configured: true,
          configuredTargets: [
            {
              targetId: 'midway-music-hall-production',
              credentialRef: 'godaddy-mmh-production',
              host: 'mmh.examplehost.test',
              port: 22,
              probeMode: 'sftp-readonly',
              authMethod: 'password-env',
              sftpEnabled: true,
              hasLocalMirror: false,
            },
            {
              targetId: 'midway-mobile-storage-production',
              credentialRef: 'godaddy-mms-production',
              host: 'mms.examplehost.test',
              port: 22,
              probeMode: 'sftp-readonly',
              authMethod: 'password-env',
              sftpEnabled: true,
              hasLocalMirror: false,
            },
          ],
          sftpEnabledCount: 2,
          message: 'Read-only host preflight config is available. No write checks are attempted.',
        },
        error: null,
      }),
    })
  })

  await page.route('**/api/dispatch/host-preflight?**', async (route) => {
    const url = new URL(route.request().url())
    const targetId = url.searchParams.get('targetId') ?? 'unknown-target'
    const credentialRef = url.searchParams.get('credentialRef') ?? 'unknown-credential'
    const remoteFrontendPath =
      url.searchParams.get('remoteFrontendPath') ?? '/home/example/public_html'
    const remoteBackendPath =
      url.searchParams.get('remoteBackendPath') ?? `${remoteFrontendPath}/api`
    const preservePaths = url.searchParams.getAll('preservePath')
    const checkedAt = new Date().toISOString()
    const host = `${targetId}.examplehost.test`
    const resolvePreservePath = (preservePath: string) =>
      preservePath.startsWith('/api')
        ? `${remoteBackendPath}${preservePath.replace(/^\/api/, '')}`
        : `${remoteFrontendPath}/${preservePath.replace(/^\/+/, '')}`

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        result: {
          targetId,
          configured: true,
          status: 'passing',
          checkedAt,
          credentialRef,
          probeMode: 'sftp-readonly',
          authMethod: 'password-env',
          message: 'Read-only host preflight completed without warnings.',
          warnings: [],
          checks: [
            {
              id: `host-credential-${targetId}`,
              type: 'credential-reference',
              label: 'Credential reference',
              status: 'passing',
              checkedAt,
              probeMode: 'sftp-readonly',
              authMethod: 'password-env',
              message: `Using non-secret credential reference ${credentialRef}.`,
            },
            {
              id: `host-reachable-${targetId}`,
              type: 'host-reachable',
              label: 'Host reachable',
              status: 'passing',
              checkedAt,
              host,
              probeMode: 'sftp-readonly',
              authMethod: 'password-env',
              message: 'Host accepted TCP connection on port 22.',
            },
            {
              id: `host-sftp-${targetId}`,
              type: 'sftp-connect',
              label: 'SFTP read-only auth',
              status: 'passing',
              checkedAt,
              host,
              probeMode: 'sftp-readonly',
              authMethod: 'password-env',
              message: 'SFTP read-only connection established. No write methods are used.',
            },
            {
              id: `host-root-${targetId}`,
              type: 'target-root',
              label: 'Target root exists',
              status: 'passing',
              checkedAt,
              path: remoteFrontendPath,
              probeMode: 'sftp-readonly',
              authMethod: 'password-env',
              entryCount: 12,
              fileCount: 8,
              directoryCount: 4,
              symlinkCount: 0,
              message: 'SFTP read-only stat confirms directory exists; 12 top-level entries counted.',
            },
            {
              id: `host-api-${targetId}`,
              type: 'api-root',
              label: '/api exists',
              status: 'passing',
              checkedAt,
              path: remoteBackendPath,
              probeMode: 'sftp-readonly',
              authMethod: 'password-env',
              entryCount: 6,
              fileCount: 5,
              directoryCount: 1,
              symlinkCount: 0,
              message: 'SFTP read-only stat confirms directory exists; 6 top-level entries counted.',
            },
            ...preservePaths.map((preservePath, index) => ({
              id: `host-preserve-${targetId}-${index}`,
              type: 'preserve-path',
              label: `Preserve path ${preservePath}`,
              status: 'passing',
              checkedAt,
              path: resolvePreservePath(preservePath),
              probeMode: 'sftp-readonly',
              authMethod: 'password-env',
              message: 'SFTP read-only stat confirms path exists.',
            })),
          ],
        },
      }),
    })
  })

  await clickAtlasNav(page, 'Settings')
  await page.getByRole('button', { name: 'Refresh', exact: true }).click()
  await expect(
    page.locator('.settings-connection-card').filter({ hasText: 'Read-Only Host Boundary' }),
  ).toContainText('Available')
  await expect(
    page.locator('.settings-connection-card').filter({ hasText: 'Read-Only Host Boundary' }),
  ).toContainText('2 SFTP read-only')

  await clickAtlasNav(page, 'Dispatch')
  await page.getByRole('button', { name: 'Run read-only evidence sweep' }).click()
  await expect(
    page
      .getByLabel('Dispatch queue command center')
      .locator('.dispatch-queue-item')
      .filter({ hasText: 'Midway Music Hall' }),
  ).toContainText('Passing / sftp-readonly')
  await expect(
    page
      .getByLabel('Dispatch queue command center')
      .locator('.dispatch-queue-item')
      .filter({ hasText: 'Midway Mobile Storage' }),
  ).toContainText('Passing / sftp-readonly')
  await page.getByRole('button', { name: 'Run cPanel host inspections' }).click()
  await expect(
    page.locator('.dispatch-card').filter({ hasText: 'Midway Music Hall production' }),
  ).toContainText('passing / sftp-readonly')
  await expect(
    page.locator('.dispatch-card').filter({ hasText: 'Midway Mobile Storage production' }),
  ).toContainText('passing / sftp-readonly')

  await clickAtlasNav(page, 'Dispatch')
  const mmsQueueSessionItem = page
    .getByLabel('Dispatch queue command center')
    .locator('.dispatch-queue-item')
    .filter({ hasText: 'Midway Mobile Storage' })
  await mmsQueueSessionItem.getByRole('button', { name: 'Start session' }).click()
  await expect(mmsQueueSessionItem).toContainText('Session active')
  await expect(mmsQueueSessionItem).toContainText('Closeout: Session active')
  await mmsQueueSessionItem.getByRole('button', { name: 'Resume session' }).click()
  await mmsQueueSessionItem.getByRole('button', { name: 'Open project' }).click()
  const mmsDetail = page.locator('.project-detail')
  const mmsSessions = mmsDetail.getByLabel('Midway Mobile Storage production deploy sessions')
  await expect(mmsSessions).toContainText('Outside-Atlas upload completed')
  await expect(mmsDetail.getByLabel('Midway Mobile Storage production closeout review')).toContainText(
    'Closeout Review',
  )

  const sessionSteps = [
    'Read-only preflight reviewed',
    'Artifact inspection reviewed',
    'Preserve/create paths reviewed',
    'Backup readiness confirmed',
    'Outside-Atlas upload completed',
    'Post-upload verification reviewed',
    'Operator notes captured',
    'Post-deploy wrap-up reviewed',
  ]

  for (const step of sessionSteps) {
    await mmsDetail.getByLabel(`${step} step status`).selectOption('confirmed')
  }

  await mmsDetail
    .getByLabel('Artifact inspection reviewed notes')
    .fill('E2E confirmed frontend and backend artifacts.')
  await mmsDetail
    .getByLabel('Outside-Atlas upload completed evidence')
    .fill('E2E operator noted cPanel upload outside Atlas.')
  await mmsDetail.getByRole('button', { name: 'Run read-only host check' }).click()
  await expect(mmsDetail.getByLabel('Midway Mobile Storage production host connection')).toContainText(
    'Host evidence history',
  )
  await mmsDetail.getByRole('button', { name: 'Run read-only checks' }).click()
  await expect(mmsDetail.getByLabel('Midway Mobile Storage production deploy runbook')).toContainText(
    'Stored verification evidence',
  )
  await mmsDetail
    .getByRole('button', { name: 'Add latest host evidence to session notes' })
    .click()
  await mmsDetail
    .getByRole('button', { name: 'Add latest verification evidence to session notes' })
    .click()
  await expect(mmsDetail.getByLabel('Read-only preflight reviewed evidence')).toHaveValue(
    /host-evidence-/,
  )
  await expect(mmsDetail.getByLabel('Post-upload verification reviewed evidence')).toHaveValue(
    /verification-evidence-/,
  )
  await expect(mmsSessions).toContainText('completed')
  await page.reload()
  await clickAtlasNav(page, 'Dispatch')
  const mmsDispatchCardAfterReload = page
    .locator('.dispatch-card')
    .filter({ hasText: 'Midway Mobile Storage production' })
  await mmsDispatchCardAfterReload.getByRole('button', { name: 'Open project' }).click()
  await expect(
    mmsDetail.getByLabel('Outside-Atlas upload completed evidence'),
  ).toHaveValue(
    'E2E operator noted cPanel upload outside Atlas.',
  )
  await expect(mmsDetail.getByLabel('Read-only preflight reviewed evidence')).toHaveValue(
    /host-evidence-/,
  )
  await expect(mmsDetail.getByLabel('Post-upload verification reviewed evidence')).toHaveValue(
    /verification-evidence-/,
  )
  await mmsDetail
    .getByLabel('Type RECORD MANUAL DEPLOYMENT for MMS')
    .fill('RECORD DEPLOYMENT')
  await mmsDetail.getByRole('button', { name: 'Record manual deployment' }).click()
  await expect(mmsDetail.getByLabel('Midway Mobile Storage production deploy sessions')).toContainText(
    'RECORD MANUAL DEPLOYMENT',
  )
  await mmsDetail
    .getByLabel('Type RECORD MANUAL DEPLOYMENT for MMS')
    .fill('RECORD MANUAL DEPLOYMENT')
  await mmsDetail.getByRole('button', { name: 'Record manual deployment' }).click()
  await expect(mmsDetail.getByLabel('Midway Mobile Storage production deploy sessions')).toContainText(
    'Manual deployment record created',
  )
  await expect(mmsDetail.getByLabel('Midway Mobile Storage production deploy sessions')).toContainText(
    'manual-deployment',
  )
  await expect(mmsDetail.getByLabel('Midway Mobile Storage production deploy sessions')).toContainText(
    'host evidence',
  )
  await expect(mmsDetail.getByLabel('Midway Mobile Storage production deploy sessions')).toContainText(
    'verification evidence',
  )
  await expect(mmsDetail.getByLabel('Midway Mobile Storage production closeout review')).toContainText(
    'manual-deployment',
  )

  await clickAtlasNav(page, 'Board')
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
  await clickAtlasNav(page, 'Writing')
  await page.getByLabel('Search writing drafts').fill('Human-edited')
  await page.getByRole('button', { name: /Client update - VaexCore Studio/ }).click()
  await expect(draftTextField).toHaveValue('Human-edited client update from E2E.')
  await expect(page.getByLabel('Writing review audit')).toContainText('approved')
  await expect(page.getByLabel('Writing review audit')).toContainText('markdown-exported')

  await clickAtlasNav(page, 'Reports')
  await expect(page.getByRole('heading', { name: 'Report Packet Builder' })).toBeVisible()
  await expect(page.getByLabel('Report writing drafts')).toContainText('Client update - VaexCore Studio')
  await page.getByRole('button', { name: 'Select all drafts' }).click()
  await page.getByRole('button', { name: 'Create report packet' }).click()
  const reportMarkdownField = page.getByRole('textbox', { name: 'Report Markdown' })
  await expect(reportMarkdownField).toHaveValue(/Human-edited client update from E2E/)
  const reportMarkdown = await reportMarkdownField.inputValue()
  await reportMarkdownField.fill(`${reportMarkdown}\nHuman report edit from E2E.`)
  await page.getByRole('button', { name: 'Save edits' }).click()
  await expect(page.locator('.writing-action-message')).toContainText('Report Markdown edits saved')
  await page.getByRole('button', { name: 'Copy Markdown' }).click()
  await expect(page.locator('.writing-action-message')).toContainText('Copied locally')
  const reportDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Markdown' }).click()
  expect((await reportDownload).suggestedFilename()).toMatch(/client-update-packet/)
  await expect(page.getByLabel('Report audit timeline')).toContainText('markdown-exported')
  await page.reload()
  await clickAtlasNav(page, 'Reports')
  await expect(page.getByLabel('Report packet history')).toContainText('Client update packet')
  await expect(reportMarkdownField).toHaveValue(/Human report edit from E2E/)
  await expect(page.getByLabel('Report audit timeline')).toContainText('copied')
  await page.getByLabel('Report type').selectOption('deployment-readiness-packet')
  await page.getByLabel('Report project').selectOption('midway-mobile-storage-site')
  await page.getByRole('button', { name: 'Create report packet' }).click()
  await expect(reportMarkdownField).toHaveValue(/Dispatch Closeout Analytics/)
  await expect(reportMarkdownField).toHaveValue(/Stored Dispatch Evidence/)
  await expect(reportMarkdownField).toHaveValue(/host-evidence-/)
  await expect(reportMarkdownField).toHaveValue(/verification-evidence-/)
  await expect(reportMarkdownField).toHaveValue(/Manual deployment record/)
  await clickAtlasNav(page, 'Dispatch')
  await page
    .getByLabel('Dispatch queue command center')
    .locator('.dispatch-queue-item')
    .filter({ hasText: 'Midway Mobile Storage' })
    .getByRole('button', { name: 'Readiness report' })
    .click()
  await expect(page.getByRole('heading', { name: 'Report Packet Builder' })).toBeVisible()
  await expect(reportMarkdownField).toHaveValue(/Deployment Runbooks & Artifact Readiness/)
  await expect(reportMarkdownField).toHaveValue(/Stored Dispatch Evidence/)

  await clickAtlasNav(page, 'Data')
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
    const planning = JSON.parse(window.localStorage.getItem('jamarq-atlas.planning.v1') ?? '{}')
    const reports = JSON.parse(window.localStorage.getItem('jamarq-atlas.reports.v1') ?? '{}')
    const review = JSON.parse(window.localStorage.getItem('jamarq-atlas.review.v1') ?? '{}')
    workspace.sections[0].groups[0].projects[0].manual.nextAction =
      'Restored from Data Center backup.'

    return JSON.stringify({
      kind: 'jamarq-atlas-backup',
      schemaVersion: 4,
      exportedAt: '2026-05-10T12:00:00.000Z',
      appName: 'JAMARQ Atlas',
      stores: {
        workspace,
        dispatch,
        writing,
        planning,
        reports,
        review,
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
  await clickAtlasNav(page, 'Board')
  await page.locator('button.project-row').filter({ hasText: 'Midway Music Hall' }).click()
  await expect(nextActionField).toHaveValue('Restored from Data Center backup.')
  await clickAtlasNav(page, 'Dispatch')
  await expect(page.getByRole('heading', { name: 'Deployment Readiness' })).toBeVisible()
  await clickAtlasNav(page, 'Verification')
  await expect(page.getByRole('heading', { name: 'Verification Queue' })).toBeVisible()
  await clickAtlasNav(page, 'GitHub')
  await expect(page.getByRole('heading', { name: 'Repository Intake' })).toBeVisible()
  await clickAtlasNav(page, 'Review')
  await expect(page.getByRole('heading', { name: 'Review Center' })).toBeVisible()
  await expect(page.locator('.review-history-list[aria-label="Review notes"]')).toContainText(
    'E2E review follow-up note',
  )
  await clickAtlasNav(page, 'Writing')
  await expect(page.getByRole('heading', { name: 'Writing Workbench' })).toBeVisible()
  await clickAtlasNav(page, 'Settings')
  await expect(page.getByRole('heading', { name: 'Settings & Connections' })).toBeVisible()

  await clickAtlasNav(page, 'Board')
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
    const page = Number(url.searchParams.get('page') ?? '1')
    const pageInfo = {
      currentPage: page,
      hasNextPage: resource === 'commits' && page === 1,
      nextPage: resource === 'commits' && page === 1 ? 2 : null,
      perPage: 20,
    }
    const dataByResource: Record<string, unknown> = {
      repo: repo(name, `${name} overview.`),
      commits: [
        {
          sha: `commit-${page}`,
          shortSha: `c${page}c${page}c${page}`,
          message: `Commit page ${page}`,
          author: 'Jason',
          date: '2026-05-09T12:00:00Z',
          htmlUrl: `https://github.com/jmars319/${name}/commit/${page}`,
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
