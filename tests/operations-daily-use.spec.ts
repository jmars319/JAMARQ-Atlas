import { expect, test } from '@playwright/test'
import { clickAtlasNav, uploadJsonFile } from './helpers/atlasTestUtils'

test('operator imports operational data and completes daily Ops readiness edits', async ({ page }) => {
  await page.goto('/')

  await clickAtlasNav(page, 'Ops')
  const opsQueue = page.getByLabel('Ops daily queue')
  await expect(page.getByRole('heading', { name: 'Ops Cockpit' })).toBeVisible()
  await expect(opsQueue).toContainText('Local snapshot missing')
  await page.getByLabel('Ops global readiness').getByRole('button', { name: 'Create local snapshot' }).click()
  await expect(opsQueue).not.toContainText('Local snapshot missing')

  await clickAtlasNav(page, 'Settings')
  await uploadJsonFile(page.getByLabel('Import calibration file'), 'atlas-ops-import.json', {
    rows: [
      {
        kind: 'project-manual',
        projectId: 'midway-mobile-storage-site',
        status: 'Verification',
        verificationCadence: 'weekly',
        nextAction: 'Confirm daily ops checklist.',
        blockers: 'DNS review|Content approval',
      },
      {
        kind: 'recovery-plan',
        targetId: 'midway-mobile-storage-production',
        backupCadence: 'Before every manual upload',
        backupLocationRef: 'mms-backup-ledger',
        rollbackReference: 'mms-rollback-note',
        rollbackSteps: 'Restore previous frontend zip|Run health verification',
        escalationContactRef: 'jamarq-ops-card',
        lastReviewedAt: '2026-05-13T12:00:00Z',
      },
      {
        kind: 'runbook-artifact',
        runbookId: 'mms-cpanel-runbook',
        artifactId: 'midway-mobile-storage-production-frontend-zip',
        checksum: 'sha256:abc123',
        inspectedAt: '2026-05-13T12:00:00Z',
        warnings: 'Verify bundle size',
      },
      {
        kind: 'runbook-preserve-path',
        runbookId: 'mms-cpanel-runbook',
        path: '/api/cache',
        reason: 'Runtime cache survives manual uploads.',
        required: 'true',
      },
      {
        kind: 'runbook-verification-check',
        runbookId: 'mms-cpanel-runbook',
        label: 'Robots file responds',
        method: 'GET',
        urlPath: '/robots.txt',
        expectedStatuses: '200|404',
        protectedResource: 'false',
      },
    ],
  })
  await expect(page.getByLabel('Calibration import preview')).toContainText('5 ready to apply')
  await expect(page.getByLabel('Calibration import kind counts')).toContainText('recovery-plan')
  await expect(page.getByLabel('Calibration import kind counts')).toContainText('runbook-artifact')
  await page.getByRole('button', { name: 'Apply accepted import rows' }).click()
  await expect(page.locator('.data-action-message')).toContainText(
    'Calibration import applied after preview.',
  )

  await clickAtlasNav(page, 'Dispatch')
  const mmsDispatchCard = page
    .locator('.dispatch-card')
    .filter({ hasText: 'Midway Mobile Storage production' })
  await mmsDispatchCard.getByRole('button', { name: 'Open project' }).click()

  const detail = page.locator('.project-detail')
  const recoveryPanel = detail.getByLabel('Midway Mobile Storage production recovery readiness')
  await expect(recoveryPanel).toContainText('Recovery plan current')
  await expect(
    recoveryPanel.locator('label.field').filter({ hasText: 'Backup location ref' }).locator('input'),
  ).toHaveValue('mms-backup-ledger')
  await recoveryPanel
    .locator('label.field')
    .filter({ hasText: 'Maintenance window' })
    .locator('input')
    .fill('Sunday 02:00 ET')
  await recoveryPanel
    .locator('label.field')
    .filter({ hasText: 'Recovery notes' })
    .locator('textarea')
    .fill('E2E recovery edit persisted.')

  const runbookPanel = detail.getByLabel('Midway Mobile Storage production deploy runbook')
  const runbookColumns = runbookPanel.locator('.dispatch-runbook-grid > div')
  const preservePathList = runbookColumns.nth(1).locator('ul.dispatch-list')
  const verificationCheckList = runbookColumns.nth(2).locator('ul.dispatch-list')
  await expect(
    preservePathList
      .locator('label.field')
      .filter({ hasText: 'Path' })
      .locator('input')
      .nth(2),
  ).toHaveValue('/api/cache')
  await expect(
    verificationCheckList
      .locator('label.field')
      .filter({ hasText: 'Label' })
      .locator('input')
      .nth(4),
  ).toHaveValue('Robots file responds')
  await runbookPanel
    .locator('label.field')
    .filter({ hasText: 'Filename' })
    .locator('input')
    .first()
    .fill('frontend-e2e.zip')
  await runbookPanel
    .locator('label.field')
    .filter({ hasText: 'Artifact notes' })
    .locator('textarea')
    .first()
    .fill('E2E artifact expectation note.')
  await runbookPanel
    .locator('label.field')
    .filter({ hasText: 'Check notes' })
    .locator('textarea')
    .first()
    .fill('E2E verification check note.')

  await page.reload()
  await clickAtlasNav(page, 'Dispatch')
  await page
    .locator('.dispatch-card')
    .filter({ hasText: 'Midway Mobile Storage production' })
    .getByRole('button', { name: 'Open project' })
    .click()
  await expect(
    page
      .getByLabel('Midway Mobile Storage production recovery readiness')
      .locator('label.field')
      .filter({ hasText: 'Maintenance window' })
      .locator('input'),
  ).toHaveValue('Sunday 02:00 ET')
  await expect(
    page
      .getByLabel('Midway Mobile Storage production deploy runbook')
      .locator('label.field')
      .filter({ hasText: 'Filename' })
      .locator('input')
      .first(),
  ).toHaveValue('frontend-e2e.zip')
  await expect(
    page
      .getByLabel('Midway Mobile Storage production deploy runbook')
      .locator('label.field')
      .filter({ hasText: 'Check notes' })
      .locator('textarea')
      .first(),
  ).toHaveValue('E2E verification check note.')

  await clickAtlasNav(page, 'Ops')
  await page
    .getByLabel('Ops daily queue')
    .locator('li')
    .filter({ hasText: 'Midway Mobile Storage' })
    .getByRole('button', { name: 'Start manual deploy session' })
    .click()
  await expect(page.getByRole('heading', { name: 'Deployment Readiness' })).toBeVisible()
  await expect(page.getByLabel('Midway Mobile Storage production deploy sessions')).toContainText(
    'active',
  )
})
