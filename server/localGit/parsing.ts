import type {
  GitBranchStatus,
  LocalGitChangeGroup,
  LocalGitChangeKind,
  LocalGitDryRunCommitPreview,
  LocalGitFileChange,
  LocalGitRepositoryStatus,
} from './types'

const MAX_DIFF_STAT_LENGTH = 6000

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

export function attachNumstat(
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

export function totalNullable(values: Array<number | null>) {
  if (values.some((value) => value === null)) {
    return null
  }

  return values.reduce<number>((total, value) => total + (value ?? 0), 0)
}

export function clipDiffStat(value: string) {
  return value.length > MAX_DIFF_STAT_LENGTH
    ? `${value.slice(0, MAX_DIFF_STAT_LENGTH)}\n...diff stat truncated by Atlas preview boundary...`
    : value
}

export function createDryRunCommitPreview(
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

export function groupLocalGitChanges(changes: LocalGitFileChange[]): LocalGitChangeGroup[] {
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
