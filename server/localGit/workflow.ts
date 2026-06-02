import { execFile } from 'node:child_process'
import type { IncomingMessage } from 'node:http'
import { promisify } from 'node:util'
import type {
  EnvRecord,
  LocalGitWorkflowCommand,
  LocalGitWorkflowRun,
  LocalGitWorkflowRunResponse,
  LocalGitWorkflowRunsResponse,
  LocalGitWorkflowRunStatus,
} from './types'
import { getLocalGitRepositoryStatus } from './repository'

const execFileAsync = promisify(execFile)

const GIT_WORKFLOW_TIMEOUT_MS = 60_000

const VERIFY_WORKFLOW_TIMEOUT_MS = 180_000

const MAX_WORKFLOW_OUTPUT_LENGTH = 5000

const MAX_REQUEST_BODY_LENGTH = 64 * 1024

const workflowRunHistory: LocalGitWorkflowRun[] = []

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function redactWorkflowOutput(value: string) {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, '[redacted-key]')
    .replace(/(api[_-]?key|token|password|secret)=([^&\s]+)/gi, '$1=[redacted]')
    .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, '$1[redacted]')
}

function clipWorkflowOutput(value: string) {
  const redacted = redactWorkflowOutput(value.trim())

  if (redacted.length <= MAX_WORKFLOW_OUTPUT_LENGTH) {
    return redacted
  }

  return `${redacted.slice(0, MAX_WORKFLOW_OUTPUT_LENGTH)}\n...workflow output truncated by Atlas...`
}

function safeScriptName(value: string) {
  return /^[A-Za-z0-9:_-]+$/.test(value)
}

function tokenizeWorkflowCommand(command: string) {
  const trimmed = command.trim()

  if (!trimmed || /[;&|`$<>\\\r\n]/.test(trimmed)) {
    return null
  }

  return trimmed.split(/\s+/)
}

export function parseAllowedWorkflowCommand(command: string):
  | {
      executable: string
      args: string[]
    }
  | null {
  const tokens = tokenizeWorkflowCommand(command)

  if (!tokens) {
    return null
  }

  const [executable, ...args] = tokens

  if (executable === 'git' && args.length === 2 && args[0] === 'diff' && args[1] === '--check') {
    return { executable, args }
  }

  if (executable === 'npm') {
    if (args.length === 1 && args[0] === 'test') {
      return { executable, args }
    }

    if (args.length === 2 && args[0] === 'run' && safeScriptName(args[1])) {
      return { executable, args }
    }
  }

  if (executable === 'pnpm') {
    if (args.length === 1 && args[0] === 'test') {
      return { executable, args }
    }

    if (args.length === 2 && args[0] === 'run' && safeScriptName(args[1])) {
      return { executable, args }
    }
  }

  if (executable === 'cargo') {
    if (args.length === 1 && ['audit', 'build', 'check', 'test'].includes(args[0])) {
      return { executable, args }
    }

    if (args.length === 2 && args[0] === 'deny' && args[1] === 'check') {
      return { executable, args }
    }
  }

  if (executable === 'composer') {
    if (args.length === 1 && ['test', 'validate'].includes(args[0])) {
      return { executable, args }
    }
  }

  if (executable === 'mise' && args[0] === 'exec' && args[1] === '--') {
    const nested = parseAllowedWorkflowCommand(args.slice(2).join(' '))

    if (nested) {
      return {
        executable,
        args,
      }
    }
  }

  return null
}

export async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let length = 0

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
    length += buffer.length

    if (length > MAX_REQUEST_BODY_LENGTH) {
      throw new Error('Request body is too large.')
    }

    chunks.push(buffer)
  }

  if (chunks.length === 0) {
    return {}
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

function workflowRunId() {
  return `repo-workflow-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

function commandLabel(command: LocalGitWorkflowCommand) {
  if (command.kind === 'git-fetch-prune') {
    return 'git fetch --prune'
  }

  if (command.kind === 'git-pull-ff-only') {
    return 'git pull --ff-only'
  }

  return command.command?.trim() || 'verification command'
}

function createWorkflowRun(input: {
  repositoryId: string
  owner: string
  repo: string
  command: LocalGitWorkflowCommand
  status: LocalGitWorkflowRunStatus
  startedAt: string
  endedAt?: string
  exitCode: number | null
  outputExcerpt: string
  planningItemId: string
  diagnostic: string
}): LocalGitWorkflowRun {
  return {
    id: workflowRunId(),
    repositoryId: input.repositoryId,
    owner: input.owner,
    repo: input.repo,
    command: input.command,
    commandLabel: commandLabel(input.command),
    status: input.status,
    startedAt: input.startedAt,
    endedAt: input.endedAt ?? new Date().toISOString(),
    exitCode: input.exitCode,
    outputExcerpt: clipWorkflowOutput(input.outputExcerpt),
    planningItemId: input.planningItemId,
    diagnostic: input.diagnostic,
  }
}

function rememberWorkflowRun(run: LocalGitWorkflowRun) {
  workflowRunHistory.unshift(run)

  if (workflowRunHistory.length > 200) {
    workflowRunHistory.length = 200
  }
}

export function workflowCommandFromBody(body: Record<string, unknown>): LocalGitWorkflowCommand {
  const command = body.command

  if (typeof command === 'string') {
    return {
      kind: 'verify-command',
      command,
    }
  }

  if (command && typeof command === 'object') {
    const record = command as Record<string, unknown>
    const kind = readString(record.kind)

    if (
      kind === 'git-fetch-prune' ||
      kind === 'git-pull-ff-only' ||
      kind === 'verify-command'
    ) {
      return {
        kind,
        command: readString(record.command),
      }
    }
  }

  return {
    kind: 'verify-command',
    command: readString(body.verificationCommand),
  }
}

async function executeWorkflowCommand(
  repoPath: string,
  command: LocalGitWorkflowCommand,
): Promise<{
  status: LocalGitWorkflowRunStatus
  exitCode: number | null
  output: string
  diagnostic: string
}> {
  if (command.kind === 'git-fetch-prune') {
    try {
      const { stdout, stderr } = await execFileAsync('git', ['fetch', '--prune'], {
        cwd: repoPath,
        timeout: GIT_WORKFLOW_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      })

      return {
        status: 'completed',
        exitCode: 0,
        output: [stdout, stderr].filter(Boolean).join('\n'),
        diagnostic: 'Fetch completed.',
      }
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string; code?: number }

      return {
        status: 'failed',
        exitCode: typeof failure.code === 'number' ? failure.code : null,
        output: [failure.stdout, failure.stderr, error instanceof Error ? error.message : 'Fetch failed.']
          .filter(Boolean)
          .join('\n'),
        diagnostic: 'Fetch failed.',
      }
    }
  }

  if (command.kind === 'git-pull-ff-only') {
    try {
      const { stdout, stderr } = await execFileAsync('git', ['pull', '--ff-only'], {
        cwd: repoPath,
        timeout: GIT_WORKFLOW_TIMEOUT_MS,
        maxBuffer: 1024 * 1024,
      })

      return {
        status: 'completed',
        exitCode: 0,
        output: [stdout, stderr].filter(Boolean).join('\n'),
        diagnostic: 'Fast-forward pull completed.',
      }
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string; code?: number }

      return {
        status: 'failed',
        exitCode: typeof failure.code === 'number' ? failure.code : null,
        output: [
          failure.stdout,
          failure.stderr,
          error instanceof Error ? error.message : 'Fast-forward pull failed.',
        ]
          .filter(Boolean)
          .join('\n'),
        diagnostic: 'Fast-forward pull failed.',
      }
    }
  }

  const commandText = command.command?.trim() ?? ''
  const parsed = parseAllowedWorkflowCommand(commandText)

  if (!parsed) {
    return {
      status: 'blocked',
      exitCode: null,
      output: '',
      diagnostic:
        'Command is not allowlisted. Atlas runs only repo-owned npm, pnpm, cargo, composer, mise exec verification commands, or git diff --check.',
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync(parsed.executable, parsed.args, {
      cwd: repoPath,
      timeout: VERIFY_WORKFLOW_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
    })

    return {
      status: 'completed',
      exitCode: 0,
      output: [stdout, stderr].filter(Boolean).join('\n'),
      diagnostic: 'Verification completed.',
    }
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string; code?: number }

    return {
      status: 'failed',
      exitCode: typeof failure.code === 'number' ? failure.code : null,
      output: [
        failure.stdout,
        failure.stderr,
        error instanceof Error ? error.message : 'Verification failed.',
      ]
        .filter(Boolean)
        .join('\n'),
      diagnostic: 'Verification failed.',
    }
  }
}

export async function runLocalGitWorkflow(
  input: {
    repositoryId?: string
    owner: string
    repo: string
    command: LocalGitWorkflowCommand
    confirmation?: string
    planningItemId?: string
  },
  env: EnvRecord = process.env,
): Promise<LocalGitWorkflowRunResponse> {
  const statusResponse = await getLocalGitRepositoryStatus(input.owner, input.repo, env)
  const repositoryId = input.repositoryId || `${input.owner}/${input.repo}`
  const startedAt = new Date().toISOString()

  if (!statusResponse.ok || statusResponse.status !== 'available' || !statusResponse.data) {
    const run = createWorkflowRun({
      repositoryId,
      owner: input.owner,
      repo: input.repo,
      command: input.command,
      status: 'blocked',
      startedAt,
      exitCode: null,
      outputExcerpt: statusResponse.error?.message ?? 'Repository is not runnable.',
      planningItemId: input.planningItemId ?? '',
      diagnostic: statusResponse.error?.message ?? 'Repository is not runnable.',
    })

    rememberWorkflowRun(run)
    return {
      ok: false,
      configured: statusResponse.configured,
      status: statusResponse.status,
      roots: statusResponse.roots,
      run,
      error: {
        type: statusResponse.status,
        message: run.diagnostic,
      },
    }
  }

  const repositoryStatus = statusResponse.data

  if (input.command.kind === 'git-pull-ff-only') {
    const expectedConfirmation = `PULL ${input.owner}/${input.repo}`

    if (input.confirmation !== expectedConfirmation) {
      const run = createWorkflowRun({
        repositoryId,
        owner: input.owner,
        repo: input.repo,
        command: input.command,
        status: 'blocked',
        startedAt,
        exitCode: null,
        outputExcerpt: `Typed confirmation must be exactly: ${expectedConfirmation}`,
        planningItemId: input.planningItemId ?? '',
        diagnostic: 'Fast-forward pull requires typed confirmation.',
      })

      rememberWorkflowRun(run)
      return {
        ok: false,
        configured: true,
        status: 'blocked',
        roots: statusResponse.roots,
        run,
        error: {
          type: 'blocked',
          message: run.diagnostic,
        },
      }
    }

    if (repositoryStatus.dirty || !repositoryStatus.upstream) {
      const diagnostic = repositoryStatus.dirty
        ? 'Fast-forward pull is blocked until the working tree is clean.'
        : 'Fast-forward pull is blocked because this branch has no upstream.'
      const run = createWorkflowRun({
        repositoryId,
        owner: input.owner,
        repo: input.repo,
        command: input.command,
        status: 'blocked',
        startedAt,
        exitCode: null,
        outputExcerpt: diagnostic,
        planningItemId: input.planningItemId ?? '',
        diagnostic,
      })

      rememberWorkflowRun(run)
      return {
        ok: false,
        configured: true,
        status: 'blocked',
        roots: statusResponse.roots,
        run,
        error: {
          type: 'blocked',
          message: diagnostic,
        },
      }
    }
  }

  const result = await executeWorkflowCommand(repositoryStatus.path, input.command)
  const run = createWorkflowRun({
    repositoryId,
    owner: input.owner,
    repo: input.repo,
    command: input.command,
    status: result.status,
    startedAt,
    exitCode: result.exitCode,
    outputExcerpt: result.output,
    planningItemId: input.planningItemId ?? '',
    diagnostic: result.diagnostic,
  })

  rememberWorkflowRun(run)
  return {
    ok: result.status === 'completed',
    configured: true,
    status: result.status,
    roots: statusResponse.roots,
    run,
    error:
      result.status === 'completed'
        ? null
        : {
            type: result.status,
            message: result.diagnostic,
          },
  }
}

export function listLocalGitWorkflowRuns(owner: string, repo: string): LocalGitWorkflowRunsResponse {
  const runs = workflowRunHistory.filter(
    (run) =>
      (!owner || run.owner.toLowerCase() === owner) &&
      (!repo || run.repo.toLowerCase() === repo),
  )

  return {
    ok: true,
    runs,
  }
}
