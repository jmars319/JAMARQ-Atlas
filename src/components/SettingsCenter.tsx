import { useEffect, useMemo, useState } from 'react'
import {
  Bot,
  DatabaseZap,
  GitBranch,
  HardDrive,
  RefreshCw,
  Rocket,
  Settings2,
  ShieldCheck,
} from 'lucide-react'
import type { AtlasConnectionCard, AtlasSettingsState } from '../domain/settings'
import { buildStaticConnectionCards } from '../services/settings'

interface GithubStatusResponse {
  configured: boolean
  configuredRepos: string[]
  authMode: string
}

interface SettingsCenterProps {
  settings: AtlasSettingsState
  onSettingsChange: (
    update: Partial<Pick<AtlasSettingsState, 'deviceLabel' | 'operatorLabel' | 'notes'>>,
  ) => void
}

const connectionIcons = {
  github: GitBranch,
  dispatch: Rocket,
  writing: Bot,
  data: DatabaseZap,
  sync: HardDrive,
}

function statusLabel(status: AtlasConnectionCard['status']) {
  const labels: Record<AtlasConnectionCard['status'], string> = {
    available: 'Available',
    missing: 'Missing',
    stub: 'Stubbed',
    'local-only': 'Local only',
    unknown: 'Unknown',
  }

  return labels[status]
}

function buildGithubCard(status: GithubStatusResponse | null, error: string | null) {
  if (error) {
    return {
      id: 'github',
      title: 'GitHub Local API',
      status: 'unknown',
      summary: 'GitHub status could not be read.',
      detail: error,
    } satisfies AtlasConnectionCard
  }

  if (!status?.configured) {
    return {
      id: 'github',
      title: 'GitHub Local API',
      status: 'missing',
      summary: 'No GitHub token is configured.',
      detail:
        'Atlas still runs normally. Set GITHUB_TOKEN or GH_TOKEN in local environment when live read-only GitHub panels are needed.',
    } satisfies AtlasConnectionCard
  }

  return {
    id: 'github',
    title: 'GitHub Local API',
    status: 'available',
    summary: 'Read-only GitHub boundary is configured.',
    detail: `${status.configuredRepos.length} configured repos through ${status.authMode}. Tokens remain server-side.`,
  } satisfies AtlasConnectionCard
}

function ConnectionCard({ card }: { card: AtlasConnectionCard }) {
  const Icon = connectionIcons[card.id as keyof typeof connectionIcons] ?? ShieldCheck

  return (
    <article className="settings-connection-card">
      <div className="settings-card-icon">
        <Icon size={18} />
      </div>
      <div>
        <div className="settings-card-heading">
          <h3>{card.title}</h3>
          <span className={`resource-pill settings-status-${card.status}`}>
            {statusLabel(card.status)}
          </span>
        </div>
        <p>{card.summary}</p>
        <span>{card.detail}</span>
      </div>
    </article>
  )
}

async function requestGithubStatus(signal?: AbortSignal) {
  const response = await fetch('/api/github/status', { signal })

  if (!response.ok) {
    throw new Error(`GitHub status returned ${response.status}.`)
  }

  return (await response.json()) as GithubStatusResponse
}

export function SettingsCenter({ settings, onSettingsChange }: SettingsCenterProps) {
  const [githubStatus, setGithubStatus] = useState<GithubStatusResponse | null>(null)
  const [githubError, setGithubError] = useState<string | null>(null)
  const [loadingGithub, setLoadingGithub] = useState(false)

  async function loadGithubStatus() {
    setLoadingGithub(true)
    setGithubError(null)

    try {
      setGithubStatus(await requestGithubStatus())
    } catch (error) {
      setGithubError(error instanceof Error ? error.message : 'GitHub status request failed.')
      setGithubStatus(null)
    } finally {
      setLoadingGithub(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()

    void requestGithubStatus(controller.signal)
      .then((status) => {
        setGithubStatus(status)
        setGithubError(null)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return
        }

        setGithubError(error instanceof Error ? error.message : 'GitHub status request failed.')
        setGithubStatus(null)
      })

    return () => controller.abort()
  }, [])

  const connectionCards = useMemo(
    () => [buildGithubCard(githubStatus, githubError), ...buildStaticConnectionCards()],
    [githubError, githubStatus],
  )

  return (
    <section className="settings-center" aria-labelledby="settings-title">
      <div className="dashboard-header">
        <div>
          <p className="section-label">Atlas Settings</p>
          <h1 id="settings-title">Settings & Connections</h1>
          <p>
            Configure local Atlas labels and review integration readiness without storing secrets
            in browser state.
          </p>
        </div>
        <div className="dashboard-stats" aria-label="Settings status counts">
          <div>
            <Settings2 size={16} />
            <strong>{settings.schemaVersion}</strong>
            <span>Schema</span>
          </div>
          <div>
            <ShieldCheck size={16} />
            <strong>{connectionCards.filter((card) => card.status === 'available').length}</strong>
            <span>Available</span>
          </div>
          <div>
            <HardDrive size={16} />
            <strong>Local</strong>
            <span>Mode</span>
          </div>
        </div>
      </div>

      <div className="settings-layout">
        <section className="settings-panel">
          <div className="panel-heading">
            <Settings2 size={17} />
            <h2>Local Workspace Identity</h2>
          </div>
          <div className="settings-form-grid">
            <label className="field">
              <span>Device label</span>
              <input
                value={settings.deviceLabel}
                onChange={(event) => onSettingsChange({ deviceLabel: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Operator label</span>
              <input
                value={settings.operatorLabel}
                placeholder="Optional"
                onChange={(event) => onSettingsChange({ operatorLabel: event.target.value })}
              />
            </label>
            <label className="field field-full">
              <span>Local-only configuration notes</span>
              <textarea
                value={settings.notes}
                placeholder="Notes about this local Atlas install. Do not place secrets here."
                rows={4}
                onChange={(event) => onSettingsChange({ notes: event.target.value })}
              />
            </label>
          </div>
          <div className="settings-meta">
            <span>Device ID: {settings.deviceId}</span>
            <span>Updated: {new Date(settings.updatedAt).toLocaleString()}</span>
          </div>
        </section>

        <section className="settings-panel">
          <div className="panel-heading settings-panel-heading-row">
            <div>
              <ShieldCheck size={17} />
              <h2>Connection Readiness</h2>
            </div>
            <button type="button" onClick={() => void loadGithubStatus()} disabled={loadingGithub}>
              <RefreshCw size={15} />
              Refresh
            </button>
          </div>
          <div className="settings-connection-grid">
            {connectionCards.map((card) => (
              <ConnectionCard key={card.id} card={card} />
            ))}
          </div>
        </section>

        <section className="settings-panel settings-guardrails">
          <div className="panel-heading">
            <ShieldCheck size={17} />
            <h2>Settings Rules</h2>
          </div>
          <ul className="dispatch-list">
            <li>Settings store only local labels, notes, and connection-readiness metadata.</li>
            <li>GitHub tokens, AI keys, deployment credentials, and env vars stay out of browser state.</li>
            <li>Connection cards are status surfaces, not automation triggers.</li>
            <li>Hosted sync and real AI providers remain disabled until explicit future phases.</li>
          </ul>
        </section>
      </div>
    </section>
  )
}
