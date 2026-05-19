import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { githubApiMiddleware } from '../server/githubApi'
import {
  createGithubAuthStatus,
  getGithubAppConfig,
  resolveGithubAuthForRequest,
  verifySignedState,
} from '../server/githubAuth'

function request(
  url = '/api/github/status',
  method = 'GET',
  headers: Record<string, string> = {},
) {
  return {
    url,
    method,
    headers,
    socket: {},
  } as IncomingMessage
}

class TestResponse {
  statusCode = 200
  body = ''
  headers = new Map<string, string | string[]>()

  setHeader(name: string, value: string | string[]) {
    this.headers.set(name.toLowerCase(), value)
  }

  getHeader(name: string) {
    return this.headers.get(name.toLowerCase())
  }

  end(value?: string) {
    this.body += value ?? ''
  }
}

function signedState(sessionId: string, nonce: string, secret: string) {
  const signature = createHmac('sha256', secret).update(`${sessionId}:${nonce}`).digest('base64url')

  return `${nonce}.${signature}`
}

describe('GitHub App auth status', () => {
  it('reports missing app config without exposing write controls', async () => {
    const status = await createGithubAuthStatus(request(), {})

    expect(status.configured).toBe(false)
    expect(status.githubAppConfigured).toBe(false)
    expect(status.authenticated).toBe(false)
    expect(status.authMode).toBe('none')
    expect(status.writeControlsEnabled).toBe(false)
    expect(status.missingConfig).toContain('GITHUB_APP_CLIENT_ID')
  })

  it('keeps the legacy env-token fallback for local tests', async () => {
    const env = { GITHUB_TOKEN: 'ghp_test', GITHUB_REPOS: 'jmars319/JAMARQ-Atlas' }
    const status = await createGithubAuthStatus(request(), env)
    const auth = await resolveGithubAuthForRequest(request(), env)

    expect(status.configured).toBe(true)
    expect(status.authMode).toBe('server-env')
    expect(status.configuredRepos).toEqual(['jmars319/JAMARQ-Atlas'])
    expect(auth).toMatchObject({ mode: 'server-env', token: 'ghp_test' })
  })

  it('validates signed OAuth state values', () => {
    const valid = signedState('session-1', 'nonce-1', 'secret-1')

    expect(verifySignedState(valid, 'session-1', 'secret-1')).toBe(true)
    expect(verifySignedState(valid, 'session-2', 'secret-1')).toBe(false)
    expect(verifySignedState(`${valid}tampered`, 'session-1', 'secret-1')).toBe(false)
  })

  it('detects complete GitHub App config', () => {
    const config = getGithubAppConfig({
      GITHUB_APP_CLIENT_ID: 'client-id',
      GITHUB_APP_CLIENT_SECRET: 'client-secret',
      GITHUB_APP_SLUG: 'atlas-local',
      GITHUB_APP_CALLBACK_URL: 'http://127.0.0.1:5173/api/github/auth/callback',
      ATLAS_SESSION_SECRET: 'session-secret',
    })

    expect(config.configured).toBe(true)
    expect(config.missing).toEqual([])
  })

  it('does not expose mutating GitHub resource routes', async () => {
    const response = new TestResponse()

    await githubApiMiddleware(
      request('/api/github/repos', 'POST'),
      response as unknown as ServerResponse,
    )

    expect(response.statusCode).toBe(405)
    expect(JSON.parse(response.body).error.message).toContain('read-only GET routes')
  })
})
