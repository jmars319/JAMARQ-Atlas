import type { GithubRepositoryLink, ProjectRecord } from '../domain/atlas'
import type { PlanningSourceLink } from '../domain/planning'
import {
  ATLAS_REPO_OPERATIONS_SCHEMA_VERSION,
  emptyRepoOperationsState,
  type RepoOperationsFilters,
  type RepoOperationsRepository,
  type RepoOperationsSnapshot,
  type RepoOperationsState,
} from '../domain/repoOperations'
import type { GithubRepoCommandSummary } from './githubCommand'

export type RepoOperationsGap =
  | 'dirty-local-clone'
  | 'behind-upstream'
  | 'missing-local-clone'
  | 'missing-github-binding'
  | 'missing-verification-command'
  | 'missing-planning-follow-up'

export interface RepoOperationsRow {
  repository: RepoOperationsRepository
  snapshot: RepoOperationsSnapshot
  boundProject: ProjectRecord | null
  githubBinding: GithubRepositoryLink | null
  commandSummary: GithubRepoCommandSummary | null
  gaps: RepoOperationsGap[]
  latestCommitLabel: string
  localStatusLabel: string
  verificationLabel: string
  planningFollowUpCount: number
}

const DEFAULT_GENERATED_AT = new Date('1970-01-01T00:00:00.000Z')

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => readString(item)).filter(Boolean)
    : []
}

function safeDate(value: unknown, fallback = DEFAULT_GENERATED_AT) {
  const candidate = readString(value)

  return candidate && !Number.isNaN(Date.parse(candidate)) ? candidate : fallback.toISOString()
}

function normalizeDocLink(value: unknown) {
  if (!isRecord(value)) {
    return null
  }

  const path = readString(value.path)

  if (!path) {
    return null
  }

  return {
    label: readString(value.label) || path,
    path,
  }
}

function normalizeProjectHint(value: unknown) {
  if (!isRecord(value)) {
    return null
  }

  const projectId = readString(value.projectId)

  if (!projectId) {
    return null
  }

  return {
    projectId,
    label: readString(value.label) || projectId,
  }
}

function parseGithubRemote(remote: string) {
  const withoutGit = remote.trim().replace(/\.git$/i, '')
  const httpsMatch = withoutGit.match(/^https:\/\/github\.com\/([^/]+)\/(.+)$/i)
  const sshMatch = withoutGit.match(/^git@github\.com:([^/]+)\/(.+)$/i)
  const match = httpsMatch ?? sshMatch

  if (!match) {
    return { owner: '', repo: '' }
  }

  return {
    owner: match[1],
    repo: match[2],
  }
}

function normalizeRepository(value: unknown): RepoOperationsRepository | null {
  if (!isRecord(value)) {
    return null
  }

  const id = readString(value.id)
  const name = readString(value.name)
  const githubRemote = readString(value.githubRemote) || readString(value.remote)
  const parsedRemote = parseGithubRemote(githubRemote)
  const githubOwner = readString(value.githubOwner) || parsedRemote.owner
  const githubRepo = readString(value.githubRepo) || parsedRemote.repo

  if (!id || !name) {
    return null
  }

  return {
    id,
    name,
    suite: readString(value.suite) || 'Unassigned',
    product: readString(value.product) || 'Unassigned',
    lifecycle: readString(value.lifecycle) || readString(value.status) || 'unknown',
    deployCategory: readString(value.deployCategory) || readString(value.deployModel),
    localPathHint: readString(value.localPathHint) || readString(value.path),
    githubRemote,
    githubOwner,
    githubRepo,
    packageManagers: readStringArray(value.packageManagers),
    verificationCommands: readStringArray(value.verificationCommands),
    docs: Array.isArray(value.docs)
      ? value.docs
          .map((item) => normalizeDocLink(item))
          .filter((item): item is RepoOperationsRepository['docs'][number] => item !== null)
      : [],
    projectHints: Array.isArray(value.projectHints)
      ? value.projectHints
          .map((item) => normalizeProjectHint(item))
          .filter((item): item is RepoOperationsRepository['projectHints'][number] => item !== null)
      : [],
    notes: readString(value.notes),
  }
}

function summarizeSnapshot(repositories: RepoOperationsRepository[]) {
  return {
    repoCount: repositories.length,
    activeCount: repositories.filter((repository) => repository.lifecycle === 'active').length,
    verificationCommandCount: repositories.reduce(
      (total, repository) => total + repository.verificationCommands.length,
      0,
    ),
    missingVerificationCount: repositories.filter(
      (repository) => repository.verificationCommands.length === 0,
    ).length,
  }
}

export function normalizeRepoOperationsSnapshot(value: unknown): RepoOperationsSnapshot | null {
  if (!isRecord(value)) {
    return null
  }

  if (
    value.schemaVersion !== ATLAS_REPO_OPERATIONS_SCHEMA_VERSION ||
    value.kind !== 'repo-operations'
  ) {
    return null
  }

  const id = readString(value.id)
  const title = readString(value.title)
  const repositories = Array.isArray(value.repositories)
    ? value.repositories
        .map((repository) => normalizeRepository(repository))
        .filter((repository): repository is RepoOperationsRepository => repository !== null)
    : []

  if (!id || !title || repositories.length === 0) {
    return null
  }

  const summary = isRecord(value.summary) ? value.summary : {}

  return {
    schemaVersion: ATLAS_REPO_OPERATIONS_SCHEMA_VERSION,
    kind: 'repo-operations',
    id,
    title,
    generatedAt: safeDate(value.generatedAt, new Date()),
    source: readString(value.source) || 'Imported repo operations packet',
    summary: {
      ...summarizeSnapshot(repositories),
      repoCount: Number(summary.repoCount) || repositories.length,
      activeCount:
        Number(summary.activeCount) ||
        repositories.filter((repository) => repository.lifecycle === 'active').length,
      verificationCommandCount:
        Number(summary.verificationCommandCount) ||
        repositories.reduce(
          (total, repository) => total + repository.verificationCommands.length,
          0,
        ),
      missingVerificationCount:
        Number(summary.missingVerificationCount) ||
        repositories.filter((repository) => repository.verificationCommands.length === 0).length,
    },
    repositories: repositories.sort((left, right) => left.name.localeCompare(right.name)),
  }
}

export function parseRepoOperationsSnapshotJson(text: string): {
  ok: boolean
  snapshot: RepoOperationsSnapshot | null
  errors: string[]
} {
  try {
    const snapshot = normalizeRepoOperationsSnapshot(JSON.parse(text))

    if (!snapshot) {
      return {
        ok: false,
        snapshot: null,
        errors: [
          'Repo operations packet must be repo-operations schema v1 and include at least one repository.',
        ],
      }
    }

    return { ok: true, snapshot, errors: [] }
  } catch {
    return {
      ok: false,
      snapshot: null,
      errors: ['Repo operations packet is not valid JSON.'],
    }
  }
}

function normalizeFilters(value: unknown): RepoOperationsFilters {
  const filters = isRecord(value) ? value : {}

  return {
    query: readString(filters.query),
    suite: readString(filters.suite) || 'all',
    lifecycle: readString(filters.lifecycle) || 'all',
    gap: readString(filters.gap) || 'all',
  }
}

export function emptyRepoOperationsStore(now = new Date()): RepoOperationsState {
  return {
    ...emptyRepoOperationsState,
    updatedAt: now.toISOString(),
  }
}

export function normalizeRepoOperationsState(value: unknown, now = new Date()): RepoOperationsState {
  const defaults = emptyRepoOperationsStore(now)

  if (!isRecord(value)) {
    return defaults
  }

  const snapshots = Array.isArray(value.snapshots)
    ? value.snapshots
        .map((snapshot) => normalizeRepoOperationsSnapshot(snapshot))
        .filter((snapshot): snapshot is RepoOperationsSnapshot => snapshot !== null)
    : []
  const selectedSnapshotId = readString(value.selectedSnapshotId)

  return {
    schemaVersion: ATLAS_REPO_OPERATIONS_SCHEMA_VERSION,
    snapshots,
    selectedSnapshotId: snapshots.some((snapshot) => snapshot.id === selectedSnapshotId)
      ? selectedSnapshotId
      : snapshots[0]?.id ?? '',
    filters: normalizeFilters(value.filters),
    workflowNotes: isRecord(value.workflowNotes)
      ? Object.fromEntries(
          Object.entries(value.workflowNotes)
            .map(([key, item]) => [key, readString(item)])
            .filter(([, item]) => item),
        )
      : {},
    planningLinks: Array.isArray(value.planningLinks)
      ? value.planningLinks.flatMap((link) => {
          if (!isRecord(link)) {
            return []
          }

          const repositoryId = readString(link.repositoryId)
          const projectId = readString(link.projectId)
          const planningItemId = readString(link.planningItemId)

          if (!repositoryId || !projectId || !planningItemId) {
            return []
          }

          return [
            {
              repositoryId,
              projectId,
              planningItemId,
              kind: readString(link.kind) === 'work-session' ? 'work-session' : 'note',
              createdAt: safeDate(link.createdAt, now),
            },
          ]
        })
      : [],
    updatedAt: safeDate(value.updatedAt, now),
  }
}

export function addRepoOperationsSnapshot(
  state: RepoOperationsState,
  snapshot: RepoOperationsSnapshot,
  now = new Date(),
): RepoOperationsState {
  return {
    ...state,
    snapshots: [snapshot, ...state.snapshots.filter((candidate) => candidate.id !== snapshot.id)],
    selectedSnapshotId: snapshot.id,
    updatedAt: now.toISOString(),
  }
}

export function updateRepoOperationsFilters(
  state: RepoOperationsState,
  filters: Partial<RepoOperationsFilters>,
  now = new Date(),
): RepoOperationsState {
  return {
    ...state,
    filters: {
      ...state.filters,
      ...filters,
    },
    updatedAt: now.toISOString(),
  }
}

function repoKey(repository: RepoOperationsRepository) {
  return `${repository.githubOwner}/${repository.githubRepo}`
}

function matchesRepoBinding(repository: RepoOperationsRepository, binding: GithubRepositoryLink) {
  return (
    binding.owner.toLowerCase() === repository.githubOwner.toLowerCase() &&
    binding.name.toLowerCase() === repository.githubRepo.toLowerCase()
  )
}

function findBoundProject(repository: RepoOperationsRepository, projectRecords: ProjectRecord[]) {
  const hinted = repository.projectHints
    .map((hint) => projectRecords.find((record) => record.project.id === hint.projectId))
    .find(Boolean)

  if (hinted) {
    return hinted
  }

  return (
    projectRecords.find((record) =>
      record.project.repositories.some((binding) => matchesRepoBinding(repository, binding)),
    ) ?? null
  )
}

export function deriveRepoOperationsRows({
  state,
  projectRecords,
  commandSummaries,
}: {
  state: RepoOperationsState
  projectRecords: ProjectRecord[]
  commandSummaries: GithubRepoCommandSummary[]
}): RepoOperationsRow[] {
  const snapshot = state.snapshots.find((candidate) => candidate.id === state.selectedSnapshotId)

  if (!snapshot) {
    return []
  }

  return snapshot.repositories.map((repository) => {
    const boundProject = findBoundProject(repository, projectRecords)
    const githubBinding =
      boundProject?.project.repositories.find((binding) => matchesRepoBinding(repository, binding)) ??
      null
    const commandSummary =
      commandSummaries.find(
        (summary) => summary.fullName.toLowerCase() === repoKey(repository).toLowerCase(),
      ) ?? null
    const localGit = commandSummary?.localGit
    const gaps: RepoOperationsGap[] = []

    if (!githubBinding && repository.githubOwner && repository.githubRepo) {
      gaps.push('missing-github-binding')
    }

    if (repository.verificationCommands.length === 0) {
      gaps.push('missing-verification-command')
    }

    if (localGit?.status === 'not-found') {
      gaps.push('missing-local-clone')
    }

    if (localGit?.data?.dirty) {
      gaps.push('dirty-local-clone')
    }

    if ((localGit?.data?.behind ?? 0) > 0) {
      gaps.push('behind-upstream')
    }

    const planningFollowUpCount = state.planningLinks.filter(
      (link) => link.repositoryId === repository.id,
    ).length

    if (gaps.length > 0 && planningFollowUpCount === 0) {
      gaps.push('missing-planning-follow-up')
    }

    return {
      repository,
      snapshot,
      boundProject,
      githubBinding,
      commandSummary,
      gaps,
      latestCommitLabel: localGit?.data?.latestCommit
        ? `${localGit.data.latestCommit.shortSha} ${localGit.data.latestCommit.subject}`
        : commandSummary?.latestCommit
          ? `${commandSummary.latestCommit.shortSha} ${commandSummary.latestCommit.message.split('\n')[0]}`
          : 'No commit evidence loaded',
      localStatusLabel: localGit?.data
        ? [
            localGit.data.branch,
            localGit.data.dirty ? `${localGit.data.changedFiles} changed` : 'clean',
            localGit.data.upstream
              ? `${localGit.data.ahead ?? 0} ahead / ${localGit.data.behind ?? 0} behind`
              : 'upstream unknown',
          ].join(' / ')
        : localGit?.status ?? 'not loaded',
      verificationLabel:
        repository.verificationCommands.length > 0
          ? `${repository.verificationCommands.length} command(s)`
          : 'No verification command listed',
      planningFollowUpCount,
    }
  })
}

export function filterRepoOperationsRows(rows: RepoOperationsRow[], filters: RepoOperationsFilters) {
  const query = filters.query.toLowerCase()

  return rows.filter((row) => {
    const haystack = [
      row.repository.id,
      row.repository.name,
      row.repository.suite,
      row.repository.product,
      row.repository.githubRemote,
      row.repository.localPathHint,
      row.boundProject?.project.name ?? '',
    ]
      .join(' ')
      .toLowerCase()

    return (
      (!query || haystack.includes(query)) &&
      (filters.suite === 'all' || row.repository.suite === filters.suite) &&
      (filters.lifecycle === 'all' || row.repository.lifecycle === filters.lifecycle) &&
      (filters.gap === 'all' || row.gaps.includes(filters.gap as RepoOperationsGap))
    )
  })
}

export function repoOperationsSourceLink(
  repository: RepoOperationsRepository,
): PlanningSourceLink {
  return {
    type: 'repo-operations',
    id: repository.id,
    label: `Repo operations: ${repository.name}`,
  }
}

export function repoOperationsPlanningDetail(row: RepoOperationsRow) {
  const gapLabel = row.gaps.length > 0 ? row.gaps.join(', ') : 'No current repo gap.'

  return [
    `Repository: ${row.repository.name}`,
    `Registry id: ${row.repository.id}`,
    `GitHub: ${row.repository.githubOwner}/${row.repository.githubRepo}`,
    `Local path hint: ${row.repository.localPathHint || 'not listed'}`,
    `Local status: ${row.localStatusLabel}`,
    `Verification: ${row.verificationLabel}`,
    `Gaps: ${gapLabel}`,
  ].join('\n')
}

export function summarizeRepoOperationRows(rows: RepoOperationsRow[]) {
  return {
    total: rows.length,
    bound: rows.filter((row) => row.githubBinding).length,
    dirty: rows.filter((row) => row.gaps.includes('dirty-local-clone')).length,
    behind: rows.filter((row) => row.gaps.includes('behind-upstream')).length,
    missingClone: rows.filter((row) => row.gaps.includes('missing-local-clone')).length,
    missingVerification: rows.filter((row) =>
      row.gaps.includes('missing-verification-command'),
    ).length,
    needsPlanning: rows.filter((row) => row.gaps.includes('missing-planning-follow-up')).length,
  }
}
