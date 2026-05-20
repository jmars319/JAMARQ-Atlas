import { AlertTriangle, FileDiff, GitBranch, Lock } from 'lucide-react'
import { useLocalGitPreview } from '../hooks/useLocalGitPreview'

interface LocalGitPreviewPanelProps {
  owner: string
  repo: string
}

function countLabel(value: number | null, suffix: string) {
  return value === null ? `binary/unknown ${suffix}` : `${value} ${suffix}`
}

export function LocalGitPreviewPanel({ owner, repo }: LocalGitPreviewPanelProps) {
  const preview = useLocalGitPreview(owner, repo)
  const data = preview.response?.data ?? null

  return (
    <section className="local-git-preview-panel" aria-label="Local Git preview">
      <div className="resource-panel-header">
        <div>
          <strong>Local Git Preview</strong>
          <span>{preview.loading ? 'Loading read-only diff preview...' : 'Read-only local diff and commit dry run'}</span>
        </div>
        <span className="resource-pill">planner-only</span>
      </div>

      {preview.error && !data ? (
        <div className="github-error">
          <AlertTriangle size={16} />
          <div>
            <strong>{preview.response?.status ?? 'unavailable'}</strong>
            <span>{preview.error}</span>
          </div>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="github-health-grid is-compact">
            <div>
              <GitBranch size={16} />
              <strong>{data.status.branch}</strong>
              <span>{data.status.upstream ?? 'No upstream'}</span>
            </div>
            <div>
              <FileDiff size={16} />
              <strong>{data.changedFiles.length}</strong>
              <span>Changed files</span>
            </div>
            <div>
              <FileDiff size={16} />
              <strong>
                {countLabel(data.additions, 'additions')} / {countLabel(data.deletions, 'deletions')}
              </strong>
              <span>Diff stats</span>
            </div>
            <div>
              <Lock size={16} />
              <strong>{data.dryRunCommit.blocked ? 'locked' : 'available'}</strong>
              <span>Commit execution</span>
            </div>
          </div>

          {data.changedFiles.length > 0 ? (
            <ol className="local-git-file-list">
              {data.changedFiles.slice(0, 12).map((change) => (
                <li key={`${change.path}-${change.indexStatus}-${change.worktreeStatus}`}>
                  <span>{change.change}</span>
                  <strong>{change.path}</strong>
                  <small>
                    {[
                      change.previousPath ? `from ${change.previousPath}` : '',
                      change.staged ? 'staged' : '',
                      change.unstaged ? 'unstaged' : '',
                      change.untracked ? 'untracked' : '',
                      change.additions === null ? '' : `+${change.additions}`,
                      change.deletions === null ? '' : `-${change.deletions}`,
                    ]
                      .filter(Boolean)
                      .join(' / ')}
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty-state">Working tree is clean for the matched local clone.</p>
          )}

          <div className="action-dry-run">
            <div>
              <Lock size={15} />
              <strong>{data.dryRunCommit.subjectSuggestion}</strong>
              <span>{data.dryRunCommit.blockers.join(' ')}</span>
            </div>
            <ol>
              {data.dryRunCommit.commandPreview.map((command) => (
                <li key={command}>
                  <span>{command.startsWith('future locked') ? 'locked' : 'read-only'}</span>
                  <strong>{command}</strong>
                </li>
              ))}
            </ol>
          </div>
        </>
      ) : !preview.loading && !preview.error ? (
        <p className="empty-state">Local Git preview is not loaded for this repository.</p>
      ) : null}
    </section>
  )
}
