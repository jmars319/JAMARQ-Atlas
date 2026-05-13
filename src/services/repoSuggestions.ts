import type { ProjectRecord } from '../domain/atlas'
import type { GithubRepositorySummary } from './githubIntegration'
import {
  findRepositoryBinding,
  repositoryKey,
  repositorySummaryToLink,
} from './repoBinding'

export type RepoSuggestionConfidence = 'high' | 'medium' | 'low'

export type RepoSuggestionReason =
  | 'project-name'
  | 'project-text'
  | 'portfolio-keyword'
  | 'section-group'
  | 'outliers'

export interface RepoPlacementSuggestionReason {
  type: RepoSuggestionReason
  detail: string
}

export interface RepoPlacementSuggestion {
  repository: GithubRepositorySummary
  repositoryKey: string
  confidence: RepoSuggestionConfidence
  suggestedProjectId: string | null
  suggestedProjectName: string | null
  suggestedSectionId: string | null
  suggestedSectionName: string | null
  suggestedGroupId: string | null
  suggestedGroupName: string | null
  reasons: RepoPlacementSuggestionReason[]
  score: number
}

interface PortfolioHint {
  label: string
  sectionId: string
  groupId?: string
  projectId?: string
  matchCompact?: string[]
  matchAllTokens?: string[]
}

interface ProjectCandidate {
  record: ProjectRecord
  score: number
  reasons: RepoPlacementSuggestionReason[]
}

interface PortfolioCandidate {
  sectionId: string
  sectionName: string
  groupId: string | null
  groupName: string | null
  score: number
  reasons: RepoPlacementSuggestionReason[]
}

const STOP_WORDS = new Set([
  'and',
  'app',
  'apps',
  'client',
  'code',
  'com',
  'dev',
  'digital',
  'for',
  'frontend',
  'github',
  'internal',
  'local',
  'net',
  'org',
  'platform',
  'project',
  'repo',
  'repository',
  'site',
  'system',
  'systems',
  'the',
  'tool',
  'tools',
  'web',
  'website',
  'www',
])

const PORTFOLIO_HINTS: PortfolioHint[] = [
  {
    label: 'Midway Music Hall',
    sectionId: 'client-systems',
    groupId: 'midway-music-hall',
    projectId: 'midway-music-hall-site',
    matchCompact: ['mmh', 'midwaymusichall', 'midwaymusic'],
    matchAllTokens: ['midway', 'music'],
  },
  {
    label: 'Midway Mobile Storage',
    sectionId: 'client-systems',
    groupId: 'midway-mobile-storage',
    projectId: 'midway-mobile-storage-site',
    matchCompact: ['mms', 'midwaymobilestorage', 'mobilestorage'],
    matchAllTokens: ['midway', 'storage'],
  },
  {
    label: 'Thunder Road',
    sectionId: 'client-systems',
    groupId: 'thunder-road',
    projectId: 'thunder-road-site',
    matchCompact: ['trbg', 'thunderroad', 'thunderroadbar'],
    matchAllTokens: ['thunder', 'road'],
  },
  {
    label: 'Surplus Containers',
    sectionId: 'client-systems',
    groupId: 'surplus-containers',
    projectId: 'surplus-containers-site',
    matchCompact: ['surpluscontainers', 'surpluscontainer'],
    matchAllTokens: ['surplus', 'containers'],
  },
  {
    label: 'Bow Wow',
    sectionId: 'client-systems',
    groupId: 'bow-wow',
    projectId: 'bow-wow-site',
    matchCompact: ['bowwow', 'bowwowboarding'],
    matchAllTokens: ['bow', 'wow'],
  },
  {
    label: 'VaexCore',
    sectionId: 'vaexcore',
    matchCompact: ['vaexcore', 'vaex'],
    matchAllTokens: ['vaexcore'],
  },
  {
    label: 'Tenra',
    sectionId: 'tenra',
    matchCompact: ['tenra'],
    matchAllTokens: ['tenra'],
  },
  {
    label: 'JAMARQ Atlas',
    sectionId: 'jamarq',
    groupId: 'jamarq-internal-tools',
    projectId: 'jamarq-atlas',
    matchCompact: ['jamarqatlas', 'atlas'],
    matchAllTokens: ['atlas'],
  },
  {
    label: 'JAMARQ',
    sectionId: 'jamarq',
    matchCompact: ['jamarq'],
    matchAllTokens: ['jamarq'],
  },
]

const CONFIDENCE_ORDER: Record<RepoSuggestionConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
}

function uniqueTokens(value: string) {
  return new Set(tokenize(value))
}

function repoText(repository: GithubRepositorySummary) {
  return [
    repository.name,
    repository.fullName,
    repository.description ?? '',
    repository.language ?? '',
  ].join(' ')
}

function projectText(record: ProjectRecord) {
  const manual = record.project.manual

  return [
    record.section.name,
    record.group.name,
    record.project.id,
    record.project.name,
    record.project.kind,
    record.project.summary,
    manual.nextAction,
    manual.currentRisk,
    manual.notes.join(' '),
    manual.decisions.join(' '),
  ].join(' ')
}

function intersectTokens(left: Set<string>, right: Set<string>) {
  return [...left].filter((token) => right.has(token))
}

function hintMatches(hint: PortfolioHint, repoTokens: Set<string>, compactRepositoryText: string) {
  const compactMatch =
    hint.matchCompact?.some((value) => compactRepositoryText.includes(compact(value))) ?? false
  const allTokenMatch =
    hint.matchAllTokens?.every((token) => repoTokens.has(token.toLowerCase())) ?? false

  return compactMatch || allTokenMatch
}

function findSectionGroup(
  projectRecords: ProjectRecord[],
  sectionId: string,
  groupId?: string,
) {
  const record =
    projectRecords.find(
      (candidate) =>
        candidate.section.id === sectionId && (!groupId || candidate.group.id === groupId),
    ) ?? projectRecords.find((candidate) => candidate.section.id === sectionId)

  if (!record) {
    return null
  }

  return {
    sectionId: record.section.id,
    sectionName: record.section.name,
    groupId: groupId ? record.group.id : null,
    groupName: groupId ? record.group.name : null,
  }
}

function buildProjectCandidate(
  record: ProjectRecord,
  repoTokens: Set<string>,
  compactRepositoryName: string,
  compactRepositoryText: string,
): ProjectCandidate {
  const candidateTokens = uniqueTokens(projectText(record))
  const compactProjectName = compact(record.project.name)
  const compactProjectId = compact(record.project.id)
  const overlap = intersectTokens(repoTokens, candidateTokens)
  const reasons: RepoPlacementSuggestionReason[] = []
  let score = 0

  if (compactRepositoryName === compactProjectName || compactRepositoryName === compactProjectId) {
    score += 100
    reasons.push({
      type: 'project-name',
      detail: `Repository name matches ${record.project.name}.`,
    })
  } else if (
    compactRepositoryName.includes(compactProjectName) ||
    compactProjectName.includes(compactRepositoryName) ||
    compactRepositoryName.includes(compactProjectId) ||
    compactProjectId.includes(compactRepositoryName)
  ) {
    score += 72
    reasons.push({
      type: 'project-name',
      detail: `Repository name closely matches ${record.project.name}.`,
    })
  }

  if (overlap.length > 0) {
    score += Math.min(36, overlap.length * 7)
    reasons.push({
      type: 'project-text',
      detail: `Shares local Atlas terms: ${overlap.slice(0, 4).join(', ')}.`,
    })
  }

  for (const hint of PORTFOLIO_HINTS) {
    if (!hintMatches(hint, repoTokens, compactRepositoryText)) {
      continue
    }

    if (hint.projectId === record.project.id) {
      score += 68
      reasons.push({
        type: 'portfolio-keyword',
        detail: `Portfolio keyword points to ${hint.label}.`,
      })
      continue
    }

    if (
      record.section.id === hint.sectionId &&
      (!hint.groupId || record.group.id === hint.groupId)
    ) {
      score += hint.groupId ? 18 : 10
    }
  }

  return {
    record,
    score,
    reasons,
  }
}

function buildPortfolioCandidate(
  projectRecords: ProjectRecord[],
  repoTokens: Set<string>,
  compactRepositoryText: string,
): PortfolioCandidate | null {
  const sectionScores = new Map<string, PortfolioCandidate>()

  function addScore(
    sectionId: string,
    groupId: string | undefined,
    score: number,
    reason: RepoPlacementSuggestionReason,
  ) {
    const placement = findSectionGroup(projectRecords, sectionId, groupId)

    if (!placement) {
      return
    }

    const key = `${placement.sectionId}/${placement.groupId ?? ''}`
    const existing = sectionScores.get(key)

    if (existing) {
      existing.score += score
      existing.reasons.push(reason)
      return
    }

    sectionScores.set(key, {
      ...placement,
      score,
      reasons: [reason],
    })
  }

  for (const hint of PORTFOLIO_HINTS) {
    if (hintMatches(hint, repoTokens, compactRepositoryText)) {
      addScore(hint.sectionId, hint.groupId, 48, {
        type: 'portfolio-keyword',
        detail: `Repository text includes ${hint.label} placement terms.`,
      })
    }
  }

  for (const record of projectRecords) {
    const sectionTokens = uniqueTokens(`${record.section.name} ${record.group.name}`)
    const overlap = intersectTokens(repoTokens, sectionTokens)

    if (overlap.length > 0) {
      addScore(record.section.id, record.group.id, Math.min(18, overlap.length * 6), {
        type: 'section-group',
        detail: `Matches section/group terms: ${overlap.slice(0, 3).join(', ')}.`,
      })
    }
  }

  const sorted = [...sectionScores.values()].sort((left, right) => right.score - left.score)
  const best = sorted[0]

  if (best) {
    return best
  }

  const outliers = findSectionGroup(projectRecords, 'outliers', 'one-off-tools')

  if (!outliers) {
    return null
  }

  return {
    ...outliers,
    score: 0,
    reasons: [
      {
        type: 'outliers',
        detail: 'No strong local match was found; keep this in Outliers until a human reviews it.',
      },
    ],
  }
}

function confidenceFor(score: number, hasProject: boolean): RepoSuggestionConfidence {
  if (hasProject && score >= 85) {
    return 'high'
  }

  if (score >= 42) {
    return 'medium'
  }

  return 'low'
}

export function deriveRepoPlacementSuggestions(
  projectRecords: ProjectRecord[],
  repositories: GithubRepositorySummary[],
): RepoPlacementSuggestion[] {
  const suggestions = repositories.flatMap((repository) => {
    const link = repositorySummaryToLink(repository)

    if (findRepositoryBinding(projectRecords, link)) {
      return []
    }

    const text = repoText(repository)
    const tokens = uniqueTokens(text)
    const compactRepositoryName = compact(repository.name)
    const compactRepositoryText = compact(text)
    const candidates = projectRecords
      .map((record) =>
        buildProjectCandidate(
          record,
          tokens,
          compactRepositoryName,
          compactRepositoryText,
        ),
      )
      .sort((left, right) => right.score - left.score)
    const projectCandidate = candidates[0]
    const portfolioCandidate = buildPortfolioCandidate(
      projectRecords,
      tokens,
      compactRepositoryText,
    )
    const strongProject = projectCandidate && projectCandidate.score >= 42
    const projectRecord = strongProject ? projectCandidate.record : null
    const score = strongProject ? projectCandidate.score : portfolioCandidate?.score ?? 0
    const confidence = confidenceFor(score, Boolean(projectRecord))
    const reasons = strongProject
      ? projectCandidate.reasons
      : (portfolioCandidate?.reasons ?? [
          {
            type: 'outliers' as const,
            detail: 'No placement signal was available.',
          },
        ])
    const fallbackPlacement =
      portfolioCandidate ??
      buildPortfolioCandidate(projectRecords, tokens, compactRepositoryText)

    return [
      {
        repository,
        repositoryKey: repositoryKey(link),
        confidence,
        suggestedProjectId: projectRecord?.project.id ?? null,
        suggestedProjectName: projectRecord?.project.name ?? null,
        suggestedSectionId: projectRecord?.section.id ?? fallbackPlacement?.sectionId ?? null,
        suggestedSectionName: projectRecord?.section.name ?? fallbackPlacement?.sectionName ?? null,
        suggestedGroupId: projectRecord?.group.id ?? fallbackPlacement?.groupId ?? null,
        suggestedGroupName: projectRecord?.group.name ?? fallbackPlacement?.groupName ?? null,
        reasons: reasons.length > 0 ? reasons : fallbackPlacement?.reasons ?? [],
        score,
      },
    ]
  })

  return suggestions.sort((left, right) => {
    const confidenceDelta = CONFIDENCE_ORDER[left.confidence] - CONFIDENCE_ORDER[right.confidence]

    if (confidenceDelta !== 0) {
      return confidenceDelta
    }

    if (right.score !== left.score) {
      return right.score - left.score
    }

    return left.repository.fullName.localeCompare(right.repository.fullName)
  })
}
