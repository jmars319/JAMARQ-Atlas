import { expect, test, type Page } from '@playwright/test'
import { clickAtlasNav, type AtlasNavLabel } from './helpers/atlasTestUtils'

const criticalViews: Array<{ nav: AtlasNavLabel | null; heading: string; landmark: string }> = [
  { nav: null, heading: 'Atlas by Tenra', landmark: 'Atlas status board' },
  { nav: 'Optimize', heading: 'Portfolio Optimization', landmark: 'Portfolio Optimization Center' },
  { nav: 'Review', heading: 'Review Center', landmark: 'Operator review queue' },
  { nav: 'Planning', heading: 'Planning Center', landmark: 'Planning records' },
  { nav: 'Settings', heading: 'Settings & Connections', landmark: 'Calibration progress summary' },
  { nav: 'Data', heading: 'Backups & Restore', landmark: 'Local store diagnostics' },
  { nav: 'Dispatch', heading: 'Deployment Readiness', landmark: 'Dispatch closeout analytics' },
  { nav: 'Ops', heading: 'Ops Cockpit', landmark: 'Ops daily queue' },
  { nav: 'GitHub', heading: 'Command Center', landmark: 'GitHub command counts' },
  { nav: 'Writing', heading: 'Writing Workbench', landmark: 'Writing draft history' },
]

const navLabels: AtlasNavLabel[] = [
  'Board',
  'Optimize',
  'GitHub',
  'Planning',
  'Review',
  'Dispatch',
  'Timeline',
  'Ops',
  'Verification',
  'Writing',
  'Reports',
  'Data',
  'Settings',
]

async function expectNoPageOverflow(page: Page) {
  const layout = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }))

  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth)
}

async function expectNavReachable(page: Page) {
  const atlasNav = page.getByLabel('Atlas views')

  for (const label of navLabels) {
    const button = atlasNav.getByRole('button', { name: label, exact: true })
    await expect(button).toBeVisible()
    const box = await button.boundingBox()

    expect(box, `${label} nav button should have a visible box`).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(
      (await page.viewportSize())?.width ?? Number.POSITIVE_INFINITY,
    )
  }
}

async function expectCriticalViewsRender(page: Page) {
  await page.goto('/')

  for (const view of criticalViews) {
    if (view.nav) {
      await clickAtlasNav(page, view.nav)
    }

    await expect(page.getByRole('heading', { name: view.heading })).toBeVisible()
    await expect(page.getByLabel(view.landmark, { exact: true })).toBeVisible()
    await expectNoPageOverflow(page)
    await expectNavReachable(page)
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

test('tablet critical views keep navigation reachable without horizontal page overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 768, height: 1024 })
  await expectCriticalViewsRender(page)
})
