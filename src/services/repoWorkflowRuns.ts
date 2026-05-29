import {
  ATLAS_REPO_WORKFLOW_RUNS_SCHEMA_VERSION,
  emptyRepoWorkflowRunsState,
  type RepoWorkflowCommand,
  type RepoWorkflowRun,
  type RepoWorkflowRunStatus,
  type RepoWorkflowRunsState,
} from '../domain/repoWorkflowRuns'

const DEFAULT_GENERATED_AT = new Date('1970-01-01T00:00:00.000Z')
export const STALE_VERIFICATION_MS = 7 * 24 * 60 * 60 * 1000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStatus(value: unknown): RepoWorkflowRunStatus {
  return value === 'completed' || value === 'failed' || value === 'blocked' ? value : 'blocked'
}

function safeDate(value: unknown, fallback = DEFAULT_GENERATED_AT) {
  const candidate = readString(value)

  return candidate && !Number.isNaN(Date.parse(candidate)) ? candidate : fallback.toISOString()
}

function normalizeCommand(value: unknown): RepoWorkflowCommand {
  const command = isRecord(value) ? value : {}
  const kind = readString(command.kind)

  return {
    kind:
      kind === 'git-fetch-prune' || kind === 'git-pull-ff-only' || kind === 'verify-command'
        ? kind
        : 'verify-command',
    command: readString(command.command),
  }
}

export function normalizeRepoWorkflowRun(value: unknown): RepoWorkflowRun | null {
  if (!isRecord(value)) {
    return null
  }

  const id = readString(value.id)
  const repositoryId = readString(value.repositoryId)
  const owner = readString(value.owner)
  const repo = readString(value.repo)
  const command = normalizeCommand(value.command)

  if (!id || !repositoryId || !owner || !repo) {
    return null
  }

  return {
    id,
    repositoryId,
    owner,
    repo,
    command,
    commandLabel:
      readString(value.commandLabel) ||
      command.command ||
      (command.kind === 'git-fetch-prune' ? 'git fetch --prune' : 'git pull --ff-only'),
    status: readStatus(value.status),
    startedAt: safeDate(value.startedAt),
    endedAt: safeDate(value.endedAt),
    exitCode: typeof value.exitCode === 'number' ? value.exitCode : null,
    outputExcerpt: readString(value.outputExcerpt),
    planningItemId: readString(value.planningItemId),
    diagnostic: readString(value.diagnostic),
  }
}

export function emptyRepoWorkflowRunsStore(now = new Date()): RepoWorkflowRunsState {
  return {
    ...emptyRepoWorkflowRunsState,
    updatedAt: now.toISOString(),
  }
}

export function normalizeRepoWorkflowRunsState(
  value: unknown,
  now = new Date(),
): RepoWorkflowRunsState {
  const defaults = emptyRepoWorkflowRunsStore(now)

  if (!isRecord(value)) {
    return defaults
  }

  const runs = Array.isArray(value.runs)
    ? value.runs
        .map((run) => normalizeRepoWorkflowRun(run))
        .filter((run): run is RepoWorkflowRun => run !== null)
        .sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))
    : []

  return {
    schemaVersion: ATLAS_REPO_WORKFLOW_RUNS_SCHEMA_VERSION,
    runs,
    updatedAt: safeDate(value.updatedAt, now),
  }
}

export function addRepoWorkflowRun(
  state: RepoWorkflowRunsState,
  run: RepoWorkflowRun,
  now = new Date(),
): RepoWorkflowRunsState {
  return {
    ...state,
    runs: [run, ...state.runs.filter((candidate) => candidate.id !== run.id)].slice(0, 500),
    updatedAt: now.toISOString(),
  }
}

export function workflowRunsForRepository(
  runs: RepoWorkflowRun[],
  repository: { id: string; githubOwner: string; githubRepo: string },
) {
  return runs.filter(
    (run) =>
      run.repositoryId === repository.id ||
      (run.owner.toLowerCase() === repository.githubOwner.toLowerCase() &&
        run.repo.toLowerCase() === repository.githubRepo.toLowerCase()),
  )
}

export function latestWorkflowRun(runs: RepoWorkflowRun[]) {
  return [...runs].sort((left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt))[0] ?? null
}

export function latestVerificationSuccess(runs: RepoWorkflowRun[]) {
  return (
    [...runs]
      .filter((run) => run.command.kind === 'verify-command' && run.status === 'completed')
      .sort((left, right) => Date.parse(right.endedAt) - Date.parse(left.endedAt))[0] ?? null
  )
}

export function latestVerificationRun(runs: RepoWorkflowRun[]) {
  return (
    [...runs]
      .filter((run) => run.command.kind === 'verify-command')
      .sort((left, right) => Date.parse(right.endedAt) - Date.parse(left.endedAt))[0] ?? null
  )
}

export function isVerificationStale(run: RepoWorkflowRun | null, now = new Date()) {
  if (!run) {
    return false
  }

  return now.getTime() - Date.parse(run.endedAt) > STALE_VERIFICATION_MS
}
