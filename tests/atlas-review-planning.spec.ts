import { expect, test } from '@playwright/test'
import { clickAtlasNav } from './helpers/atlasTestUtils'

test('operator can batch Review items into explicit Planning notes', async ({ page }) => {
  await page.goto('/')
  await clickAtlasNav(page, 'Review')

  await expect(page.getByRole('heading', { name: 'Review Center' })).toBeVisible()
  await expect(page.getByLabel('Review queue mode')).toContainText("Today's review")
  await expect(page.getByLabel('Operator review queue')).toContainText('Due / overdue')

  await page.getByRole('button', { name: 'Full queue' }).click()
  await expect(page.getByLabel('Operator review queue')).toContainText('Dispatch')

  const batchActions = page.getByLabel('Review batch planning actions')
  await batchActions.getByRole('button', { name: 'Select project items' }).click()
  await expect(batchActions).toContainText(/selected/)
  await batchActions.getByRole('button', { name: 'Create Planning notes' }).click()
  const reviewActionMessage = page.locator('.review-action-message')
  await expect(reviewActionMessage).toContainText(
    'Planning notes created from Review',
  )
  await reviewActionMessage.getByRole('button', { name: 'Open Planning' }).click()

  await expect(page.getByRole('heading', { name: 'Planning Center' })).toBeVisible()
  await expect(page.getByLabel('Planning records', { exact: true })).toContainText(
    'Review follow-up:',
  )
  await expect(page.getByLabel('Planning records', { exact: true })).toContainText('Review note')
  await expect(page.locator('.planning-summary')).toContainText('Review handoffs')
})
