import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body, null, 2))
}

function defaultSnapshotCandidates(env: NodeJS.ProcessEnv = process.env) {
  const configured = env.ATLAS_REPO_OPERATIONS_SNAPSHOT_PATH?.trim()
  const candidates = configured ? [configured] : []

  candidates.push(
    path.resolve(process.cwd(), '../../Agents/agentic-instructions/docs/repo-operations-atlas.json'),
  )

  return candidates.map((candidate) => path.resolve(candidate))
}

export async function repoOperationsApiMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next?: () => void,
) {
  if (!request.url?.startsWith('/api/repo-operations')) {
    next?.()
    return
  }

  const url = new URL(request.url, 'http://localhost')

  if (url.pathname !== '/api/repo-operations/default-snapshot') {
    json(response, 404, {
      ok: false,
      error: {
        type: 'not-found',
        message: 'Unknown repo operations API route.',
      },
    })
    return
  }

  if (request.method !== 'GET') {
    json(response, 405, {
      ok: false,
      error: {
        type: 'method-not-allowed',
        message: 'Default repo operations snapshot is a GET route.',
      },
    })
    return
  }

  const candidates = defaultSnapshotCandidates()

  for (const candidate of candidates) {
    try {
      const text = await readFile(candidate, 'utf8')

      json(response, 200, {
        ok: true,
        path: candidate,
        snapshot: JSON.parse(text),
      })
      return
    } catch {
      // Try the next configured candidate without exposing local filesystem details as an error.
    }
  }

  json(response, 404, {
    ok: false,
    path: null,
    snapshot: null,
    error: {
      type: 'not-found',
      message:
        'No default repo operations snapshot was found. Set ATLAS_REPO_OPERATIONS_SNAPSHOT_PATH or import a snapshot manually.',
    },
  })
}
