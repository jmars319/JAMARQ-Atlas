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

interface GitBranchStatus {
  branch: string
  upstream: string | null
  ahead: number | null
  behind: number | null
}

const execFileAsync = promisify(execFile)
const GIT_TIMEOUT_MS = 5000
const MAX_SCAN_DEPTH = 5
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

  if (url.pathname !== '/api/git/repositories/status') {
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
  const body = await getLocalGitRepositoryStatus(owner, repo)

  json(response, body.status === 'invalid-request' ? 400 : 200, body)
}
