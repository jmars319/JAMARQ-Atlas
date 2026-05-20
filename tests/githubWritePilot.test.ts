import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { githubWriteApiMiddleware } from '../server/githubWriteApi'
import {
  createGithubIssueDraftFromIntent,
  githubWritePilotConfirmationPhrase,
  validateGithubWritePilotDraft,
} from '../src/services/githubWritePilot'
import type { AtlasActionIntent } from '../src/services/actionPlanner'

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

function request({
  url,
  method = 'GET',
  body,
  headers = {},
}: {
  url: string
  method?: string
  body?: unknown
  headers?: Record<string, string>
}) {
  const text = body === undefined ? '' : JSON.stringify(body)
  const stream = Readable.from(text ? [text] : []) as IncomingMessage

  stream.url = url
  stream.method = method
  stream.headers = {
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    ...headers,
  }

  return stream
}

async function route(requestMessage: IncomingMessage) {
  const response = new TestResponse()

  await githubWriteApiMiddleware(requestMessage, response as unknown as ServerResponse)

  return {
    status: response.statusCode,
    body: JSON.parse(response.body),
  }
}

function writeEnv() {
  vi.stubEnv('GITHUB_TOKEN', 'ghp_test')
  vi.stubEnv('GH_TOKEN', '')
}

function intent(): AtlasActionIntent {
  return {
    id: 'action-jmars319-jamarq-atlas-investigate-failed-ci-workflow',
    kind: 'investigate-failed-ci',
    group: 'ci-check-failures',
    source: 'github-command',
    risk: 'high',
    status: 'locked',
    title: 'jmars319/JAMARQ-Atlas: investigate failed CI',
    detail: 'unit tests / npm run test:unit / failure',
    reason: 'Latest workflow evidence failed.',
    target: {
      owner: 'jmars319',
      repo: 'JAMARQ-Atlas',
      repositoryKey: 'jmars319/JAMARQ-Atlas',
      repositoryUrl: 'https://github.com/jmars319/JAMARQ-Atlas',
      projectId: 'atlas',
      projectName: 'Atlas',
    },
    evidence: [
      {
        label: 'Workflow',
        value: 'Atlas CI',
        url: 'https://github.com/jmars319/JAMARQ-Atlas/actions/runs/10',
      },
    ],
    occurredAt: '2026-05-20T12:00:00Z',
    locked: true,
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('GitHub write pilot API', () => {
  it('reports disabled capability when no server-side token is available', async () => {
    vi.stubEnv('GITHUB_TOKEN', '')
    vi.stubEnv('GH_TOKEN', '')

    const result = await route(
      request({
        url: '/api/github/write/capability?owner=jmars319&repo=JAMARQ-Atlas',
      }),
    )

    expect(result.status).toBe(200)
    expect(result.body).toMatchObject({
      repositoryKey: 'jmars319/JAMARQ-Atlas',
      issueCommentPilotEnabled: false,
      writeControlsEnabled: false,
    })
    expect(result.body.blockers.join(' ')).toContain('Sign in')
  })

  it('creates GitHub issues with title/body only and exact confirmation', async () => {
    writeEnv()
    const fetchMock = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      expect(String(input)).toBe('https://api.github.com/repos/jmars319/JAMARQ-Atlas/issues')
      expect(init?.method).toBe('POST')
      expect(JSON.parse(String(init?.body))).toEqual({
        title: 'Atlas follow-up',
        body: 'Review this failed CI run.',
      })

      return new Response(
        JSON.stringify({
          id: 44,
          number: 44,
          title: 'Atlas follow-up',
          body: 'Review this failed CI run.',
          html_url: 'https://github.com/jmars319/JAMARQ-Atlas/issues/44',
          url: 'https://api.github.com/repos/jmars319/JAMARQ-Atlas/issues/44',
          created_at: '2026-05-20T12:00:00Z',
          user: { login: 'jmars319' },
        }),
        { status: 201 },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await route(
      request({
        url: '/api/github/write/issues',
        method: 'POST',
        body: {
          owner: 'jmars319',
          repo: 'JAMARQ-Atlas',
          title: 'Atlas follow-up',
          body: 'Review this failed CI run.',
          sourceIntentId: 'action-1',
          projectId: 'atlas',
          confirmation: 'CREATE ISSUE jmars319/JAMARQ-Atlas',
        },
      }),
    )

    expect(result.status).toBe(201)
    expect(result.body).toMatchObject({
      ok: true,
      kind: 'create-issue',
      number: 44,
      htmlUrl: 'https://github.com/jmars319/JAMARQ-Atlas/issues/44',
      writeControlsEnabled: false,
      issueCommentPilotEnabled: true,
    })
  })

  it('posts issue and PR conversation comments with exact confirmation', async () => {
    writeEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: 5500,
            body: 'Atlas comment',
            html_url: 'https://github.com/jmars319/JAMARQ-Atlas/issues/12#issuecomment-5500',
            url: 'https://api.github.com/repos/jmars319/JAMARQ-Atlas/issues/comments/5500',
            created_at: '2026-05-20T12:05:00Z',
            user: { login: 'jmars319' },
          }),
          { status: 201 },
        ),
      ),
    )

    const result = await route(
      request({
        url: '/api/github/write/comments',
        method: 'POST',
        body: {
          owner: 'jmars319',
          repo: 'JAMARQ-Atlas',
          issueNumber: 12,
          body: 'Atlas comment',
          sourceDetailId: 'github-issues-jmars319/JAMARQ-Atlas-12',
          confirmation: 'COMMENT jmars319/JAMARQ-Atlas#12',
        },
      }),
    )

    expect(result.status).toBe(201)
    expect(result.body).toMatchObject({
      ok: true,
      kind: 'create-comment',
      number: 12,
      htmlUrl: 'https://github.com/jmars319/JAMARQ-Atlas/issues/12#issuecomment-5500',
      writeControlsEnabled: false,
    })
  })

  it('rejects invalid drafts and confirmation mismatches before calling GitHub', async () => {
    writeEnv()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const invalid = await route(
      request({
        url: '/api/github/write/issues',
        method: 'POST',
        body: {
          owner: 'jmars319',
          repo: 'JAMARQ-Atlas',
          title: '',
          body: '',
          confirmation: '',
        },
      }),
    )
    const mismatch = await route(
      request({
        url: '/api/github/write/comments',
        method: 'POST',
        body: {
          owner: 'jmars319',
          repo: 'JAMARQ-Atlas',
          issueNumber: 12,
          body: 'Comment body',
          confirmation: 'COMMENT jmars319/JAMARQ-Atlas#13',
        },
      }),
    )

    expect(invalid.status).toBe(400)
    expect(invalid.body.error.type).toBe('bad-request')
    expect(mismatch.status).toBe(409)
    expect(mismatch.body.error.type).toBe('confirmation-mismatch')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps GitHub permission and validation failures as write pilot evidence', async () => {
    writeEnv()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ message: 'Validation Failed' }), { status: 422 }),
      ),
    )

    const result = await route(
      request({
        url: '/api/github/write/issues',
        method: 'POST',
        body: {
          owner: 'jmars319',
          repo: 'JAMARQ-Atlas',
          title: 'Atlas follow-up',
          body: 'Review this failed CI run.',
          confirmation: 'CREATE ISSUE jmars319/JAMARQ-Atlas',
        },
      }),
    )

    expect(result.status).toBe(422)
    expect(result.body.error.type).toBe('validation-failed')
    expect(result.body.issueCommentPilotEnabled).toBe(true)
  })

  it('keeps unsupported GitHub write methods and broad GitHub routes locked', async () => {
    const putResult = await route(
      request({
        url: '/api/github/write/issues',
        method: 'PUT',
      }),
    )

    expect(putResult.status).toBe(405)
    expect(putResult.body.error.message).toContain('POST issue/comment routes')
  })
})

describe('GitHub write pilot drafts', () => {
  it('builds issue drafts from action intent evidence', () => {
    const draft = createGithubIssueDraftFromIntent(intent())

    expect(draft.kind).toBe('create-issue')
    expect(draft.projectId).toBe('atlas')
    expect(draft.body).toContain('Workflow: Atlas CI')
    expect(validateGithubWritePilotDraft(draft)).toEqual([])
    expect(githubWritePilotConfirmationPhrase(draft)).toBe('CREATE ISSUE jmars319/JAMARQ-Atlas')
  })
})
