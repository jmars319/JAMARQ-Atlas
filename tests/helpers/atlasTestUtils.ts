import type { Page } from '@playwright/test'

export type AtlasNavLabel =
  | 'Board'
  | 'Timeline'
  | 'GitHub'
  | 'Planning'
  | 'Reports'
  | 'Review'
  | 'Dispatch'
  | 'Verification'
  | 'Writing'
  | 'Data'
  | 'Settings'

export async function clickAtlasNav(page: Page, label: AtlasNavLabel) {
  await page.getByRole('button', { name: label, exact: true }).click()
}

export async function installAtlasClipboardMock(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          window.localStorage.setItem('atlas-e2e-clipboard', text)
        },
      },
    })
  })
}
