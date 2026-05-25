import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron, expect, test, type ElectronApplication } from '@playwright/test'

async function launchAtlas(userDataDir: string) {
  return electron.launch({
    args: [path.resolve('.vite/build/main.js')],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: undefined,
      ATLAS_DESKTOP_USER_DATA_DIR: userDataDir,
      ATLAS_DESKTOP_API_PORT: '0',
      GITHUB_TOKEN: '',
      GH_TOKEN: '',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      OPENAI_API_KEY: '',
      VERCEL_TOKEN: '',
      ATLAS_HOST_PREFLIGHT_CONFIG: '',
    },
  })
}

async function firstWindow(app: ElectronApplication) {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  return page
}

test.describe('Atlas desktop app', () => {
  let userDataDir = ''

  test.beforeEach(() => {
    userDataDir = mkdtempSync(path.join(tmpdir(), 'atlas-desktop-e2e-'))
  })

  test.afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
  })

  test('launches core views and reports SQLite storage', async () => {
    const app = await launchAtlas(userDataDir)

    try {
      const page = await firstWindow(app)

      await expect(page.getByText('JAMARQ operator dashboard')).toBeVisible()
      await page.getByRole('button', { name: 'Settings' }).click()
      await expect(page.getByRole('heading', { name: 'Local Workspace Identity' })).toBeVisible()
      await expect(page.getByText('Storage: SQLite')).toBeVisible()
      await expect(page.getByText('GitHub App Auth Checkpoint')).toBeVisible()
      await expect(page.evaluate(() => window.atlasDesktop?.storageBackend)).resolves.toBe('sqlite')

      await page.getByRole('button', { name: 'Data' }).click()
      await expect(page.getByRole('heading', { name: 'Store Diagnostics' })).toBeVisible()

      await page.getByRole('button', { name: 'Dispatch' }).click()
      await expect(page.getByRole('heading', { name: 'Deployment Readiness' })).toBeVisible()
    } finally {
      await app.close()
    }
  })

  test('persists local settings through SQLite across relaunch', async () => {
    const firstApp = await launchAtlas(userDataDir)

    try {
      const page = await firstWindow(firstApp)

      await page.getByRole('button', { name: 'Settings' }).click()
      await page.getByLabel('Operator label').fill('Desktop E2E Operator')
      await expect(page.getByLabel('Operator label')).toHaveValue('Desktop E2E Operator')
    } finally {
      await firstApp.close()
    }

    const secondApp = await launchAtlas(userDataDir)

    try {
      const page = await firstWindow(secondApp)

      await page.getByRole('button', { name: 'Settings' }).click()
      await expect(page.getByLabel('Operator label')).toHaveValue('Desktop E2E Operator')
    } finally {
      await secondApp.close()
    }
  })
})
