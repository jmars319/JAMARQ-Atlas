import { expect, type Locator, type Page } from '@playwright/test'

export type AtlasNavLabel =
  | 'Board'
  | 'Timeline'
  | 'GitHub'
  | 'Planning'
  | 'Reports'
  | 'Review'
  | 'Dispatch'
  | 'Ops'
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

export async function uploadJsonFile(locator: Locator, filename: string, value: unknown) {
  await locator.setInputFiles({
    name: filename,
    mimeType: 'application/json',
    buffer: Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)),
  })
}

export async function uploadCsvFile(locator: Locator, filename: string, value: string) {
  await locator.setInputFiles({
    name: filename,
    mimeType: 'text/csv',
    buffer: Buffer.from(value),
  })
}

export async function readAtlasLocalStorage<T = unknown>(
  page: Page,
  key: string,
  fallback: T,
): Promise<T> {
  return page.evaluate(
    ({ storageKey, fallbackValue }) => {
      const stored = window.localStorage.getItem(storageKey)
      return stored ? (JSON.parse(stored) as T) : fallbackValue
    },
    { storageKey: key, fallbackValue: fallback },
  )
}

export async function writeAtlasLocalStorage(page: Page, key: string, value: unknown) {
  await page.evaluate(
    ({ storageKey, storageValue }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(storageValue))
    },
    { storageKey: key, storageValue: value },
  )
}

export async function fillTypedRestoreConfirmation(page: Page, label: string) {
  await page.getByLabel(label, { exact: true }).fill('RESTORE ATLAS')
}

export async function expectSettingsConnectionStatus(page: Page, title: string, text: string | RegExp) {
  await expect(page.locator('.settings-connection-card').filter({ hasText: title })).toContainText(
    text,
  )
}

export async function expectDataStoreDiagnosticDetail(page: Page, text: string | RegExp) {
  const diagnostics = page.getByLabel('Local store diagnostics')
  await diagnostics.getByText('Store details').first().click()
  await expect(diagnostics).toContainText(text)
}
