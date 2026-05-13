import type { WritingDraft, WritingProviderResult } from '../domain/writing'

export interface WritingProviderStatusResponse {
  provider: 'openai'
  configured: boolean
  model: string
  message: string
}

export interface WritingProviderApiError {
  type: 'not-configured' | 'openai-error' | 'invalid-request' | 'unknown'
  message: string
}

interface WritingProviderApiResponse<T> {
  ok: boolean
  configured: boolean
  data: T | null
  error: WritingProviderApiError | null
}

interface WritingProviderGenerateResponse {
  provider: 'openai'
  model: string
  generatedText: string
  generatedAt: string
  message: string
}

export function normalizeWritingProviderError(
  value: unknown,
  fallbackMessage: string,
): WritingProviderApiError {
  if (typeof value === 'object' && value !== null) {
    const candidate = value as Partial<WritingProviderApiError>
    const type =
      candidate.type === 'not-configured' ||
      candidate.type === 'openai-error' ||
      candidate.type === 'invalid-request' ||
      candidate.type === 'unknown'
        ? candidate.type
        : 'unknown'

    return {
      type,
      message: typeof candidate.message === 'string' ? candidate.message : fallbackMessage,
    }
  }

  return {
    type: 'unknown',
    message: fallbackMessage,
  }
}

async function readWritingBody<T>(response: Response): Promise<WritingProviderApiResponse<T> | null> {
  try {
    return (await response.json()) as WritingProviderApiResponse<T>
  } catch {
    return null
  }
}

async function fetchWritingJson<T>(
  path: string,
  init?: RequestInit,
): Promise<WritingProviderApiResponse<T>> {
  try {
    const response = await fetch(path, init)
    const body = await readWritingBody<T>(response)

    if (!response.ok) {
      return {
        ok: false,
        configured: body?.configured ?? false,
        data: null,
        error: normalizeWritingProviderError(
          body?.error,
          `Atlas Writing API returned ${response.status}.`,
        ),
      }
    }

    if (body) {
      return {
        ...body,
        error: body.error
          ? normalizeWritingProviderError(body.error, 'Atlas Writing API returned an error.')
          : null,
      }
    }

    return {
      ok: false,
      configured: false,
      data: null,
      error: {
        type: 'unknown',
        message: 'Atlas Writing API returned an unreadable response.',
      },
    }
  } catch (error) {
    return {
      ok: false,
      configured: false,
      data: null,
      error: {
        type: 'unknown',
        message: error instanceof Error ? error.message : 'Atlas Writing API request failed.',
      },
    }
  }
}

export function normalizeWritingProviderResult(value: unknown): WritingProviderResult {
  if (typeof value !== 'object' || value === null) {
    return getStubWritingProviderResult()
  }

  const candidate = value as Partial<WritingProviderResult>
  const status =
    candidate.status === 'not-configured' ||
    candidate.status === 'stub' ||
    candidate.status === 'configured' ||
    candidate.status === 'generated' ||
    candidate.status === 'error'
      ? candidate.status
      : 'stub'

  return {
    status,
    providerName: typeof candidate.providerName === 'string' ? candidate.providerName : 'local-stub',
    model: typeof candidate.model === 'string' ? candidate.model : '',
    message:
      typeof candidate.message === 'string'
        ? candidate.message
        : 'Writing provider status was normalized locally.',
    generatedText: typeof candidate.generatedText === 'string' ? candidate.generatedText : null,
    generatedAt: typeof candidate.generatedAt === 'string' ? candidate.generatedAt : null,
  }
}

export function getStubWritingProviderResult(): WritingProviderResult {
  return {
    status: 'stub',
    providerName: 'local-stub',
    model: '',
    generatedText: null,
    generatedAt: null,
    message:
      'Writing provider is not configured. Atlas generated a local template draft and prompt packet only.',
  }
}

export function fetchWritingProviderStatus(signal?: AbortSignal) {
  return fetchWritingJson<WritingProviderStatusResponse>('/api/writing/status', { signal })
}

export async function requestWritingProviderDraft(draft: WritingDraft): Promise<WritingProviderResult> {
  try {
    const result = await fetchWritingJson<WritingProviderGenerateResponse>('/api/writing/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        draftId: draft.id,
        title: draft.title,
        templateId: draft.templateId,
        promptPacket: draft.promptPacket,
        contextSnapshot: draft.contextSnapshot,
      }),
    })

    if (result.ok && result.data) {
      return {
        status: 'generated',
        providerName: result.data.provider,
        model: result.data.model,
        generatedText: result.data.generatedText,
        generatedAt: result.data.generatedAt,
        message: result.data.message,
      }
    }

    return {
      status: result.error?.type === 'not-configured' ? 'not-configured' : 'error',
      providerName: 'openai',
      model: '',
      generatedText: null,
      generatedAt: null,
      message:
        result.error?.message ||
        'Writing provider did not return a suggestion. Draft text was not changed.',
    }
  } catch (error) {
    return {
      status: 'error',
      providerName: 'openai',
      model: '',
      generatedText: null,
      generatedAt: null,
      message: error instanceof Error ? error.message : 'Writing provider request failed.',
    }
  }
}
