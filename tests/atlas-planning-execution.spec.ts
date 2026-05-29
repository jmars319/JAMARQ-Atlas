import { expect, test } from '@playwright/test'
import { clickAtlasNav } from './helpers/atlasTestUtils'

test('Planning execution panel starts and completes a local work session', async ({ page }) => {
  await page.goto('/')
  await clickAtlasNav(page, 'Planning')

  await page.getByLabel('Planning kind', { exact: true }).selectOption('work-session')
  await page.getByLabel('New planning status').selectOption('planned')
  await page.getByLabel('Planning title').fill('Workspace tasks 1-5 implementation pass')
  await page
    .getByLabel('Planning detail')
    .fill('Local Planning evidence for the Scout, Atlas, Align, Regional Game Clock, and SiteOps pass.')
  await page.getByRole('button', { name: 'Add planning record' }).click()

  const execution = page.getByLabel('Planning execution')
  const executionCard = execution
    .locator('.planning-execution-card')
    .filter({ hasText: 'Workspace tasks 1-5 implementation pass' })

  await expect(executionCard).toBeVisible()
  await executionCard.getByRole('button', { name: 'Start' }).click()
  await expect(executionCard).toContainText('Active')

  await executionCard.getByRole('button', { name: 'Done' }).click()
  await expect(executionCard).toHaveCount(0)
  await expect(
    page
      .getByLabel('Planning records')
      .locator('.planning-card')
      .filter({ hasText: 'Workspace tasks 1-5 implementation pass' }),
  ).toContainText('Done')
})
