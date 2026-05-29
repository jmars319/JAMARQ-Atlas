import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { dispatchApiMiddleware } from './dispatchApi'
import { githubAuthApiMiddleware } from './githubAuth'
import { githubApiMiddleware } from './githubApi'
import { githubWriteApiMiddleware } from './githubWriteApi'
import { localGitApiMiddleware } from './localGitApi'
import { repoOperationsApiMiddleware } from './repoOperationsApi'
import { syncApiMiddleware } from './syncApi'
import { vercelApiMiddleware } from './vercelApi'
import { writingApiMiddleware } from './writingApi'

type ApiNext = () => void

export interface AtlasApiServer {
  server: http.Server
  host: string
  port: number
  url: string
  close: () => Promise<void>
}

export interface AtlasApiServerOptions {
  host?: string
  port?: number
  staticDir?: string
}

const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_PORT = 0

const STATIC_CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function isResponseFinished(response: ServerResponse) {
  return response.writableEnded || response.headersSent
}

export function atlasApiMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next?: ApiNext,
) {
  void dispatchApiMiddleware(request, response, () => {
    void vercelApiMiddleware(request, response, () => {
      void githubAuthApiMiddleware(request, response, () => {
        void githubWriteApiMiddleware(request, response, () => {
          void githubApiMiddleware(request, response, () => {
            void localGitApiMiddleware(request, response, () => {
              void repoOperationsApiMiddleware(request, response, () => {
                void syncApiMiddleware(request, response, () => {
                  void writingApiMiddleware(request, response, next)
                })
              })
            })
          })
        })
      })
    })
  })
}

function sendNotFound(response: ServerResponse) {
  if (isResponseFinished(response)) {
    return
  }

  response.statusCode = 404
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(
    JSON.stringify({
      ok: false,
      error: {
        type: 'not-found',
        message: 'Atlas route was not found.',
      },
    }),
  )
}

function safeStaticPath(staticDir: string, requestUrl: string) {
  const url = new URL(requestUrl, 'http://atlas.local')
  const pathname = decodeURIComponent(url.pathname)
  const normalized = pathname === '/' ? '/index.html' : pathname
  const candidate = path.resolve(staticDir, `.${normalized}`)
  const root = path.resolve(staticDir)

  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    return null
  }

  return candidate
}

async function serveStaticFile(
  request: IncomingMessage,
  response: ServerResponse,
  staticDir: string,
) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendNotFound(response)
    return
  }

  const candidate = safeStaticPath(staticDir, request.url ?? '/')
  const fallback = path.join(staticDir, 'index.html')
  const filePath = candidate ?? fallback
  let targetPath = filePath

  try {
    const fileStat = await stat(filePath)

    if (!fileStat.isFile()) {
      targetPath = fallback
    }
  } catch {
    targetPath = fallback
  }

  try {
    const fileStat = await stat(targetPath)

    response.statusCode = 200
    response.setHeader(
      'Content-Type',
      STATIC_CONTENT_TYPES[path.extname(targetPath)] ?? 'application/octet-stream',
    )
    response.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "connect-src 'self' https://api.github.com https://api.vercel.com https://*.supabase.co https://api.openai.com",
      ].join('; '),
    )
    response.setHeader('Content-Length', String(fileStat.size))

    if (request.method === 'HEAD') {
      response.end()
      return
    }

    createReadStream(targetPath)
      .on('error', () => sendNotFound(response))
      .pipe(response)
  } catch {
    sendNotFound(response)
  }
}

export async function startAtlasApiServer(
  options: AtlasApiServerOptions = {},
): Promise<AtlasApiServer> {
  const host = options.host ?? DEFAULT_HOST
  const requestedPort = options.port ?? DEFAULT_PORT
  const server = http.createServer((request, response) => {
    atlasApiMiddleware(request, response, () => {
      if (isResponseFinished(response)) {
        return
      }

      if (options.staticDir) {
        void serveStaticFile(request, response, options.staticDir)
        return
      }

      sendNotFound(response)
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(requestedPort, host, () => {
      server.off('error', reject)
      resolve()
    })
  })

  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : requestedPort
  const url = `http://${host}:${port}`

  return {
    server,
    host,
    port,
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}
