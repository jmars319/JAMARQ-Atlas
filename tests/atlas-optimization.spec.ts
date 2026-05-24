import { expect, test } from '@playwright/test'
import { clickAtlasNav, readAtlasLocalStorage, uploadJsonFile } from './helpers/atlasTestUtils'

const optimizationPacket = {
  schemaVersion: 1,
  id: 'jamarq-optimization-e2e',
  title: 'JAMARQ Optimization E2E Snapshot',
  generatedAt: '2026-05-10T12:00:00.000Z',
  source: 'Playwright fixture',
  summary: {
    repoCount: 2,
    deepAuditCount: 1,
    skippedCount: 0,
    topRepoIds: ['atlas'],
  },
  assessments: [
    {
      repoId: 'atlas',
      repoName: 'Atlas',
      atlasProjectId: 'jamarq-atlas',
      registryStatus: 'active',
      deployModel: 'local app',
      securityGate: 'blocking',
      priorityBucket: 'active-now',
      scorecard: {
        value: 5,
        urgency: 5,
        clientProductionImportance: 3,
        strategicLeverage: 5,
        maintenanceBurden: 2,
        readinessGap: 3,
        unblockPotential: 5,
        total: 28,
      },
      scoreRationale: 'Atlas is the interface for operating the optimization review.',
      criticalPath: 'Import and review the optimization packet.',
      releaseVersioning: 'Keep the optimization snapshot schema versioned.',
      observabilityRecovery: 'Optimization state must be included in backups and sync snapshots.',
      uxProductAudit: 'Create Planning notes from recommendations without automatic status mutation.',
      consolidationRetirement: 'Atlas should not mutate lifecycle decisions.',
      reusablePatterns: 'Snapshot import/export and planning-note creation.',
      inspectionStatus: 'deep-inspected',
      inspectionNotes: 'Playwright fixture.',
    },
    {
      repoId: 'vaexil-tv',
      repoName: 'vaexil.tv',
      atlasProjectId: '',
      registryStatus: 'active',
      deployModel: 'public website',
      securityGate: 'blocking',
      priorityBucket: 'probably-retire',
      scorecard: {
        value: 1,
        urgency: 1,
        clientProductionImportance: 1,
        strategicLeverage: 1,
        maintenanceBurden: 4,
        readinessGap: 3,
        unblockPotential: 1,
        total: 12,
      },
      scoreRationale: 'Needs owner decision before additional investment.',
      criticalPath: 'Decide whether the site still belongs in active support.',
      releaseVersioning: 'Do not create new release work until ownership is clear.',
      observabilityRecovery: 'Confirm current hosting and rollback expectations if retained.',
      uxProductAudit: 'Audit only if retained.',
      consolidationRetirement: 'Recommendation only; no lifecycle mutation from Atlas.',
      reusablePatterns: 'Retirement decision format can be reused for stale surfaces.',
      inspectionStatus: 'registry-docs-inspected',
      inspectionNotes: 'Playwright fixture.',
    },
  ],
  recommendations: [
    {
      id: 'atlas-review-snapshot',
      repoId: 'atlas',
      atlasProjectId: 'jamarq-atlas',
      category: 'critical-path',
      priorityBucket: 'active-now',
      title: 'Review optimization snapshot in Atlas',
      detail: 'Turn the top recommendation into an explicit Planning note.',
    },
  ],
}

test('Optimize imports, filters, exports, and creates Planning notes', async ({ page }) => {
  await page.goto('/')
  await clickAtlasNav(page, 'Optimize')

  await expect(page.getByRole('heading', { name: 'Portfolio Optimization' })).toBeVisible()
  await expect(page.getByText('No optimization snapshot imported')).toBeVisible()

  await uploadJsonFile(
    page.getByLabel('Import optimization packet'),
    'jamarq-optimization-e2e.json',
    optimizationPacket,
  )
  await expect(page.getByLabel('Optimization import preview')).toContainText(
    'JAMARQ Optimization E2E Snapshot',
  )
  await page.getByRole('button', { name: 'Store optimization snapshot' }).click()
  await expect(page.getByLabel('Optimization snapshot summary')).toContainText('Repos')
  await expect(page.getByLabel('Optimization scorecards')).toContainText('Atlas')

  await page.getByLabel('Priority bucket').selectOption('probably-retire')
  await expect(page.getByLabel('Optimization scorecards')).toContainText('vaexil.tv')
  await expect(page.getByLabel('Optimization scorecards')).not.toContainText(
    'Atlas is the interface',
  )

  await page.getByLabel('Priority bucket').selectOption('active-now')
  await page.getByLabel('Search optimization snapshot').fill('interface')
  await expect(page.getByLabel('Optimization scorecards')).toContainText('Atlas')

  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export snapshot' }).click()
  expect((await download).suggestedFilename()).toBe('jamarq-optimization-e2e.json')

  await page.getByRole('button', { name: 'Create planning note' }).click()
  await expect(page.getByRole('heading', { name: 'Planning Center' })).toBeVisible()
  await expect(page.getByLabel('Planning records', { exact: true })).toContainText(
    'Optimization: Review optimization snapshot in Atlas',
  )

  const stored = await readAtlasLocalStorage<{ snapshots: unknown[] }>(
    page,
    'jamarq-atlas.optimization.v1',
    { snapshots: [] },
  )
  expect(stored.snapshots).toHaveLength(1)
})
