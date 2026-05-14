import { expect, test, type Page } from '@playwright/test'
import { clickAtlasNav, type AtlasNavLabel } from './helpers/atlasTestUtils'

const criticalViews: Array<{ nav: AtlasNavLabel | null; heading: string; landmark: string }> = [
  { nav: null, heading: 'JAMARQ Atlas', landmark: 'Atlas status board' },
  { nav: 'Review', heading: 'Review Center', landmark: 'Operator review queue' },
  { nav: 'Planning', heading: 'Planning Center', landmark: 'Planning records' },
  { nav: 'Settings', heading: 'Settings & Connections', landmark: 'Calibration progress summary' },
  { nav: 'Data', heading: 'Backups & Restore', landmark: 'Local store diagnostics' },
  { nav: 'Dispatch', heading: 'Deployment Readiness', landmark: 'Dispatch closeout analytics' },
  { nav: 'Ops', heading: 'Ops Cockpit', landmark: 'Ops daily queue' },
  { nav: 'GitHub', heading: 'Repository Intake', landmark: 'GitHub intake counts' },
  { nav: 'Writing', heading: 'Writing Workbench', landmark: 'Writing draft history' },
]

async function expectCriticalViewsRender(page: Page) {
  await page.goto('/')

  for (const view of criticalViews) {
    if (view.nav) {
      await clickAtlasNav(page, view.nav)
    }

    await expect(page.getByRole('heading', { name: view.heading })).toBeVisible()
    await expect(page.getByLabel(view.landmark, { exact: true })).toBeVisible()
  }
}

test('desktop critical views render without layout-level smoke failures', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await expectCriticalViewsRender(page)
})

test('mobile critical views render without layout-level smoke failures', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await expectCriticalViewsRender(page)
})
