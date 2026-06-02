import type { IncomingMessage, ServerResponse } from 'node:http'
import { getLocalGitRepositoryPreview, getLocalGitRepositoryStatus, getLocalGitRoots } from './localGit/repository'
import { listLocalGitWorkflowRuns, readJsonBody, runLocalGitWorkflow, workflowCommandFromBody } from './localGit/workflow'
import type { LocalGitWorkflowRunResponse } from './localGit/types'

export type {
  EnvRecord,
  LocalGitChangeGroup,
  LocalGitChangeKind,
  LocalGitDryRunCommitPreview,
  LocalGitFileChange,
  LocalGitLatestCommit,
  LocalGitRepositoryPreview,
  LocalGitRepositoryPreviewResponse,
  LocalGitRepositoryStatus,
  LocalGitRepositoryStatusKind,
  LocalGitRepositoryStatusResponse,
  LocalGitWorkflowCommand,
  LocalGitWorkflowCommandKind,
  LocalGitWorkflowRun,
  LocalGitWorkflowRunResponse,
  LocalGitWorkflowRunsResponse,
  LocalGitWorkflowRunStatus,
} from './localGit/types'
export { parseAllowedWorkflowCommand, runLocalGitWorkflow } from './localGit/workflow'
export {
  getLocalGitRepositoryPreview,
  getLocalGitRepositoryStatus,
  getLocalGitRoots,
  normalizeGithubRemoteUrl,
  parseLatestCommit,
} from './localGit/repository'
export {
  parseGitNumstat,
  parseGitStatusFileChanges,
  parseGitStatusPorcelain,
} from './localGit/parsing'

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body, null, 2))
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export async function localGitApiMiddleware(
  request: IncomingMessage,
  response: ServerResponse,
  next?: () => void,
) {
  if (!request.url?.startsWith('/api/git')) {
    next?.()
    return
  }

  const url = new URL(request.url, 'http://localhost')
  const route = url.pathname

  if (route === '/api/git/workflows/runs') {
    if (request.method !== 'GET') {
      json(response, 405, {
        ok: false,
        error: {
          type: 'method-not-allowed',
          message: 'Workflow history is a GET route.',
        },
      })
      return
    }

    const owner = readString(url.searchParams.get('owner')).toLowerCase()
    const repo = readString(url.searchParams.get('repo')).toLowerCase()

    json(response, 200, listLocalGitWorkflowRuns(owner, repo))
    return
  }

  if (route === '/api/git/workflows/run') {
    if (request.method !== 'POST') {
      json(response, 405, {
        ok: false,
        error: {
          type: 'method-not-allowed',
          message: 'Workflow execution is a POST route.',
        },
      })
      return
    }

    try {
      const body = await readJsonBody(request)
      const workflowResponse = await runLocalGitWorkflow({
        repositoryId: readString(body.repositoryId),
        owner: readString(body.owner),
        repo: readString(body.repo),
        command: workflowCommandFromBody(body),
        confirmation: readString(body.confirmation),
        planningItemId: readString(body.planningItemId),
      })

      json(response, workflowResponse.status === 'invalid-request' ? 400 : 200, workflowResponse)
    } catch (error) {
      json(response, 400, {
        ok: false,
        configured: getLocalGitRoots().length > 0,
        status: 'invalid-request',
        roots: getLocalGitRoots(),
        run: null,
        error: {
          type: 'invalid-request',
          message: error instanceof Error ? error.message : 'Workflow request could not be parsed.',
        },
      } satisfies LocalGitWorkflowRunResponse)
    }
    return
  }

  if (request.method !== 'GET') {
    json(response, 405, {
      ok: false,
      configured: getLocalGitRoots().length > 0,
      status: 'error',
      roots: getLocalGitRoots(),
      data: null,
      error: {
        type: 'error',
        message: 'Atlas local Git status and preview routes expose GET only.',
      },
    })
    return
  }

  if (route !== '/api/git/repositories/status' && route !== '/api/git/repositories/preview') {
    json(response, 404, {
      ok: false,
      configured: getLocalGitRoots().length > 0,
      status: 'error',
      roots: getLocalGitRoots(),
      data: null,
      error: {
        type: 'error',
        message: 'Unknown local Git API route.',
      },
    })
    return
  }

  const owner = readString(url.searchParams.get('owner'))
  const repo = readString(url.searchParams.get('repo'))
  const body =
    route === '/api/git/repositories/preview'
      ? await getLocalGitRepositoryPreview(owner, repo)
      : await getLocalGitRepositoryStatus(owner, repo)

  json(response, body.status === 'invalid-request' ? 400 : 200, body)
}
