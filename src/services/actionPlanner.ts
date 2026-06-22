import type { ProjectRecord } from '../domain/atlas'
import type {
  GithubAttentionSignal,
  GithubPermissionGap,
  GithubRepoCommandSummary,
} from './githubCommand'

export type AtlasActionIntentKind =
  | 'review-dirty-local-changes'
  | 'prepare-commit'
  | 'investigate-failed-ci'
  | 'review-stale-ci'
  | 'review-open-pr'
  | 'review-open-issue'
  | 'inspect-missing-local-clone'
  | 'investigate-permission-gap'
  | 'prepare-deployment-readiness'

export type AtlasActionIntentRisk = 'low' | 'medium' | 'high'
export type AtlasActionIntentStatus = 'ready' | 'blocked' | 'locked'
export type AtlasActionIntentSource =
  | 'deployment-readiness'
  | 'github-command'
  | 'github-issue'
  | 'github-pr'
  | 'local-git'
  | 'permission-gap'

export type AtlasActionPlannerGroup =
  | 'ci-check-failures'
  | 'dirty-local-changes'
  | 'missing-local-clone'
  | 'needs-review'
  | 'open-prs-issues'
  | 'permission-data-gaps'
  | 'stale-evidence'

export interface AtlasActionEvidence {
  label: string
  value: string
  url: string | null
}

export interface AtlasActionTarget {
  owner: string
  repo: string
  repositoryKey: string
  repositoryUrl: string | null
  projectId: string | null
  projectName: string | null
}

export interface AtlasActionIntent {
  id: string
  kind: AtlasActionIntentKind
  group: AtlasActionPlannerGroup
  source: AtlasActionIntentSource
  risk: AtlasActionIntentRisk
  status: AtlasActionIntentStatus
  title: string
  detail: string
  reason: string
  target: AtlasActionTarget
  evidence: AtlasActionEvidence[]
  occurredAt: string | null
  locked: true
}

export interface AtlasActionExecutionGate {
  id: string
  locked: true
  status: 'locked'
  summary: string
  requiredPermissions: string[]
  blockers: string[]
}

export interface AtlasActionDryRunStep {
  id: string
  label: string
  commandPreview: string | null
  apiPreview: string | null
  mutating: boolean
  locked: boolean
  message: string
}

export interface AtlasActionDryRunPlan {
  id: string
  intentId: string
  generatedAt: string
  status: 'locked'
  summary: string
  target: AtlasActionTarget
  risk: AtlasActionIntentRisk
  requiredPermissions: string[]
  blockers: string[]
  warnings: string[]
  steps: AtlasActionDryRunStep[]
  executionGate: AtlasActionExecutionGate
  writeControlsEnabled: false
}

export interface AtlasProjectActionRollup {
  projectId: string
  projectName: string
  totalIntents: number
  highestRisk: AtlasActionIntentRisk | 'none'
  dirtyLocalRepoCount: number
  failedOrStaleCiCount: number
  openPullRequestIssueCount: number
  topRecommendedActions: AtlasActionIntent[]
}

/* Action risk contract */ const riskRank: Record<AtlasActionIntentRisk, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

const groupOrder: Record<AtlasActionPlannerGroup, number> = {
  'ci-check-failures': 0,
  'dirty-local-changes': 1,
  'stale-evidence': 2,
  'open-prs-issues': 3,
  'missing-local-clone': 4,
  'permission-data-gaps': 5,
  'needs-review': 6,
}

function repoKey(owner: string, repo: string) {
  return `${owner}/${repo}`
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/* Repository binding boundary */ function projectByRepo(projectRecords: ProjectRecord[]) {
  return new Map(
    projectRecords.flatMap((record) =>
      record.project.repositories.map((repository) => [
        repoKey(repository.owner, repository.name).toLowerCase(),
        record,
      ]),
    ),
  )
}

function targetForSummary(
  summary: GithubRepoCommandSummary,
  record: ProjectRecord | undefined,
): AtlasActionTarget {
  return {
    owner: summary.owner,
    repo: summary.repo,
    repositoryKey: summary.fullName,
    repositoryUrl: summary.repository?.htmlUrl ?? null,
    projectId: record?.project.id ?? null,
    projectName: record?.project.name ?? null,
  }
}

function evidence(label: string, value: string | null | undefined, url: string | null = null) {
  return {
    label,
    value: value || 'Unavailable',
    url,
  }
}

function intentId(
  target: AtlasActionTarget,
  kind: AtlasActionIntentKind,
  evidenceKey: string,
) {
  return `action-${slug(target.repositoryKey)}-${kind}-${slug(evidenceKey)}`
}

function signalEvidence(signal: GithubAttentionSignal[]) {
  return signal.flatMap((item) => [
    evidence(item.title, item.detail, item.url),
    ...item.evidence.slice(0, 2).map((value, index) => evidence(`Evidence ${index + 1}`, value)),
  ])
}

function gapEvidence(gap: GithubPermissionGap) {
  return [
    evidence('Resource', gap.resource),
    evidence('Gap', gap.type),
    evidence('Permission', gap.permission),
    evidence('Message', gap.message),
  ]
}

type CreateIntentInput = Omit<AtlasActionIntent, 'id' | 'locked' | 'occurredAt' | 'status'> & {
  evidenceKey: string
  occurredAt?: string | null
  status?: AtlasActionIntentStatus
}

/* Intent safety boundary */ function createIntent({
  kind,
  group,
  source,
  risk,
  status = 'locked',
  title,
  detail,
  reason,
  target,
  evidence: intentEvidence,
  occurredAt = null,
  evidenceKey,
}: CreateIntentInput): AtlasActionIntent {
  return {
    id: intentId(target, kind, evidenceKey),
    kind,
    group,
    source,
    risk,
    status,
    title,
    detail,
    reason,
    target,
    evidence: intentEvidence,
    occurredAt,
    locked: true,
  }
}

function sortIntents(intents: AtlasActionIntent[]) {
  return intents.slice().sort((left, right) => {
    const riskDelta = riskRank[left.risk] - riskRank[right.risk]

    if (riskDelta !== 0) {
      return riskDelta
    }

    const groupDelta = groupOrder[left.group] - groupOrder[right.group]

    if (groupDelta !== 0) {
      return groupDelta
    }

    return (right.occurredAt ?? '').localeCompare(left.occurredAt ?? '')
  })
}

/* Action derivation boundary */ export function deriveAtlasActionIntents({
  projectRecords,
  summaries,
}: {
  projectRecords: ProjectRecord[]
  summaries: GithubRepoCommandSummary[]
}) {
  const recordsByRepo = projectByRepo(projectRecords)
  const intents: AtlasActionIntent[] = []

  summaries.forEach((summary) => {
    const record = recordsByRepo.get(summary.fullName.toLowerCase())
    const target = targetForSummary(summary, record)
    const failureSignals = summary.signals.filter(
      (signal) =>
        ['checks', 'workflow'].includes(signal.category) &&
        signal.severity === 'danger' &&
        !signal.stale,
    )
    const staleSignals = summary.signals.filter((signal) => signal.stale)

    if (summary.localGit.status === 'available' && summary.localGit.data?.dirty) {
      const local = summary.localGit.data

      intents.push(
        createIntent({
          kind: 'review-dirty-local-changes',
          group: 'dirty-local-changes',
          source: 'local-git',
          risk: 'medium',
          title: `${summary.fullName}: review local changes`,
          detail: `${local.changedFiles} changed file(s) are present in the local clone.`,
          reason: 'Local changes should be reviewed before any future commit, push, or deployment work.',
          target,
          evidence: [
            evidence('Branch', local.branch),
            evidence('Upstream', local.upstream),
            evidence('Latest local commit', local.latestCommit?.shortSha),
            evidence('Path', local.path),
          ],
          occurredAt: local.checkedAt,
          evidenceKey: 'local-dirty',
        }),
        createIntent({
          kind: 'prepare-commit',
          group: 'dirty-local-changes',
          source: 'local-git',
          risk: 'high',
          title: `${summary.fullName}: prepare commit preview`,
          detail: 'A future commit could be prepared after review, but Atlas will not stage or commit in this cycle.',
          reason: 'Dirty local changes exist and need a dry-run commit plan before any write action is enabled.',
          target,
          evidence: [
            evidence('Changed files', String(local.changedFiles)),
            evidence('Ahead', String(local.ahead ?? 'unknown')),
            evidence('Behind', String(local.behind ?? 'unknown')),
          ],
          occurredAt: local.checkedAt,
          evidenceKey: 'prepare-commit',
        }),
      )
    }

    if (summary.localGit.status === 'not-found') {
      intents.push(
        createIntent({
          kind: 'inspect-missing-local-clone',
          group: 'missing-local-clone',
          source: 'local-git',
          risk: 'low',
          status: 'blocked',
          title: `${summary.fullName}: inspect missing local clone`,
          detail: summary.localGit.error?.message ?? 'No local clone matched this GitHub repository.',
          reason: 'Atlas can show remote evidence, but local Git preview needs a matched clone under configured roots.',
          target,
          evidence: summary.localGit.roots.map((root) => evidence('Configured root', root)),
          evidenceKey: 'missing-local-clone',
        }),
      )
    }

    if (failureSignals.length > 0) {
      intents.push(
        createIntent({
          kind: 'investigate-failed-ci',
          group: 'ci-check-failures',
          source: 'github-command',
          risk: 'high',
          status: 'blocked',
          title: `${summary.fullName}: investigate failed CI/check`,
          detail: summary.failureExplanation
            ? [
                summary.failureExplanation.workflowName,
                summary.failureExplanation.jobName,
                summary.failureExplanation.stepName,
                summary.failureExplanation.conclusion,
              ]
                .filter(Boolean)
                .join(' / ')
            : failureSignals[0].detail,
          reason: 'Latest CI/check evidence is failing and needs human review before dispatch or release decisions.',
          target,
          evidence: signalEvidence(failureSignals).slice(0, 6),
          occurredAt: failureSignals[0].occurredAt,
          evidenceKey: failureSignals.map((signal) => signal.id).join('-'),
        }),
      )
    }

    if (staleSignals.length > 0) {
      intents.push(
        createIntent({
          kind: 'review-stale-ci',
          group: 'stale-evidence',
          source: 'github-command',
          risk: 'medium',
          title: `${summary.fullName}: review stale CI/check evidence`,
          detail: staleSignals[0].detail,
          reason: 'The visible CI/check result is historical and should not be treated as current readiness.',
          target,
          evidence: signalEvidence(staleSignals).slice(0, 6),
          occurredAt: staleSignals[0].occurredAt,
          evidenceKey: staleSignals.map((signal) => signal.id).join('-'),
        }),
      )
    }

    if (summary.counts.openPullRequests > 0) {
      intents.push(
        createIntent({
          kind: 'review-open-pr',
          group: 'open-prs-issues',
          source: 'github-pr',
          risk: 'medium',
          title: `${summary.fullName}: review open pull requests`,
          detail: `${summary.counts.openPullRequests} open pull request(s) are visible.`,
          reason: 'Open PRs can change deploy readiness and should be reviewed from read-only evidence first.',
          target,
          evidence: [
            evidence('Open PR count', String(summary.counts.openPullRequests), summary.repository?.htmlUrl ?? null),
            ...summary.signals
              .filter((signal) => signal.category === 'pull-requests')
              .flatMap((signal) => signal.evidence.slice(0, 3).map((value) => evidence('PR', value))),
          ],
          occurredAt:
            summary.signals.find((signal) => signal.category === 'pull-requests')?.occurredAt ??
            summary.fetchedAt,
          evidenceKey: 'open-prs',
        }),
      )
    }

    if (summary.counts.openIssues > 0) {
      intents.push(
        createIntent({
          kind: 'review-open-issue',
          group: 'open-prs-issues',
          source: 'github-issue',
          risk: 'medium',
          title: `${summary.fullName}: review open issues`,
          detail: `${summary.counts.openIssues} open issue(s) are visible.`,
          reason: 'Open issues may be planning follow-ups or release blockers, but Atlas will not mutate status automatically.',
          target,
          evidence: [
            evidence('Open issue count', String(summary.counts.openIssues), summary.repository?.htmlUrl ?? null),
            ...summary.signals
              .filter((signal) => signal.category === 'issues')
              .flatMap((signal) => signal.evidence.slice(0, 3).map((value) => evidence('Issue', value))),
          ],
          occurredAt:
            summary.signals.find((signal) => signal.category === 'issues')?.occurredAt ??
            summary.fetchedAt,
          evidenceKey: 'open-issues',
        }),
      )
    }

    summary.permissionGaps.forEach((gap) => {
      intents.push(
        createIntent({
          kind: 'investigate-permission-gap',
          group: 'permission-data-gaps',
          source: 'permission-gap',
          risk: 'medium',
          status: 'blocked',
          title: `${summary.fullName}: investigate ${gap.resource} data gap`,
          detail: gap.message,
          reason: 'Permission and data gaps are first-class evidence; the planner should show what is unavailable.',
          target,
          evidence: gapEvidence(gap),
          evidenceKey: `${gap.resource}-${gap.type}`,
        }),
      )
    })

    if (record && !summary.latestDeployment) {
      intents.push(
        createIntent({
          kind: 'prepare-deployment-readiness',
          group: 'needs-review',
          source: 'deployment-readiness',
          risk: 'low',
          title: `${summary.fullName}: prepare deployment readiness review`,
          detail: 'No latest GitHub deployment evidence is loaded for this bound repository.',
          reason: 'Deployment execution remains locked, but bound repos should have readiness evidence before future dispatch automation.',
          target,
          evidence: [
            evidence('Project', record.project.name),
            evidence('Latest commit', summary.latestCommit?.shortSha),
            evidence('Latest release', summary.latestRelease?.tagName),
          ],
          occurredAt: summary.fetchedAt,
          evidenceKey: 'deployment-readiness',
        }),
      )
    }
  })

  return sortIntents(
    intents.filter(
      (intent, index, all) => all.findIndex((candidate) => candidate.id === intent.id) === index,
    ),
  )
}

/* Permission gate boundary */ function requiredPermissions(intent: AtlasActionIntent) {
  if (intent.kind === 'prepare-commit') {
    return ['local git write access', 'future explicit commit confirmation']
  }

  if (intent.kind === 'investigate-failed-ci') {
    return ['actions: read', 'checks: read', 'future workflow write permission remains locked']
  }

  if (intent.kind === 'review-open-pr') {
    return ['pull requests: read', 'future pull request write permission remains locked']
  }

  if (intent.kind === 'review-open-issue') {
    return ['issues: read', 'future issue write permission remains locked']
  }

  if (intent.kind === 'prepare-deployment-readiness') {
    return ['deployments: read', 'future deployment write permission remains locked']
  }

  return ['read-only evidence access']
}

function dryRunSteps(intent: AtlasActionIntent): AtlasActionDryRunStep[] {
  const base: AtlasActionDryRunStep[] = [
    {
      id: `${intent.id}-review-evidence`,
      label: 'Review loaded evidence',
      commandPreview: null,
      apiPreview: null,
      mutating: false,
      locked: false,
      message: 'Uses evidence already loaded through read-only Atlas routes.',
    },
  ]

  if (intent.kind === 'prepare-commit') {
    return [
      ...base,
      {
        id: `${intent.id}-git-status`,
        label: 'Inspect local Git diff',
        commandPreview: 'git status --short --branch && git diff --stat && git diff --cached --stat',
        apiPreview: `/api/git/repositories/preview?owner=${intent.target.owner}&repo=${intent.target.repo}`,
        mutating: false,
        locked: false,
        message: 'Read-only preview route only.',
      },
      {
        id: `${intent.id}-commit-locked`,
        label: 'Future commit execution',
        commandPreview: 'git add <reviewed-files> && git commit -m <message>',
        apiPreview: null,
        mutating: true,
        locked: true,
        message: 'Staging and commit execution are locked in this cycle.',
      },
    ]
  }

  if (intent.kind === 'investigate-failed-ci') {
    return [
      ...base,
      {
        id: `${intent.id}-workflow-rerun-locked`,
        label: 'Future workflow rerun',
        commandPreview: null,
        apiPreview: `POST /repos/${intent.target.repositoryKey}/actions/runs/<run_id>/rerun`,
        mutating: true,
        locked: true,
        message: 'Workflow rerun is intentionally unavailable.',
      },
    ]
  }

  if (intent.kind === 'review-open-pr') {
    return [
      ...base,
      {
        id: `${intent.id}-pr-detail`,
        label: 'Inspect PR detail',
        commandPreview: null,
        apiPreview: `/api/github/repos/${intent.target.repositoryKey}/pulls/<number>/command-detail`,
        mutating: false,
        locked: false,
        message: 'PR detail is read-only.',
      },
      {
        id: `${intent.id}-pr-write-locked`,
        label: 'Future PR review execution',
        commandPreview: null,
        apiPreview: `POST /repos/${intent.target.repositoryKey}/pulls/<number>/reviews`,
        mutating: true,
        locked: true,
        message: 'PR reviews are locked. PR conversation comments require selected PR detail and typed confirmation.',
      },
    ]
  }

  if (intent.kind === 'review-open-issue') {
    return [
      ...base,
      {
        id: `${intent.id}-issue-detail`,
        label: 'Inspect issue detail',
        commandPreview: null,
        apiPreview: `/api/github/repos/${intent.target.repositoryKey}/issues/<number>/command-detail`,
        mutating: false,
        locked: false,
        message: 'Issue detail is read-only.',
      },
      {
        id: `${intent.id}-issue-write-locked`,
        label: 'Future issue update execution',
        commandPreview: null,
        apiPreview: `future locked: edit issue ${intent.target.repositoryKey}#<number>`,
        mutating: true,
        locked: true,
        message: 'Issue edits, labels, assignees, close, and reopen are locked. Comments require selected issue detail and typed confirmation.',
      },
    ]
  }

  if (intent.kind === 'prepare-deployment-readiness') {
    return [
      ...base,
      {
        id: `${intent.id}-deploy-locked`,
        label: 'Future deploy execution',
        commandPreview: null,
        apiPreview: 'POST /api/deployments/<provider>',
        mutating: true,
        locked: true,
        message: 'Deployment execution is locked in this cycle.',
      },
    ]
  }

  return base
}

/* Execution safety gate */ export function evaluateAtlasActionExecutionGate(intent: AtlasActionIntent): AtlasActionExecutionGate {
  return {
    id: `${intent.id}-execution-gate`,
    locked: true,
    status: 'locked',
    summary: 'Action execution is locked. Atlas is planner-only for Git, GitHub, workflows, and deployment in this cycle.',
    requiredPermissions: requiredPermissions(intent),
    blockers: [
      'writeControlsEnabled is false',
      'No GitHub, local Git, workflow, deployment, or destructive execution route is exposed for this action.',
    ],
  }
}

/* Dry-run boundary */ export function createAtlasActionDryRunPlan(
  intent: AtlasActionIntent,
  now = new Date(),
): AtlasActionDryRunPlan {
  const executionGate = evaluateAtlasActionExecutionGate(intent)

  return {
    id: `dry-run-${intent.id}`,
    intentId: intent.id,
    generatedAt: now.toISOString(),
    status: 'locked',
    summary: `${intent.title} is available as a dry-run plan only.`,
    target: intent.target,
    risk: intent.risk,
    requiredPermissions: executionGate.requiredPermissions,
    blockers: executionGate.blockers,
    warnings: intent.status === 'blocked' ? [intent.reason] : [],
    steps: dryRunSteps(intent),
    executionGate,
    writeControlsEnabled: false,
  }
}

export function deriveAtlasProjectActionRollup({
  projectRecord,
  intents,
}: {
  projectRecord: ProjectRecord
  intents: AtlasActionIntent[]
}): AtlasProjectActionRollup {
  const projectIntents = intents.filter((intent) => intent.target.projectId === projectRecord.project.id)
  const highestRisk = projectIntents.reduce<AtlasActionIntentRisk | 'none'>((current, intent) => {
    if (current === 'none') {
      return intent.risk
    }

    return riskRank[intent.risk] < riskRank[current] ? intent.risk : current
  }, 'none')
  const reposWithDirtyChanges = new Set(
    projectIntents
      .filter((intent) => intent.kind === 'review-dirty-local-changes')
      .map((intent) => intent.target.repositoryKey.toLowerCase()),
  )

  return {
    projectId: projectRecord.project.id,
    projectName: projectRecord.project.name,
    totalIntents: projectIntents.length,
    highestRisk,
    dirtyLocalRepoCount: reposWithDirtyChanges.size,
    failedOrStaleCiCount: projectIntents.filter((intent) =>
      ['investigate-failed-ci', 'review-stale-ci'].includes(intent.kind),
    ).length,
    openPullRequestIssueCount: projectIntents.filter((intent) =>
      ['review-open-pr', 'review-open-issue'].includes(intent.kind),
    ).length,
    topRecommendedActions: sortIntents(projectIntents).slice(0, 5),
  }
}

export function countAtlasActionGroups(intents: AtlasActionIntent[]) {
  return intents.reduce<Record<AtlasActionPlannerGroup, number>>(
    (counts, intent) => {
      counts[intent.group] += 1
      return counts
    },
    {
      'ci-check-failures': 0,
      'dirty-local-changes': 0,
      'missing-local-clone': 0,
      'needs-review': 0,
      'open-prs-issues': 0,
      'permission-data-gaps': 0,
      'stale-evidence': 0,
    },
  )
}
