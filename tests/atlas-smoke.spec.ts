import { expect, test } from '@playwright/test'

test('operator can edit manual state and generate a writing prompt', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'JAMARQ Atlas' })).toBeVisible()
  await page.locator('button.project-row').filter({ hasText: 'VaexCore Studio' }).click()
  await expect(page.getByRole('heading', { name: 'VaexCore Studio' })).toBeVisible()

  const detail = page.locator('.project-detail')
  const statusField = detail.locator('label.field').filter({ hasText: 'Status' }).locator('select')
  const nextActionField = detail
    .locator('label.field')
    .filter({ hasText: 'Next action' })
    .locator('textarea')

  await statusField.selectOption('Waiting')
  await nextActionField.fill('Interaction check persisted next action')
  await page.getByRole('button', { name: 'Summarize activity' }).click()

  await expect(page.locator('.draft-output')).toHaveValue(/Do not decide or change status/)

  await page.reload()
  await page.locator('button.project-row').filter({ hasText: 'VaexCore Studio' }).click()
  await expect(nextActionField).toHaveValue('Interaction check persisted next action')

  await page.getByRole('button', { name: 'Reset seed' }).click()
  await page.reload()
  await page.locator('button.project-row').filter({ hasText: 'VaexCore Studio' }).click()
  await expect(nextActionField).not.toHaveValue('Interaction check persisted next action')
})
