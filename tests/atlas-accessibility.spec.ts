import { expect, test, type Page } from '@playwright/test'
import { expectNoActionableA11yViolations } from './helpers/accessibilityBaseline'
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

  await expectNoActionableA11yViolations(page)
}

test.describe('critical screen accessibility', () => {
  test('Board has no serious automated accessibility violations', async ({ page }) => {
    await expectCriticalScreenAccessible(page, null, 'Atlas by Tenra')
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

  test('Ops has no serious automated accessibility violations', async ({ page }) => {
    await expectCriticalScreenAccessible(page, 'Ops', 'Ops Cockpit')
  })

  test('GitHub has no serious automated accessibility violations', async ({ page }) => {
    await expectCriticalScreenAccessible(page, 'GitHub', 'Command Center')
  })
})
