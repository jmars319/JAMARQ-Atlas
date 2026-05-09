import { expect, test } from '@playwright/test'

test('operator can edit manual state and generate a writing prompt', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: 'JAMARQ Atlas' })).toBeVisible()
  await expect(page.getByLabel('Atlas status board')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Active' })).toBeVisible()

  await page.getByRole('button', { name: 'Dispatch' }).click()
  await expect(page.getByRole('heading', { name: 'Deployment Readiness' })).toBeVisible()
  await expect(page.locator('button.dispatch-card').filter({ hasText: 'Midway Music Hall production' })).toBeVisible()
  await page.locator('button.dispatch-card').filter({ hasText: 'Midway Music Hall production' }).click()

  const detail = page.locator('.project-detail')
  await expect(detail.getByRole('heading', { name: 'Midway Music Hall production' })).toBeVisible()
  const deploymentNotesField = detail
    .locator('label.field')
    .filter({ hasText: 'Deployment notes' })
    .locator('textarea')

  await deploymentNotesField.fill('E2E dispatch note')
  await page.reload()
  await expect(deploymentNotesField).toHaveValue('E2E dispatch note')

  await page.getByRole('button', { name: 'Board', exact: true }).click()
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
