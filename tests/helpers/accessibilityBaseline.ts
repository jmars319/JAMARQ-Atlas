import { expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

export const ACTIONABLE_A11Y_IMPACTS = ['critical', 'serious'] as const

export async function expectNoActionableA11yViolations(
  page: Page,
  options: {
    include?: string
    disabledRules?: string[]
  } = {},
) {
  const results = await new AxeBuilder({ page })
    .include(options.include ?? '.app-shell')
    .disableRules(options.disabledRules ?? ['color-contrast'])
    .analyze()
  const actionableViolations = results.violations.filter((violation) =>
    ACTIONABLE_A11Y_IMPACTS.includes(violation.impact as (typeof ACTIONABLE_A11Y_IMPACTS)[number]),
  )

  expect(actionableViolations).toEqual([])
}
