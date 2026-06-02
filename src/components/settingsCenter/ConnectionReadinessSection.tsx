import { useSettingsCenterContext } from './useSettingsCenterContext'
import { ShieldCheck, RefreshCw, LogOut, LogIn } from 'lucide-react'
import { ConnectionCard } from '../SettingsCenterParts'

export function ConnectionReadinessSection() {
  const {
    connectionCards,
    githubStatus,
    handleGithubLogin,
    handleGithubLogout,
    handleRefreshConnectionStatuses,
    loadingGithub,
    loadingHostConnection,
    loadingHostedSync,
    loadingVercel,
    loadingWritingProvider,
    vercelStatus,
  } = useSettingsCenterContext()

  return (
      <section className="settings-panel">
        <div className="panel-heading settings-panel-heading-row">
          <div>
            <ShieldCheck size={17} />
            <h2>Connection Readiness</h2>
          </div>
          <button
            type="button"
            onClick={() => void handleRefreshConnectionStatuses()}
            disabled={
              loadingGithub ||
              loadingHostedSync ||
              loadingWritingProvider ||
              loadingHostConnection ||
              loadingVercel
            }
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
        <div className="settings-connection-grid">
          {connectionCards.map((card) => (
            <ConnectionCard key={card.id} card={card} />
          ))}
        </div>
        <div className="settings-calibration-readiness" aria-label="GitHub App auth checkpoint">
          <div className="settings-subpanel-heading">
            <ShieldCheck size={16} />
            <strong>GitHub App Auth Checkpoint</strong>
            <span>{githubStatus?.message ?? 'GitHub status has not loaded yet.'}</span>
          </div>
          <div className="settings-preview-grid">
            <div className="settings-snapshot-summary">
              <strong>{githubStatus?.githubAppConfigured ? 'Configured' : 'Missing config'}</strong>
              <span>App slug: {githubStatus?.appSlug || 'not set'}</span>
              <span>
                Missing:{' '}
                {githubStatus?.missingConfig.length
                  ? githubStatus.missingConfig.join(', ')
                  : 'none'}
              </span>
            </div>
            <div className="settings-snapshot-summary">
              <strong>{githubStatus?.authenticated ? 'Signed in' : 'Signed out'}</strong>
              <span>User: {githubStatus?.user?.login ?? 'none'}</span>
              <span>Token expires: {githubStatus?.tokenExpiresAt ?? 'not active'}</span>
            </div>
            <div className="settings-snapshot-summary">
              <strong>{githubStatus?.repoCount ?? 0}</strong>
              <span>Installed repos visible</span>
              <span>{githubStatus?.installCount ?? 0} installation(s)</span>
            </div>
          </div>
          <div className="dispatch-preflight-actions">
            {githubStatus?.authenticated ? (
              <button
                type="button"
                onClick={() => void handleGithubLogout()}
                disabled={loadingGithub}
              >
                <LogOut size={15} />
                Sign out
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGithubLogin}
                disabled={loadingGithub || !githubStatus?.githubAppConfigured}
              >
                <LogIn size={15} />
                Sign in with GitHub
              </button>
            )}
            <span>
              Future repository, workflow, deployment, commit, push, pull, and destructive
              controls are locked: {String(githubStatus?.writeControlsEnabled ?? false)}.
            </span>
            <span>
              Issue/comment pilot enabled: {String(githubStatus?.issueCommentPilotEnabled ?? false)}.
            </span>
          </div>
          <div className="resource-meta">
            {(githubStatus?.permissionPlan ?? []).map((permission) => (
              <span key={permission.key}>
                {permission.label}: {permission.access}
              </span>
            ))}
          </div>
        </div>
        <div className="settings-calibration-readiness" aria-label="Vercel deployment checkpoint">
          <div className="settings-subpanel-heading">
            <ShieldCheck size={16} />
            <strong>Vercel Deployment Checkpoint</strong>
            <span>{vercelStatus?.message ?? 'Vercel status has not loaded yet.'}</span>
          </div>
          <div className="settings-preview-grid">
            <div className="settings-snapshot-summary">
              <strong>{vercelStatus?.configured ? 'Configured' : 'Missing config'}</strong>
              <span>Token configured: {String(vercelStatus?.tokenConfigured ?? false)}</span>
              <span>
                Missing:{' '}
                {vercelStatus?.missingConfig.length
                  ? vercelStatus.missingConfig.join(', ')
                  : 'none'}
              </span>
            </div>
            <div className="settings-snapshot-summary">
              <strong>{vercelStatus?.mappedTargetCount ?? 0}</strong>
              <span>Mapped Dispatch targets</span>
              <span>
                Team scope:{' '}
                {vercelStatus?.teamScope.teamIdConfigured ||
                vercelStatus?.teamScope.teamSlugConfigured
                  ? 'configured'
                  : 'personal/default'}
              </span>
            </div>
            <div className="settings-snapshot-summary">
              <strong>Read only</strong>
              <span>writeControlsEnabled: {String(vercelStatus?.writeControlsEnabled ?? false)}</span>
              <span>Deploy/promote/rollback/env/domain controls locked</span>
            </div>
          </div>
          {vercelStatus?.mappedTargets.length ? (
            <div className="resource-meta">
              {vercelStatus.mappedTargets.map((entry) => (
                <span key={entry.targetId}>
                  {entry.targetId}: {entry.projectIdOrName}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </section>
  )
}
