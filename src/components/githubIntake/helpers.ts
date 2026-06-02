import type { GithubRepositorySource, GithubRepositorySummary } from '../../services/githubIntegration'
import type { GithubRepoCommandSummary } from '../../services/githubCommand'
import type { IntakeRepository } from './types'

export function mergeRepositories(
  configured: GithubRepositorySummary[],
  viewer: GithubRepositorySummary[],
) {
  const repositories = new Map<string, IntakeRepository>()

  function add(repository: GithubRepositorySummary, source: GithubRepositorySource) {
    const key = repository.fullName.toLowerCase()
    const existing = repositories.get(key)

    if (existing) {
      if (!existing.sources.includes(source)) {
        existing.sources.push(source)
      }
      return
    }

    repositories.set(key, {
      repository,
      sources: [source],
    })
  }

  configured.forEach((repository) => add(repository, 'configured'))
  viewer.forEach((repository) => add(repository, 'viewer'))

  return [...repositories.values()].sort((left, right) =>
    left.repository.fullName.localeCompare(right.repository.fullName),
  )
}

export function sourceLabel(sources: GithubRepositorySource[], viewerLabel: string) {
  if (sources.length > 1) {
    return `Configured + ${viewerLabel}`
  }

  return sources[0] === 'configured' ? 'Configured' : viewerLabel
}

export function uniqueRepoKeys(repoKeys: string[]) {
  return repoKeys
    .filter(Boolean)
    .filter(
      (repoKey, index, keys) =>
        keys.findIndex((candidate) => candidate.toLowerCase() === repoKey.toLowerCase()) === index,
    )
}

export function summaryFor(
  summaries: GithubRepoCommandSummary[],
  fullName: string,
) {
  return summaries.find((summary) => summary.fullName.toLowerCase() === fullName.toLowerCase())
}

export function localGitSummaryLabel(summary: GithubRepoCommandSummary) {
  if (summary.localGit.status !== 'available' || !summary.localGit.data) {
    return summary.localGit.status
  }

  const { data } = summary.localGit
  const dirty = data.dirty ? `${data.changedFiles} changed` : 'clean'
  const sync =
    data.ahead !== null && data.behind !== null
      ? `${data.ahead} ahead / ${data.behind} behind`
      : 'upstream unknown'

  return `${data.branch} / ${dirty} / ${sync}`
}

export function isRecentlyPushed(repository: GithubRepositorySummary) {
  if (!repository.pushedAt) {
    return false
  }

  const pushedAt = new Date(repository.pushedAt).getTime()

  return Number.isFinite(pushedAt) && Date.now() - pushedAt <= 14 * 86_400_000
}

