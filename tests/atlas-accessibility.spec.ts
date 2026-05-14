import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { clickAtlasNav, type AtlasNavLabel } from './helpers/atlasTestUtils'

async function expectCriticalScreenAccessible(
  page: Page,
  navLabel: AtlasNavLabel | null,
  heading: string,
) {
  await page.goto('/')

  if (navLabel) {
    await clickAtlasNav(page, navLabel)
  }

  await expect(page.getByRole('heading', { name: heading })).toBeVisible()

  const results = await new AxeBuilder({ page })
    .include('.app-shell')
    .disableRules(['color-contrast'])
    .analyze()
  const actionableViolations = results.violations.filter((violation) =>
    ['critical', 'serious'].includes(violation.impact ?? ''),
  )

  expect(actionableViolations).toEqual([])
}

test.describe('critical screen accessibility', () => {
  test('Board has no serious automated accessibility violations', async ({ page }) => {
    await expectCriticalScreenAccessible(page, null, 'JAMARQ Atlas')
  })

  test('Settings has no serious automated accessibility violations', async ({ page }) => {
    await expectCriticalScreenAccessible(page, 'Settings', 'Settings & Connections')
  })

  test('Data has no serious automated accessibility violations', async ({ page }) => {
    await expectCriticalScreenAccessible(page, 'Data', 'Backups & Restore')
  })

  test('Dispatch has no serious automated accessibility violations', async ({ page }) => {
    await expectCriticalScreenAccessible(page, 'Dispatch', 'Deployment Readiness')
  })

  test('GitHub has no serious automated accessibility violations', async ({ page }) => {
    await expectCriticalScreenAccessible(page, 'GitHub', 'Repository Intake')
  })
})
