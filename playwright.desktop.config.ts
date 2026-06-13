import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/desktop',
  testMatch: /.*\.spec\.ts/,
  timeout: 60_000,
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
})
