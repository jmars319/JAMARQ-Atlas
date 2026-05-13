export interface RequestClientOptions {
  signal?: AbortSignal
  timeoutMs?: number
  retries?: number
  retrySafe?: boolean
}

export interface JsonResponseResult<T> {
  response: Response
  body: T | null
}

export class AtlasRequestError extends Error {
  status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'AtlasRequestError'
    this.status = status
  }
}

const DEFAULT_TIMEOUT_MS = 15_000

export function redactRequestMessage(value: string) {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted-key]')
    .replace(/(api[_-]?key|token|password|secret)=([^&\s]+)/gi, '$1=[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[redacted]')
}

function mergeSignals(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs)

  function abort() {
    controller.abort()
  }

  if (signal) {
    if (signal.aborted) {
      controller.abort()
    } else {
      signal.addEventListener('abort', abort, { once: true })
    }
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      globalThis.clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    },
  }
}

async function parseJsonBody<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}

function responseErrorMessage(
  response: Response,
  body: { error?: { message?: string }; message?: string } | null,
) {
  return redactRequestMessage(
    body?.error?.message || body?.message || `Atlas request returned ${response.status}.`,
  )
}

function canRetry(error: unknown, attempt: number, retries: number, retrySafe: boolean) {
  const aborted =
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    error.name === 'AbortError'

  return retrySafe && attempt < retries && !aborted
}

export async function requestJsonResponse<T>(
  path: string,
  init: RequestInit = {},
  options: RequestClientOptions = {},
): Promise<JsonResponseResult<T>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const retries = options.retries ?? 0
  const retrySafe = options.retrySafe ?? (init.method === undefined || init.method === 'GET')
  let attempt = 0

  while (true) {
    const request = mergeSignals(options.signal ?? init.signal ?? undefined, timeoutMs)

    try {
      const response = await fetch(path, {
        ...init,
        signal: request.signal,
      })
      const body = await parseJsonBody<T>(response)

      return { response, body }
    } catch (error) {
      if (!canRetry(error, attempt, retries, retrySafe)) {
        throw new AtlasRequestError(
          redactRequestMessage(
            error instanceof Error ? error.message : 'Atlas request failed.',
          ),
          null,
        )
      }
    } finally {
      request.cleanup()
    }

    attempt += 1
  }
}

export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  options: RequestClientOptions = {},
): Promise<T> {
  const { response, body } = await requestJsonResponse<T>(path, init, options)

  if (!response.ok) {
    throw new AtlasRequestError(
      responseErrorMessage(response, body as { error?: { message?: string }; message?: string } | null),
      response.status,
    )
  }

  if (!body) {
    throw new AtlasRequestError('Atlas request returned an unreadable response.', response.status)
  }

  return body
}
