import type { IncomingMessage, ServerResponse } from 'node:http'
import OpenAI from 'openai'

type EnvRecord = Record<string, string | undefined>

type WritingApiErrorType = 'not-configured' | 'openai-error' | 'invalid-request' | 'unknown'

interface WritingApiError {
  type: WritingApiErrorType
  message: string
}

type WritingApiResponse<T> = {
  ok: boolean
  configured: boolean
  data: T | null
  error: WritingApiError | null
}

interface WritingProviderConfig {
  configured: boolean
  apiKey: string
  model: string
}

interface WritingGeneratePayload {
  draftId: string
  title: string
  templateId: string
  promptPacket: string
  contextSnapshot: unknown
}

const DEFAULT_OPENAI_MODEL = 'gpt-5'

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body, null, 2))
}

function writingResponse<T>({
  configured,
  data,
  error,
}: {
  configured: boolean
  data: T | null
  error: WritingApiError | null
}): WritingApiResponse<T> {
  return {
    ok: !error,
    configured,
    data,
    error,
  }
}

export function getWritingProviderConfig(env: EnvRecord = process.env): WritingProviderConfig {
  const apiKey = env.OPENAI_API_KEY ?? ''
  const model = env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL

  return {
    configured: Boolean(apiKey),
    apiKey,
    model,
  }
}

export function createWritingProviderStatus(config: WritingProviderConfig) {
  return writingResponse({
    configured: config.configured,
    data: {
      provider: 'openai' as const,
      configured: config.configured,
      model: config.model,
      message: config.configured
        ? 'OpenAI draft-only Writing provider is configured.'
        : 'Set OPENAI_API_KEY to enable draft-only provider suggestions.',
    },
    error: null,
  })
}

export function createWritingProviderNotConfiguredResponse(config: WritingProviderConfig) {
  return writingResponse<never>({
    configured: false,
    data: null,
    error: {
      type: 'not-configured',
      message: `OpenAI Writing provider is not configured. Set OPENAI_API_KEY to generate suggestions with ${config.model}.`,
    },
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = []

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  const body = Buffer.concat(chunks).toString('utf8')
  return body ? JSON.parse(body) : null
}

function readGeneratePayload(value: unknown): WritingGeneratePayload | null {
  if (!isRecord(value)) {
    return null
  }

  const promptPacket = readString(value.promptPacket)

  if (!promptPacket.trim()) {
    return null
  }

  return {
    draftId: readString(value.draftId),
    title: readString(value.title),
    templateId: readString(value.templateId),
    promptPacket,
    contextSnapshot: value.contextSnapshot ?? null,
  }
}

export function createWritingProviderInput(payload: WritingGeneratePayload) {
  return [
    {
      role: 'developer' as const,
      content: [
        'You are the JAMARQ Atlas draft-only Writing provider.',
        'Return draft text only for human review.',
        'You may summarize, rewrite, format, and draft operational language.',
        'You must not decide or change status, risk, priority, roadmap, verification, Dispatch readiness, GitHub bindings, or what ships.',
        'Do not claim that a client update was sent, a release was published, work was shipped, or verification was completed.',
        'Use questions or review notes when facts are missing or uncertain.',
      ].join('\n'),
    },
    {
      role: 'user' as const,
      content: [
        `Draft title: ${payload.title || 'Atlas Writing draft'}`,
        `Template: ${payload.templateId || 'unknown'}`,
        '',
        'Prompt packet:',
        payload.promptPacket,
        '',
        'Context snapshot JSON:',
        JSON.stringify(payload.contextSnapshot ?? {}, null, 2),
      ].join('\n'),
    },
  ]
}

export function normalizeOpenAIResponseText(response: unknown) {
  if (isRecord(response) && typeof response.output_text === 'string') {
    return response.output_text.trim()
  }

  if (!isRecord(response) || !Array.isArray(response.output)) {
    return ''
  }

  return response.output
    .flatMap((item) => (isRecord(item) && Array.isArray(item.content) ? item.content : []))
    .map((content) => {
      if (!isRecord(content)) {
        return ''
      }

      if (typeof content.text === 'string') {
        return content.text
      }

      if (typeof content.output_text === 'string') {
        return content.output_text
      }

      return ''
    })
    .filter(Boolean)
    .join('\n')
    .trim()
}

async function generateWritingSuggestion(request: IncomingMessage, config: WritingProviderConfig) {
  if (!config.configured) {
    return createWritingProviderNotConfiguredResponse(config)
  }

  const payload = readGeneratePayload(await readBody(request))

  if (!payload) {
    return writingResponse({
      configured: true,
      data: null,
      error: {
        type: 'invalid-request',
        message: 'Writing generation requires a prompt packet payload.',
      },
    })
  }

  try {
    const client = new OpenAI({ apiKey: config.apiKey })
    const response = await client.responses.create({
      model: config.model,
      input: createWritingProviderInput(payload),
      max_output_tokens: 1400,
    })
    const generatedText = normalizeOpenAIResponseText(response)

    if (!generatedText) {
      return writingResponse({
        configured: true,
        data: null,
        error: {
          type: 'openai-error',
          message: 'OpenAI returned an empty draft suggestion.',
        },
      })
    }

    return writingResponse({
      configured: true,
      data: {
        provider: 'openai' as const,
        model: config.model,
        generatedText,
        generatedAt: new Date().toISOString(),
        message: 'OpenAI provider suggestion generated for human review. Draft text was not changed.',
      },
      error: null,
    })
  } catch (error) {
    return writingResponse({
      configured: true,
      data: null,
      error: {
        type: 'openai-error',
        message: error instanceof Error ? error.message : 'OpenAI provider request failed.',
      },
    })
  }
}

export async function writingApiMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next?: () => void,
) {
  if (!request.url?.startsWith('/api/writing')) {
    next?.()
    return
  }

  try {
    const url = new URL(request.url, 'http://localhost')
    const config = getWritingProviderConfig()

    if (url.pathname === '/api/writing/status') {
      json(response, 200, createWritingProviderStatus(config))
      return
    }

    if (url.pathname === '/api/writing/generate' && request.method === 'POST') {
      json(response, 200, await generateWritingSuggestion(request, config))
      return
    }

    json(
      response,
      404,
      writingResponse({
        configured: config.configured,
        data: null,
        error: {
          type: 'unknown',
          message: 'Unknown Atlas Writing API route.',
        },
      }),
    )
  } catch (error) {
    json(
      response,
      200,
      writingResponse({
        configured: false,
        data: null,
        error: {
          type: 'unknown',
          message: error instanceof Error ? error.message : 'Atlas Writing API failed.',
        },
      }),
    )
  }
}
