import { useState } from 'react'
import {
  Bot,
  DatabaseZap,
  GitBranch,
  HardDrive,
  Rocket,
  Server,
  ShieldCheck,
  UploadCloud,
} from 'lucide-react'
import type { CalibrationCredentialReference } from '../domain/calibration'
import type { DeploymentTarget } from '../domain/dispatch'
import type { AtlasConnectionCard } from '../domain/settings'
import type { AtlasSyncProviderState } from '../domain/sync'
import {
  canStoreCalibrationValue,
  calibrationValueToTargetUpdate,
  validateCalibrationDataQuality,
  type CalibrationEditableTargetField,
  type CalibrationImportPreview,
  type CalibrationIssue,
} from '../services/calibration'
import type { HostConnectionStatusResponse } from '../services/hostConnection'
import type { HostedSyncStatus } from '../services/hostedSync'
import type { WritingProviderStatusResponse } from '../services/writingProvider'

export interface GithubStatusResponse {
  configured: boolean
  configuredRepos: string[]
  authMode: string
}

const connectionIcons = {
  github: GitBranch,
  dispatch: Rocket,
  writing: Bot,
  data: DatabaseZap,
  sync: HardDrive,
  supabase: UploadCloud,
  host: Server,
}

export function statusLabel(status: AtlasConnectionCard['status']) {
  const labels: Record<AtlasConnectionCard['status'], string> = {
    available: 'Available',
    missing: 'Missing',
    stub: 'Stubbed',
    'local-only': 'Local only',
    unknown: 'Unknown',
  }

  return labels[status]
}

export function buildGithubCard(status: GithubStatusResponse | null, error: string | null) {
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

export function buildHostedSyncCard(
  status: HostedSyncStatus | null,
  error: string | null,
  provider: AtlasSyncProviderState,
) {
  if (error || provider.status === 'error') {
    return {
      id: 'supabase',
      title: 'Supabase Hosted Sync',
      status: 'unknown',
      summary: 'Hosted sync status could not be read.',
      detail: error || provider.message,
      updatedAt: provider.updatedAt,
    } satisfies AtlasConnectionCard
  }

  if (!status?.configured && provider.status !== 'configured') {
    return {
      id: 'supabase',
      title: 'Supabase Hosted Sync',
      status: 'missing',
      summary: 'Supabase hosted sync is not configured.',
      detail:
        'Atlas stays local-first. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ATLAS_SYNC_WORKSPACE_ID locally to enable manual remote snapshots.',
      updatedAt: provider.updatedAt,
    } satisfies AtlasConnectionCard
  }

  return {
    id: 'supabase',
    title: 'Supabase Hosted Sync',
    status: 'available',
    summary: 'Manual Supabase snapshot push and pull are configured.',
    detail: `Workspace ${status?.workspaceId || provider.workspaceId || 'configured'} is available. No background sync or merge is enabled.`,
    updatedAt: provider.updatedAt,
  } satisfies AtlasConnectionCard
}

export function buildHostConnectionCard(
  status: HostConnectionStatusResponse | null,
  error: string | null,
) {
  if (error) {
    return {
      id: 'host',
      title: 'Read-Only Host Boundary',
      status: 'unknown',
      summary: 'Host boundary status could not be read.',
      detail: error,
    } satisfies AtlasConnectionCard
  }

  if (!status?.configured) {
    return {
      id: 'host',
      title: 'Read-Only Host Boundary',
      status: 'missing',
      summary: 'No host preflight config is configured.',
      detail:
        'Set ATLAS_HOST_PREFLIGHT_CONFIG locally to enable read-only host reachability and path evidence. No credentials are stored in browser state.',
    } satisfies AtlasConnectionCard
  }

  return {
    id: 'host',
    title: 'Read-Only Host Boundary',
    status: 'available',
    summary: 'Read-only host preflight config is available.',
    detail: `${status.data?.configuredTargets.length ?? 0} targets configured; ${
      status.data?.sftpEnabledCount ?? 0
    } SFTP read-only. Atlas stores credential reference labels only.`,
  } satisfies AtlasConnectionCard
}

export function buildWritingProviderCard(
  status: WritingProviderStatusResponse | null,
  error: string | null,
) {
  if (error) {
    return {
      id: 'writing',
      title: 'Writing Provider',
      status: 'unknown',
      summary: 'Writing provider status could not be read.',
      detail: error,
    } satisfies AtlasConnectionCard
  }

  if (!status?.configured) {
    return {
      id: 'writing',
      title: 'Writing Provider',
      status: 'missing',
      summary: 'No OpenAI API key is configured.',
      detail:
        'Writing still creates local draft packets. Set OPENAI_API_KEY locally to generate provider suggestions for human review.',
    } satisfies AtlasConnectionCard
  }

  return {
    id: 'writing',
    title: 'Writing Provider',
    status: 'available',
    summary: 'OpenAI draft-only provider is configured.',
    detail: `Suggestions use ${status.model}. Generated text is stored as a suggestion until explicitly applied.`,
  } satisfies AtlasConnectionCard
}

export function ConnectionCard({ card }: { card: AtlasConnectionCard }) {
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

export function SnapshotSummary({
  title,
  projects,
  targets,
  drafts,
  planningRecords,
  reportPackets,
  reviewSessions,
  calibrationProgress,
}: {
  title: string
  projects: number
  targets: number
  drafts: number
  planningRecords: number
  reportPackets: number
  reviewSessions: number
  calibrationProgress: number
}) {
  return (
    <div className="settings-snapshot-summary">
      <strong>{title}</strong>
      <span>{projects} projects</span>
      <span>{targets} Dispatch targets</span>
      <span>{drafts} Writing drafts</span>
      <span>{planningRecords} Planning records</span>
      <span>{reportPackets} Report packets</span>
      <span>{reviewSessions} Review sessions</span>
      <span>{calibrationProgress} Calibration progress</span>
    </div>
  )
}

export function issueCountLabel(count: number) {
  return count === 1 ? '1 unresolved item' : `${count} unresolved items`
}

export function CalibrationField({
  issue,
  credentialReferences,
  onTargetChange,
  onRejectValue,
}: {
  issue: CalibrationIssue
  credentialReferences: CalibrationCredentialReference[]
  onTargetChange: (targetId: string, update: Partial<DeploymentTarget>) => void
  onRejectValue: (message: string) => void
}) {
  const [draftValue, setDraftValue] = useState(issue.value)

  if (!issue.editable || !issue.targetId) {
    return (
      <div className="settings-calibration-value">
        <span>{issue.value || 'Needs real value'}</span>
      </div>
    )
  }

  const qualityMessages = validateCalibrationDataQuality(issue.field, draftValue)

  function commitValue() {
    if (!issue.targetId) {
      return
    }

    const blockedMessage = qualityMessages.find((message) => message.level === 'blocked')
    const storageCheck = canStoreCalibrationValue(draftValue)

    if (blockedMessage || !storageCheck.ok) {
      onRejectValue(blockedMessage?.message ?? storageCheck.message)
      return
    }

    onTargetChange(
      issue.targetId,
      calibrationValueToTargetUpdate(issue.field as CalibrationEditableTargetField, draftValue),
    )
  }

  return (
    <div className="settings-calibration-field">
      {issue.field === 'credentialRef' && credentialReferences.length > 0 ? (
        <label className="field field-full">
          <span>Registry label</span>
          <select
            aria-label={`Credential reference for ${issue.projectName}`}
            value={
              credentialReferences.some((reference) => reference.label === draftValue)
                ? draftValue
                : ''
            }
            onChange={(event) => setDraftValue(event.target.value)}
          >
            <option value="">Choose a registered label</option>
            {credentialReferences.map((reference) => (
              <option key={reference.id} value={reference.label}>
                {reference.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="field field-full">
        <span>{issue.label}</span>
        {issue.field === 'healthCheckUrls' ? (
          <textarea
            value={draftValue}
            rows={3}
            onChange={(event) => setDraftValue(event.target.value)}
          />
        ) : (
          <input value={draftValue} onChange={(event) => setDraftValue(event.target.value)} />
        )}
      </label>
      {qualityMessages.length > 0 ? (
        <div className="settings-quality-list">
          {qualityMessages.map((message, index) => (
            <span key={`${message.field}-${message.message}-${index}`} className={message.level}>
              {message.level === 'blocked' ? 'Blocked' : 'Warning'}: {message.message}
            </span>
          ))}
        </div>
      ) : null}
      <button type="button" onClick={commitValue}>
        Apply field value
      </button>
    </div>
  )
}

export function CalibrationImportPreviewPanel({
  preview,
  onApply,
}: {
  preview: CalibrationImportPreview
  onApply: () => void
}) {
  return (
    <div className="settings-import-preview" aria-label="Calibration import preview">
      <div className="settings-preview-grid">
        <div className="settings-snapshot-summary">
          <strong>Accepted rows</strong>
          <span>{preview.acceptedRows.length} ready to apply</span>
          <span>
            {preview.acceptedRows.filter((row) => row.warnings.length > 0).length} with advisory
            warnings
          </span>
        </div>
        <div className="settings-snapshot-summary">
          <strong>Rejected rows</strong>
          <span>{preview.rejectedRows.length} blocked</span>
          <span>Secret-shaped failures are never applied</span>
        </div>
      </div>
      {preview.kindSummaries.length > 0 ? (
        <div className="settings-preview-grid" aria-label="Calibration import kind counts">
          {preview.kindSummaries.map((summary) => (
            <div key={summary.kind} className="settings-snapshot-summary">
              <strong>{summary.kind}</strong>
              <span>{summary.accepted} accepted</span>
              <span>{summary.rejected} rejected</span>
              <span>{summary.warnings} warning(s)</span>
            </div>
          ))}
        </div>
      ) : null}
      {preview.acceptedRows.slice(0, 6).map((row) => (
        <article key={`accepted-${row.index}`} className="settings-import-row">
          <strong>
            Row {row.index}: {row.kind}
          </strong>
          {row.changeDetails.length > 0 ? (
            <dl className="settings-import-diff">
              {row.changeDetails.map((change) => (
                <div key={`${change.field}-${change.after}`}>
                  <dt>{change.field}</dt>
                  <dd>
                    <span>Before: {change.before || '(empty)'}</span>
                    <span>After: {change.after || '(empty)'}</span>
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            row.changes.map((change) => <span key={change}>{change}</span>)
          )}
          {row.warnings.map((warning, index) => (
            <span key={`${warning.field}-${index}`} className="warning">
              Warning: {warning.message}
            </span>
          ))}
        </article>
      ))}
      {preview.rejectedRows.slice(0, 6).map((row) => (
        <article key={`rejected-${row.index}`} className="settings-import-row rejected">
          <strong>
            Row {row.index}: {row.kind || 'unknown'}
          </strong>
          {row.errors.map((error, index) => (
            <span key={`${row.index}-${index}-${error}`}>Rejected: {error}</span>
          ))}
        </article>
      ))}
      {preview.warnings.length > 0 ? (
        <div className="data-warning">
          <strong>Import warnings</strong>
          <ul>
            {preview.warnings.map((warning, index) => (
              <li key={`${index}-${warning}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <button type="button" disabled={preview.acceptedRows.length === 0} onClick={onApply}>
        Apply accepted import rows
      </button>
    </div>
  )
}
