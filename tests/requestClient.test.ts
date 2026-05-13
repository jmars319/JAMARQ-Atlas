import { afterEach, describe, expect, test, vi } from 'vitest'
import { requestJson, requestJsonResponse, redactRequestMessage } from '../src/services/requestClient'

describe('requestClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  test('redacts credential-shaped diagnostics', () => {
    expect(
      redactRequestMessage(
        'OpenAI failed for sk-testsecret with token=abc123 and Authorization: Bearer ghp_secret',
      ),
    ).not.toContain('sk-testsecret')
    expect(redactRequestMessage('password=hunter2')).toBe('password=[redacted]')
  })

  test('retries safe JSON reads', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(requestJson<{ ok: boolean }>('/api/test', {}, { retries: 1 })).resolves.toEqual({
      ok: true,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  test('returns response metadata for non-ok API bodies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { message: 'token=secret failed' } }), {
            status: 503,
          }),
        ),
      ),
    )

    const result = await requestJsonResponse<{ error: { message: string } }>('/api/test')

    expect(result.response.ok).toBe(false)
    expect(result.body?.error.message).toContain('token=secret')
    await expect(requestJson('/api/test')).rejects.toThrow('token=[redacted]')
  })
})
