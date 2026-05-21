import type { IncomingMessage, ServerResponse } from 'node:http'
import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

type EnvRecord = Record<string, string | undefined>

export type LocalGitRepositoryStatusKind =
  | 'available'
  | 'not-configured'
  | 'not-found'
  | 'invalid-request'
  | 'error'

export type LocalGitChangeKind =
  | 'added'
  | 'copied'
  | 'deleted'
  | 'modified'
  | 'renamed'
  | 'type-change'
  | 'unmerged'
  | 'unknown'
  | 'untracked'

export interface LocalGitLatestCommit {
  sha: string
  shortSha: string
  subject: string
  author: string
  date: string
}

export interface LocalGitRepositoryStatus {
  owner: string
  repo: string
  path: string
  remoteUrl: string
  branch: string
  upstream: string | null
  dirty: boolean
  changedFiles: number
  ahead: number | null
  behind: number | null
  latestCommit: LocalGitLatestCommit | null
  checkedAt: string
  diagnostic: string
}

export interface LocalGitRepositoryStatusResponse {
  ok: boolean
  configured: boolean
  status: LocalGitRepositoryStatusKind
  roots: string[]
  data: LocalGitRepositoryStatus | null
  error: {
    type: LocalGitRepositoryStatusKind
    message: string
  } | null
}

export interface LocalGitFileChange {
  path: string
  previousPath: string | null
  indexStatus: string
  worktreeStatus: string
  change: LocalGitChangeKind
  staged: boolean
  unstaged: boolean
  untracked: boolean
  additions: number | null
  deletions: number | null
}

export interface LocalGitChangeGroup {
  change: LocalGitChangeKind
  label: string
  count: number
  paths: string[]
}

export interface LocalGitDryRunCommitPreview {
  available: boolean
  blocked: boolean
  subjectSuggestion: string
  bodyLines: string[]
  commandPreview: string[]
  blockers: string[]
}

export interface LocalGitRepositoryPreview {
  status: LocalGitRepositoryStatus
  stagedCount: number
  unstagedCount: number
  untrackedCount: number
  additions: number | null
  deletions: number | null
  changedFiles: LocalGitFileChange[]
  changeGroups: LocalGitChangeGroup[]
  diffStat: {
    unstaged: string
    staged: string
  }
  dryRunCommit: LocalGitDryRunCommitPreview
}

export interface LocalGitRepositoryPreviewResponse {
  ok: boolean
  configured: boolean
  status: LocalGitRepositoryStatusKind
  roots: string[]
  data: LocalGitRepositoryPreview | null
  error: {
    type: LocalGitRepositoryStatusKind
    message: string
  } | null
}

interface GitBranchStatus {
  branch: string
  upstream: string | null
  ahead: number | null
  behind: number | null
}

const execFileAsync = promisify(execFile)
const GIT_TIMEOUT_MS = 5000
const MAX_SCAN_DEPTH = 5
const MAX_PREVIEW_FILES = 80
const MAX_DIFF_STAT_LENGTH = 6000
const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.next',
  '.turbo',
  '.vite',
  'build',
  'coverage',
  'dist',
  'Library',
  'node_modules',
  'out',
  'vendor',
])

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body, null, 2))
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function safeRepoPart(value: string) {
  return /^[A-Za-z0-9_.-]+$/.test(value)
}

export function getLocalGitRoots(env: EnvRecord = process.env) {
  return (env.ATLAS_LOCAL_REPO_ROOTS || '')
    .split(',')
    .map((root) => root.trim())
    .filter(Boolean)
    .map((root) => path.resolve(root))
}

export function normalizeGithubRemoteUrl(remoteUrl: string) {
  const trimmed = remoteUrl.trim()
  const withoutGit = trimmed.endsWith('.git') ? trimmed.slice(0, -4) : trimmed
  const sshMatch = withoutGit.match(/^git@github\.com:([^/]+)\/(.+)$/i)
  const httpsMatch = withoutGit.match(/^https:\/\/github\.com\/([^/]+)\/(.+)$/i)
  const gitMatch = withoutGit.match(/^git:\/\/github\.com\/([^/]+)\/(.+)$/i)
  const match = sshMatch ?? httpsMatch ?? gitMatch

  if (!match) {
    return null
  }

  return {
    owner: match[1].toLowerCase(),
    repo: match[2].toLowerCase(),
  }
}

function parseAheadBehind(label: string) {
  const aheadMatch = label.match(/ahead (\d+)/)
  const behindMatch = label.match(/behind (\d+)/)

  return {
    ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
    behind: behindMatch ? Number(behindMatch[1]) : 0,
  }
}

export function parseGitStatusPorcelain(output: string): GitBranchStatus & {
  dirty: boolean
  changedFiles: number
} {
  const lines = output.split(/\r?\n/).filter(Boolean)
  const branchLine = lines[0]?.startsWith('## ') ? lines[0].slice(3) : ''
  const changedFiles = lines.filter((line) => !line.startsWith('## ')).length
  let branch = 'HEAD'
  let upstream: string | null = null
  let ahead: number | null = null
  let behind: number | null = null

  if (branchLine) {
    const statusMatch = branchLine.match(/^(.+?)(?:\.\.\.([^\s]+))?(?: \[(.+)\])?$/)

    if (statusMatch) {
      branch = statusMatch[1] || branch
      upstream = statusMatch[2] || null

      if (statusMatch[3]) {
        const parsed = parseAheadBehind(statusMatch[3])
        ahead = parsed.ahead
        behind = parsed.behind
      } else if (upstream) {
        ahead = 0
        behind = 0
      }
    }
  }

  return {
    branch,
    upstream,
    dirty: changedFiles > 0,
    changedFiles,
    ahead,
    behind,
  }
}

function changeKind(indexStatus: string, worktreeStatus: string): LocalGitChangeKind {
  if (indexStatus === '?' && worktreeStatus === '?') {
    return 'untracked'
  }

  const status = indexStatus !== ' ' ? indexStatus : worktreeStatus

  if (status === 'A') {
    return 'added'
  }

  if (status === 'C') {
    return 'copied'
  }

  if (status === 'D') {
    return 'deleted'
  }

  if (status === 'M') {
    return 'modified'
  }

  if (status === 'R') {
    return 'renamed'
  }

  if (status === 'T') {
    return 'type-change'
  }

  if (status === 'U') {
    return 'unmerged'
  }

  return 'unknown'
}

function normalizeStatusPath(rawPath: string) {
  const renameParts = rawPath.split(' -> ')

  if (renameParts.length >= 2) {
    return {
      path: renameParts[renameParts.length - 1],
      previousPath: renameParts.slice(0, -1).join(' -> '),
    }
  }

  return {
    path: rawPath,
    previousPath: null,
  }
}

export function parseGitStatusFileChanges(output: string): LocalGitFileChange[] {
  return output
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('## '))
    .map((line) => {
      const indexStatus = line[0] ?? ' '
      const worktreeStatus = line[1] ?? ' '
      const { path: filePath, previousPath } = normalizeStatusPath(line.slice(3))
      const untracked = indexStatus === '?' && worktreeStatus === '?'

      return {
        path: filePath,
        previousPath,
        indexStatus,
        worktreeStatus,
        change: changeKind(indexStatus, worktreeStatus),
        staged: indexStatus !== ' ' && indexStatus !== '?',
        unstaged: worktreeStatus !== ' ' && worktreeStatus !== '?',
        untracked,
        additions: null,
        deletions: null,
      }
    })
}

function normalizeNumstatPath(rawPath: string) {
  if (rawPath.includes(' => ')) {
    return rawPath.split(' => ').pop() ?? rawPath
  }

  return rawPath
}

export function parseGitNumstat(output: string) {
  const stats = new Map<string, { additions: number | null; deletions: number | null }>()

  output
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((line) => {
      const [additionsRaw, deletionsRaw, ...pathParts] = line.split('\t')
      const filePath = normalizeNumstatPath(pathParts.join('\t'))

      if (!filePath) {
        return
      }

      stats.set(filePath, {
        additions: additionsRaw === '-' ? null : Number(additionsRaw),
        deletions: deletionsRaw === '-' ? null : Number(deletionsRaw),
      })
    })

  return stats
}

function attachNumstat(
  changes: LocalGitFileChange[],
  stats: Map<string, { additions: number | null; deletions: number | null }>,
) {
  return changes.map((change) => {
    const fileStats = stats.get(change.path)

    if (!fileStats) {
      return change
    }

    return {
      ...change,
      additions: fileStats.additions,
      deletions: fileStats.deletions,
    }
  })
}

function totalNullable(values: Array<number | null>) {
  if (values.some((value) => value === null)) {
    return null
  }

  return values.reduce<number>((total, value) => total + (value ?? 0), 0)
}

function clipDiffStat(value: string) {
  return value.length > MAX_DIFF_STAT_LENGTH
    ? `${value.slice(0, MAX_DIFF_STAT_LENGTH)}\n...diff stat truncated by Atlas preview boundary...`
    : value
}

function createDryRunCommitPreview(
  status: LocalGitRepositoryStatus,
  changes: LocalGitFileChange[],
): LocalGitDryRunCommitPreview {
  const hasChanges = changes.length > 0
  const groups = groupLocalGitChanges(changes)
  const subjectSuggestion = hasChanges
    ? `Review ${changes.length} local change${changes.length === 1 ? '' : 's'} on ${status.branch}`
    : `No local changes on ${status.branch}`

  return {
    available: hasChanges,
    blocked: true,
    subjectSuggestion,
    bodyLines: hasChanges
      ? [
          `${status.owner}/${status.repo}`,
          `${changes.filter((change) => change.staged).length} staged file(s).`,
          `${changes.filter((change) => change.unstaged).length} unstaged file(s).`,
          `${changes.filter((change) => change.untracked).length} untracked file(s).`,
          ...groups.map((group) => `${group.label}: ${group.count} file(s).`),
        ]
      : ['Working tree is clean.'],
    commandPreview: [
      'git status --short --branch',
      'git diff --stat',
      'git diff --cached --stat',
      'future locked: git add <reviewed-files>',
      `future locked: git commit -m "${subjectSuggestion.replace(/"/g, "'")}"`,
    ],
    blockers: [
      'Local Git write execution is locked in this Atlas cycle.',
      'Atlas did not stage, commit, branch, pull, push, reset, stash, or checkout anything.',
    ],
  }
}

function groupLabel(change: LocalGitChangeKind) {
  return change
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

function groupLocalGitChanges(changes: LocalGitFileChange[]): LocalGitChangeGroup[] {
  const groups = new Map<LocalGitChangeKind, LocalGitFileChange[]>()

  changes.forEach((change) => {
    const current = groups.get(change.change) ?? []

    current.push(change)
    groups.set(change.change, current)
  })

  return [...groups.entries()].map(([change, groupChanges]) => ({
    change,
    label: groupLabel(change),
    count: groupChanges.length,
    paths: groupChanges.slice(0, 8).map((item) => item.path),
  }))
}

async function git(repoPath: string, args: string[]) {
  const { stdout } = await execFileAsync('git', ['-C', repoPath, ...args], {
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 1024 * 1024,
  })

  return stdout.trim()
}

async function tryGit(repoPath: string, args: string[]) {
  try {
    return await git(repoPath, args)
  } catch {
    return ''
  }
}

async function hasGitDirectory(directory: string) {
  try {
    const gitPath = path.join(directory, '.git')
    const stats = await stat(gitPath)

    return stats.isDirectory() || stats.isFile()
  } catch {
    return false
  }
}

async function repositoryMatches(directory: string, owner: string, repo: string) {
  if (!(await hasGitDirectory(directory))) {
    return null
  }

  const remoteUrl = await tryGit(directory, ['remote', 'get-url', 'origin'])
  const remote = normalizeGithubRemoteUrl(remoteUrl)

  if (!remote || remote.owner !== owner.toLowerCase() || remote.repo !== repo.toLowerCase()) {
    return null
  }

  return {
    path: directory,
    remoteUrl,
  }
}

async function findRepositoryInDirectory(
  directory: string,
  owner: string,
  repo: string,
  depth = 0,
): Promise<{ path: string; remoteUrl: string } | null> {
  const match = await repositoryMatches(directory, owner, repo)

  if (match || depth >= MAX_SCAN_DEPTH) {
    return match
  }

  let entries

  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return null
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || SKIPPED_DIRECTORIES.has(entry.name)) {
      continue
    }

    const nested = await findRepositoryInDirectory(
      path.join(directory, entry.name),
      owner,
      repo,
      depth + 1,
    )

    if (nested) {
      return nested
    }
  }

  return null
}

async function findLocalRepository(owner: string, repo: string, roots: string[]) {
  for (const root of roots) {
    const match = await findRepositoryInDirectory(root, owner, repo)

    if (match) {
      return match
    }
  }

  return null
}

export function parseLatestCommit(output: string): LocalGitLatestCommit | null {
  const [sha, shortSha, subject, author, date] = output.split('\x1f')

  if (!sha) {
    return null
  }

  return {
    sha,
    shortSha,
    subject: subject || 'Commit',
    author: author || 'unknown',
    date: date || '',
  }
}

export async function getLocalGitRepositoryStatus(
  owner: string,
  repo: string,
  env: EnvRecord = process.env,
): Promise<LocalGitRepositoryStatusResponse> {
  const roots = getLocalGitRoots(env)

  if (!safeRepoPart(owner) || !safeRepoPart(repo)) {
    return {
      ok: false,
      configured: roots.length > 0,
      status: 'invalid-request',
      roots,
      data: null,
      error: {
        type: 'invalid-request',
        message: 'Owner and repo must be simple GitHub owner/repository names.',
      },
    }
  }

  if (roots.length === 0) {
    return {
      ok: false,
      configured: false,
      status: 'not-configured',
      roots,
      data: null,
      error: {
        type: 'not-configured',
        message: 'Set ATLAS_LOCAL_REPO_ROOTS to enable read-only local Git status.',
      },
    }
  }

  try {
    const match = await findLocalRepository(owner, repo, roots)

    if (!match) {
      return {
        ok: false,
        configured: true,
        status: 'not-found',
        roots,
        data: null,
        error: {
          type: 'not-found',
          message: `${owner}/${repo} was not found under configured local repo roots.`,
        },
      }
    }

    const [statusOutput, branchName, latestCommitOutput] = await Promise.all([
      git(match.path, ['status', '--porcelain=v1', '--branch']),
      tryGit(match.path, ['branch', '--show-current']),
      tryGit(match.path, ['log', '-1', '--format=%H%x1f%h%x1f%s%x1f%an%x1f%cI']),
    ])
    const branchStatus = parseGitStatusPorcelain(statusOutput)
    const latestCommit = parseLatestCommit(latestCommitOutput)
    const branch = branchName || branchStatus.branch
    const diagnostic = branchStatus.dirty
      ? `${branchStatus.changedFiles} changed file(s) detected.`
      : 'Working tree is clean.'

    return {
      ok: true,
      configured: true,
      status: 'available',
      roots,
      data: {
        owner,
        repo,
        path: match.path,
        remoteUrl: match.remoteUrl,
        branch,
        upstream: branchStatus.upstream,
        dirty: branchStatus.dirty,
        changedFiles: branchStatus.changedFiles,
        ahead: branchStatus.ahead,
        behind: branchStatus.behind,
        latestCommit,
        checkedAt: new Date().toISOString(),
        diagnostic,
      },
      error: null,
    }
  } catch (error) {
    return {
      ok: false,
      configured: true,
      status: 'error',
      roots,
      data: null,
      error: {
        type: 'error',
        message: error instanceof Error ? error.message : 'Local Git status failed.',
      },
    }
  }
}

export async function getLocalGitRepositoryPreview(
  owner: string,
  repo: string,
  env: EnvRecord = process.env,
): Promise<LocalGitRepositoryPreviewResponse> {
  const statusResponse = await getLocalGitRepositoryStatus(owner, repo, env)

  if (!statusResponse.ok || statusResponse.status !== 'available' || !statusResponse.data) {
    return {
      ok: statusResponse.ok,
      configured: statusResponse.configured,
      status: statusResponse.status,
      roots: statusResponse.roots,
      data: null,
      error: statusResponse.error,
    }
  }

  try {
    const repositoryStatus = statusResponse.data
    const [
      statusOutput,
      unstagedNameStatus,
      stagedNameStatus,
      unstagedNumstat,
      stagedNumstat,
      unstagedDiffStat,
      stagedDiffStat,
      untrackedFiles,
    ] = await Promise.all([
      git(repositoryStatus.path, ['status', '--porcelain=v1', '--branch']),
      tryGit(repositoryStatus.path, ['diff', '--name-status']),
      tryGit(repositoryStatus.path, ['diff', '--cached', '--name-status']),
      tryGit(repositoryStatus.path, ['diff', '--numstat']),
      tryGit(repositoryStatus.path, ['diff', '--cached', '--numstat']),
      tryGit(repositoryStatus.path, ['diff', '--stat']),
      tryGit(repositoryStatus.path, ['diff', '--cached', '--stat']),
      tryGit(repositoryStatus.path, ['ls-files', '--others', '--exclude-standard']),
    ])
    const porcelainChanges = parseGitStatusFileChanges(statusOutput)
    const numstat = new Map([
      ...parseGitNumstat(unstagedNumstat),
      ...parseGitNumstat(stagedNumstat),
    ])
    const changedFiles = attachNumstat(porcelainChanges, numstat).slice(0, MAX_PREVIEW_FILES)
    const numericAdditions = changedFiles.map((change) => change.additions)
    const numericDeletions = changedFiles.map((change) => change.deletions)

    return {
      ok: true,
      configured: true,
      status: 'available',
      roots: statusResponse.roots,
      data: {
        status: repositoryStatus,
        stagedCount: changedFiles.filter((change) => change.staged).length,
        unstagedCount: changedFiles.filter((change) => change.unstaged).length,
        untrackedCount: untrackedFiles ? untrackedFiles.split(/\r?\n/).filter(Boolean).length : 0,
        additions: totalNullable(numericAdditions),
        deletions: totalNullable(numericDeletions),
        changedFiles,
        changeGroups: groupLocalGitChanges(changedFiles),
        diffStat: {
          unstaged: clipDiffStat([unstagedNameStatus, unstagedDiffStat].filter(Boolean).join('\n')),
          staged: clipDiffStat([stagedNameStatus, stagedDiffStat].filter(Boolean).join('\n')),
        },
        dryRunCommit: createDryRunCommitPreview(repositoryStatus, changedFiles),
      },
      error: null,
    }
  } catch (error) {
    return {
      ok: false,
      configured: true,
      status: 'error',
      roots: statusResponse.roots,
      data: null,
      error: {
        type: 'error',
        message: error instanceof Error ? error.message : 'Local Git preview failed.',
      },
    }
  }
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

  if (request.method !== 'GET') {
    json(response, 405, {
      ok: false,
      configured: getLocalGitRoots().length > 0,
      status: 'error',
      roots: getLocalGitRoots(),
      data: null,
      error: {
        type: 'error',
        message: 'Atlas local Git API exposes read-only GET routes only.',
      },
    })
    return
  }

  const url = new URL(request.url, 'http://localhost')

  const route = url.pathname

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
