import {
  AlertTriangle,
  ClipboardList,
  GitBranch,
  Lock,
  RefreshCw,
  ShieldAlert,
  SquareArrowOutUpRight,
} from 'lucide-react'
import {
  countAtlasActionGroups,
  createAtlasActionDryRunPlan,
  type AtlasActionIntent,
  type AtlasActionPlannerGroup,
} from '../services/actionPlanner'
import type { GithubApiError } from '../services/githubIntegration'

interface ActionPlannerPanelProps {
  intents: AtlasActionIntent[]
  loading?: boolean
  error?: GithubApiError | null
  title?: string
  detail?: string
  compact?: boolean
  maxItems?: number
  onRefresh?: () => void
}

const groupLabels: Record<AtlasActionPlannerGroup, string> = {
  'ci-check-failures': 'CI/check failures',
  'dirty-local-changes': 'Dirty local changes',
  'missing-local-clone': 'Missing local clone',
  'needs-review': 'Needs review',
  'open-prs-issues': 'Open PRs/issues',
  'permission-data-gaps': 'Permission/data gaps',
  'stale-evidence': 'Stale evidence',
}

function riskChip(intent: AtlasActionIntent) {
  if (intent.risk === 'high') {
    return 'review-chip-high'
  }

  if (intent.risk === 'medium') {
    return 'review-chip-medium'
  }

  return 'review-chip-low'
}

function groupEntries(intents: AtlasActionIntent[]) {
  const counts = countAtlasActionGroups(intents)

  return (Object.entries(counts) as Array<[AtlasActionPlannerGroup, number]>).filter(
    ([, count]) => count > 0,
  )
}

export function ActionPlannerPanel({
  intents,
  loading = false,
  error = null,
  title = 'Action Planner',
  detail = 'Derived Git/GitHub dry-run queue / planner-only',
  compact = false,
  maxItems,
  onRefresh,
}: ActionPlannerPanelProps) {
  const visibleIntents = typeof maxItems === 'number' ? intents.slice(0, maxItems) : intents

  return (
    <section className="action-planner-panel" aria-label={title}>
      <div className="resource-panel-header">
        <div>
          <strong>{title}</strong>
          <span>{loading ? 'Loading planner evidence...' : detail}</span>
        </div>
        {onRefresh ? (
          <button type="button" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={14} />
            Refresh
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="github-error">
          <AlertTriangle size={16} />
          <div>
            <strong>{error.type}</strong>
            <span>{error.message}</span>
          </div>
        </div>
      ) : null}

      <div className="action-planner-bands" aria-label="Action planner bands">
        {groupEntries(intents).map(([group, count]) => (
          <div key={group}>
            <ShieldAlert size={15} />
            <strong>{count}</strong>
            <span>{groupLabels[group]}</span>
          </div>
        ))}
        {intents.length === 0 ? (
          <div>
            <ClipboardList size={15} />
            <strong>0</strong>
            <span>No planner actions</span>
          </div>
        ) : null}
      </div>

      {visibleIntents.length === 0 ? (
        <p className="empty-state">
          No Git/GitHub action intents are derived from the currently loaded evidence.
        </p>
      ) : (
        <ol className={compact ? 'action-intent-list is-compact' : 'action-intent-list'}>
          {visibleIntents.map((intent) => {
            const plan = createAtlasActionDryRunPlan(intent)

            return (
              <li key={intent.id} className={`action-intent-card action-risk-${intent.risk}`}>
                <div className="action-intent-heading">
                  <div>
                    <div className="review-chip-row">
                      <span className={`review-chip ${riskChip(intent)}`}>{intent.risk}</span>
                      <span className="review-chip">{groupLabels[intent.group]}</span>
                      <span className="review-chip review-chip-muted">
                        <Lock size={12} />
                        locked
                      </span>
                    </div>
                    <strong>{intent.title}</strong>
                    <p>{intent.detail}</p>
                  </div>
                  {intent.target.repositoryUrl ? (
                    <a href={intent.target.repositoryUrl} target="_blank" rel="noreferrer">
                      <SquareArrowOutUpRight size={14} />
                      GitHub
                    </a>
                  ) : null}
                </div>

                <p className="review-reason">{intent.reason}</p>

                <div className="activity-meta">
                  {intent.target.projectName ? <span>{intent.target.projectName}</span> : null}
                  <span>{intent.target.repositoryKey}</span>
                  <span>{intent.source}</span>
                  <span>writeControlsEnabled: false</span>
                </div>

                <div className="action-evidence-grid">
                  {intent.evidence.slice(0, compact ? 3 : 6).map((item, index) => (
                    <div key={`${intent.id}-${item.label}-${index}`}>
                      <span>{item.label}</span>
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer">
                          {item.value}
                        </a>
                      ) : (
                        <strong>{item.value}</strong>
                      )}
                    </div>
                  ))}
                </div>

                <div className="action-dry-run">
                  <div>
                    <GitBranch size={15} />
                    <strong>{plan.status}</strong>
                    <span>{plan.executionGate.summary}</span>
                  </div>
                  <ol>
                    {plan.steps.slice(0, compact ? 2 : 4).map((step) => (
                      <li key={step.id}>
                        <span>{step.locked ? 'locked' : step.mutating ? 'future' : 'read-only'}</span>
                        <strong>{step.label}</strong>
                        <small>
                          {step.commandPreview ?? step.apiPreview ?? step.message}
                        </small>
                      </li>
                    ))}
                  </ol>
                  <div className="resource-meta">
                    {plan.requiredPermissions.slice(0, 4).map((permission) => (
                      <span key={`${plan.id}-${permission}`}>{permission}</span>
                    ))}
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
