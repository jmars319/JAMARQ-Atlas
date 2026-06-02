import { execFile } from 'node:child_process'
import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import type {
  EnvRecord,
  LocalGitLatestCommit,
  LocalGitRepositoryPreviewResponse,
  LocalGitRepositoryStatusResponse,
} from './types'
import {
  attachNumstat,
  clipDiffStat,
  createDryRunCommitPreview,
  groupLocalGitChanges,
  parseGitNumstat,
  parseGitStatusFileChanges,
  parseGitStatusPorcelain,
  totalNullable,
} from './parsing'

const execFileAsync = promisify(execFile)

const GIT_TIMEOUT_MS = 5000

const MAX_SCAN_DEPTH = 5

const MAX_PREVIEW_FILES = 80

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
