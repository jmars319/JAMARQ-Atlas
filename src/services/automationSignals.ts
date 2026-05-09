import type { AtlasProject } from '../domain/atlas'
import type {
  AutomationSignal,
  GithubApiError,
  GithubCommit,
  GithubPullRequest,
  GithubWorkflowRun,
} from './githubIntegration'

function daysBetween(date: string, now = new Date()) {
  const parsed = new Date(date)

  if (Number.isNaN(parsed.getTime())) {
    return 0
  }

  return Math.floor((now.getTime() - parsed.getTime()) / 86_400_000)
}

export function buildManualSignals(project: AtlasProject): AutomationSignal[] {
  const signals: AutomationSignal[] = []

  if (project.manual.blockers.length > 0) {
    signals.push({
      id: `${project.id}-manual-blockers`,
      tone: 'warning',
      title: 'Manual blockers present',
      detail: `${project.manual.blockers.length} blocker item${
        project.manual.blockers.length === 1 ? '' : 's'
      } recorded by the operator.`,
      source: 'manual',
    })
  }

  if (project.manual.lastVerified && daysBetween(project.manual.lastVerified) >= 30) {
    signals.push({
      id: `${project.id}-verification-age`,
      tone: 'info',
      title: 'Verification is aging',
      detail: `Last verified ${daysBetween(project.manual.lastVerified)} days ago.`,
      source: 'manual',
    })
  }

  return signals
}

export function buildGithubSignals({
  project,
  commits,
  pulls,
  workflowRuns,
  errors,
}: {
  project: AtlasProject
  commits?: GithubCommit[] | null
  pulls?: GithubPullRequest[] | null
  workflowRuns?: GithubWorkflowRun[] | null
  errors?: GithubApiError[]
}): AutomationSignal[] {
  const signals: AutomationSignal[] = []
  const lastVerified = project.manual.lastVerified
    ? new Date(`${project.manual.lastVerified}T00:00:00`)
    : null

  if (lastVerified && commits?.some((commit) => commit.date && new Date(commit.date) > lastVerified)) {
    signals.push({
      id: `${project.id}-commits-after-verification`,
      tone: 'info',
      title: 'Commits since verification',
      detail: 'Recent commits are newer than the last manual verification date.',
      source: 'github',
    })
  }

  const latestRun = workflowRuns?.[0]

  if (latestRun?.conclusion === 'failure' || latestRun?.conclusion === 'cancelled') {
    signals.push({
      id: `${project.id}-latest-workflow-${latestRun.id}`,
      tone: 'danger',
      title: 'Latest workflow needs attention',
      detail: `${latestRun.name ?? 'Workflow'} ended with ${latestRun.conclusion}.`,
      source: 'github',
    })
  }

  const stalePulls =
    pulls?.filter((pull) => pull.state === 'open' && daysBetween(pull.updatedAt) >= 14) ?? []

  if (stalePulls.length > 0) {
    signals.push({
      id: `${project.id}-stale-prs`,
      tone: 'warning',
      title: 'Open PRs are aging',
      detail: `${stalePulls.length} open pull request${
        stalePulls.length === 1 ? '' : 's'
      } older than 14 days.`,
      source: 'github',
    })
  }

  errors?.forEach((error) => {
    signals.push({
      id: `${project.id}-${error.resource}-${error.type}`,
      tone: error.type === 'missing-token' ? 'muted' : 'warning',
      title: 'GitHub data gap',
      detail: error.message,
      source: 'github',
    })
  })

  return signals
}
