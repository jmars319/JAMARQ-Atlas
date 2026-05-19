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
import {
  canStoreCalibrationValue,
  calibrationValueToTargetUpdate,
  validateCalibrationDataQuality,
  type CalibrationEditableTargetField,
  type CalibrationImportPreview,
  type CalibrationIssue,
} from '../services/calibration'
import { statusLabel } from './SettingsCenterParts.helpers'

const connectionIcons = {
  github: GitBranch,
  dispatch: Rocket,
  writing: Bot,
  data: DatabaseZap,
  sync: HardDrive,
  supabase: UploadCloud,
  host: Server,
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
