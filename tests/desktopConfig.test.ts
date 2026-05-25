import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadDesktopEnv, parseDesktopEnvFile, type EnvRecord } from '../desktop/config'
import { DEFAULT_DESKTOP_PORT, requestedDesktopPort } from '../desktop/runtimeConfig'

describe('desktop config loading', () => {
  it('parses simple env files without retaining comments', () => {
    expect(
      parseDesktopEnvFile(`
        # comment
        OPENAI_MODEL="gpt-5"
        GITHUB_OWNER=jmars319
      `),
    ).toEqual([
      { key: 'OPENAI_MODEL', value: 'gpt-5' },
      { key: 'GITHUB_OWNER', value: 'jmars319' },
    ])
  })

  it('uses shell env first, app config second, and repo .env third', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'atlas-desktop-config-'))
    const appPath = path.join(dir, 'app')
    const userDataPath = path.join(dir, 'user-data')
    const env: EnvRecord = {
      GITHUB_OWNER: 'shell-owner',
    }

    mkdirSync(appPath)
    mkdirSync(userDataPath)
    writeFileSync(
      path.join(appPath, '.env'),
      ['GITHUB_OWNER=repo-owner', 'OPENAI_MODEL=repo-model', 'VERCEL_TOKEN=repo-token'].join(
        '\n',
      ),
    )
    writeFileSync(
      path.join(userDataPath, 'atlas.env'),
      ['OPENAI_MODEL=config-model', 'SUPABASE_URL=https://example.supabase.co'].join('\n'),
    )

    try {
      const result = loadDesktopEnv({ appPath, userDataPath, env })

      expect(result.configPath).toBe(path.join(userDataPath, 'atlas.env'))
      expect(env.GITHUB_OWNER).toBe('shell-owner')
      expect(env.OPENAI_MODEL).toBe('config-model')
      expect(env.VERCEL_TOKEN).toBe('repo-token')
      expect(env.SUPABASE_URL).toBe('https://example.supabase.co')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('derives the desktop API port from an existing loopback GitHub callback', () => {
    expect(
      requestedDesktopPort({
        GITHUB_APP_CALLBACK_URL: 'http://127.0.0.1:5173/api/github/auth/callback',
      }),
    ).toBe(5173)
    expect(
      requestedDesktopPort({
        ATLAS_DESKTOP_API_PORT: '',
        GITHUB_APP_CALLBACK_URL: 'http://127.0.0.1:5173/api/github/auth/callback',
      }),
    ).toBe(5173)
    expect(
      requestedDesktopPort({
        ATLAS_DESKTOP_API_PORT: '52173',
        GITHUB_APP_CALLBACK_URL: 'http://127.0.0.1:5173/api/github/auth/callback',
      }),
    ).toBe(52173)
    expect(
      requestedDesktopPort({
        GITHUB_APP_CALLBACK_URL: 'https://example.com/api/github/auth/callback',
      }),
    ).toBe(DEFAULT_DESKTOP_PORT)
  })
})
