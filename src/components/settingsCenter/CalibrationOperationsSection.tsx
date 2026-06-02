import { useSettingsCenterContext } from './useSettingsCenterContext'
import { ShieldCheck, ClipboardList, PlusCircle, Trash2, Download, UploadCloud } from 'lucide-react'
import { CalibrationImportPreviewPanel, CalibrationField } from '../SettingsCenterParts'
import { issueCountLabel } from '../SettingsCenterParts.helpers'
import { CALIBRATION_BULK_FIELDS, CALIBRATION_CATEGORIES, type CalibrationCategory, type CalibrationEditableTargetField } from '../../services/calibration'

export function CalibrationOperationsSection() {
  const {
    bulkCalibrationField,
    bulkCalibrationValue,
    calibration,
    calibrationCategoryCounts,
    calibrationFilter,
    calibrationImportError,
    calibrationImportPreview,
    calibrationIssues,
    calibrationMessage,
    calibrationNoteDrafts,
    calibrationProgressByIssue,
    calibrationReadinessReport,
    calibrationStatusCountsByGroup,
    calibrationSummary,
    calibrationWorkflow,
    credentialLabel,
    credentialNotes,
    credentialProjectIds,
    credentialProvider,
    credentialPurpose,
    credentialTargetIds,
    expandedCalibrationGroupIdSet,
    filteredCalibrationIssues,
    groupedCalibrationIssues,
    handleApplyBulkCalibration,
    handleApplyCalibrationImport,
    handleCalibrationImportFile,
    handleDownloadCalibrationCsv,
    handleDownloadCalibrationJson,
    handleProgressChange,
    handleSaveCredentialReference,
    matchingBulkIssues,
    onCalibrationAudit,
    onCalibrationProgressChange,
    onCredentialReferenceDelete,
    onDispatchTargetChange,
    setBulkCalibrationField,
    setBulkCalibrationValue,
    setCalibrationFilter,
    setCalibrationMessage,
    setCalibrationNoteDrafts,
    setCredentialLabel,
    setCredentialNotes,
    setCredentialProjectIds,
    setCredentialProvider,
    setCredentialPurpose,
    setCredentialTargetIds,
    toggleCalibrationGroup,
  } = useSettingsCenterContext()

  return (
      <section className="settings-panel" aria-label="Atlas calibration operations">
        <div className="panel-heading settings-panel-heading-row">
          <div>
            <ShieldCheck size={17} />
            <h2>Calibration Operations</h2>
          </div>
          <span className="resource-pill state-warning">
            {issueCountLabel(filteredCalibrationIssues.length)}
          </span>
        </div>
        <p className="empty-state">
          Replace sample or unconfirmed values with real non-secret operational values.
          Credentials stay outside Atlas; store only labels such as godaddy-mmh-production in
          notes when needed.
        </p>
        <div className="settings-calibration-summary" aria-label="Calibration progress summary">
          <div>
            <strong>{calibrationSummary.progressRecords}</strong>
            <span>Progress records</span>
          </div>
          <div>
            <strong>{calibrationSummary.entered}</strong>
            <span>Entered</span>
          </div>
          <div>
            <strong>{calibrationSummary.verified}</strong>
            <span>Verified</span>
          </div>
          <div>
            <strong>{calibrationSummary.deferred}</strong>
            <span>Deferred</span>
          </div>
          <div>
            <strong>{calibrationSummary.credentialReferences}</strong>
            <span>Credential refs</span>
          </div>
          <div>
            <strong>{calibrationSummary.auditEvents}</strong>
            <span>Audit events</span>
          </div>
        </div>
        <div className="settings-calibration-readiness" aria-label="Calibration readiness report">
          <div className="settings-subpanel-heading">
            <ClipboardList size={16} />
            <strong>Readiness report</strong>
            <span>Human-entered progress and import warnings only. This is not production verification.</span>
          </div>
          <div className="settings-preview-grid">
            <div className="settings-snapshot-summary">
              <strong>{calibrationReadinessReport.unresolved}</strong>
              <span>Unresolved calibration rows</span>
              <span>{calibrationReadinessReport.unregisteredCredentialRefs} unregistered credential refs</span>
            </div>
            <div className="settings-snapshot-summary">
              <strong>{calibrationReadinessReport.verified}</strong>
              <span>Verified progress records</span>
              <span>
                {calibrationReadinessReport.entered} entered / {calibrationReadinessReport.deferred} deferred
              </span>
            </div>
            <div className="settings-snapshot-summary">
              <strong>{calibrationReadinessReport.importWarnings}</strong>
              <span>Current import warnings</span>
              <span>{calibrationReadinessReport.credentialReferences} credential references registered</span>
            </div>
          </div>
          {calibrationReadinessReport.topAffectedItems.length > 0 ? (
            <div className="settings-readiness-list">
              <strong>Top affected targets/projects</strong>
              {calibrationReadinessReport.topAffectedItems.map((item) => (
                <span key={`${item.targetId ?? item.projectId ?? item.label}`}>
                  {item.label}: {item.count} item(s)
                </span>
              ))}
            </div>
          ) : (
            <p className="empty-state">No unresolved calibration items are currently visible.</p>
          )}
        </div>
        <div className="settings-calibration-readiness" aria-label="Guided calibration workflow">
          <div className="settings-subpanel-heading">
            <ClipboardList size={16} />
            <strong>Guided workflow</strong>
            <span>Step groups for real setup using existing local calibration state.</span>
          </div>
          <div className="settings-preview-grid">
            {calibrationWorkflow.map((group) => (
              <div key={group.id} className="settings-snapshot-summary">
                <strong>{group.label}</strong>
                <span className={`resource-pill state-${group.status}`}>
                  {group.status}
                </span>
                {group.steps.map((workflowStep) => (
                  <span key={workflowStep.id}>
                    {workflowStep.label}: {workflowStep.detail}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="settings-form-grid">
          <label className="field">
            <span>Calibration filter</span>
            <select
              aria-label="Calibration filter"
              value={calibrationFilter}
              onChange={(event) =>
                setCalibrationFilter(event.target.value as CalibrationCategory | 'all')
              }
            >
              {CALIBRATION_CATEGORIES.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>
          <div className="settings-snapshot-summary">
            <strong>Readiness scan</strong>
            <span>{issueCountLabel(calibrationIssues.length)} across Workspace and Dispatch</span>
            <span>Secret-shaped values are rejected from calibration edits</span>
          </div>
        </div>

        <div className="settings-credential-registry" aria-label="Credential reference registry">
          <div className="settings-subpanel-heading">
            <ClipboardList size={16} />
            <strong>Non-secret credential registry</strong>
            <span>Reference labels only. No tokens, passwords, keys, passphrases, or env vars.</span>
          </div>
          <div className="settings-form-grid">
            <label className="field">
              <span>Reference label</span>
              <input
                aria-label="Credential reference label"
                value={credentialLabel}
                placeholder="godaddy-mmh-production"
                onChange={(event) => setCredentialLabel(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Provider</span>
              <input
                aria-label="Credential reference provider"
                value={credentialProvider}
                placeholder="GoDaddy cPanel"
                onChange={(event) => setCredentialProvider(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Purpose</span>
              <input
                aria-label="Credential reference purpose"
                value={credentialPurpose}
                placeholder="Production host access label"
                onChange={(event) => setCredentialPurpose(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Related target IDs</span>
              <input
                aria-label="Credential reference target IDs"
                value={credentialTargetIds}
                placeholder="target-a|target-b"
                onChange={(event) => setCredentialTargetIds(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Related project IDs</span>
              <input
                aria-label="Credential reference project IDs"
                value={credentialProjectIds}
                placeholder="project-a|project-b"
                onChange={(event) => setCredentialProjectIds(event.target.value)}
              />
            </label>
            <label className="field field-full">
              <span>Reference notes</span>
              <textarea
                aria-label="Credential reference notes"
                rows={3}
                value={credentialNotes}
                placeholder="Non-secret location/context only."
                onChange={(event) => setCredentialNotes(event.target.value)}
              />
            </label>
          </div>
          <div className="data-actions">
            <button
              type="button"
              onClick={handleSaveCredentialReference}
              disabled={!credentialLabel.trim()}
            >
              <PlusCircle size={15} />
              Save credential reference
            </button>
          </div>
          {calibration.credentialReferences.length > 0 ? (
            <div className="settings-credential-list">
              {calibration.credentialReferences.map((reference) => (
                <article key={reference.id} className="settings-credential-card">
                  <div>
                    <strong>{reference.label}</strong>
                    <span>{reference.provider || 'Provider not set'}</span>
                    <span>{reference.purpose || 'Purpose not set'}</span>
                    <span>
                      {reference.targetIds.length} targets / {reference.projectIds.length}{' '}
                      projects
                    </span>
                  </div>
                  <button
                    type="button"
                    className="danger-action"
                    onClick={() => onCredentialReferenceDelete(reference.id)}
                  >
                    <Trash2 size={15} />
                    Remove
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="empty-state">
              No credential references registered yet. Dispatch targets can still use manual
              non-secret labels, but unregistered labels will be flagged.
            </p>
          )}
        </div>

        <div className="settings-import-export" aria-label="Calibration import export">
          <div className="settings-subpanel-heading">
            <Download size={16} />
            <strong>Calibration import / export</strong>
            <span>Preview-first local files for target fields, repo bindings, and references.</span>
          </div>
          <div className="data-actions">
            <button type="button" onClick={handleDownloadCalibrationCsv}>
              <Download size={15} />
              Export CSV template
            </button>
            <button type="button" onClick={handleDownloadCalibrationJson}>
              <Download size={15} />
              Export JSON template
            </button>
            <label className="file-action">
              <UploadCloud size={15} />
              Import calibration file
              <input
                aria-label="Import calibration file"
                type="file"
                accept=".json,.csv,application/json,text/csv"
                onChange={(event) => {
                  void handleCalibrationImportFile(event.target.files?.[0] ?? null)
                  event.currentTarget.value = ''
                }}
              />
            </label>
          </div>
          {calibrationImportError ? (
            <div className="data-warning">
              <strong>Import error</strong>
              <ul>
                <li>{calibrationImportError}</li>
              </ul>
            </div>
          ) : null}
          {calibrationImportPreview ? (
            <CalibrationImportPreviewPanel
              preview={calibrationImportPreview}
              onApply={handleApplyCalibrationImport}
            />
          ) : null}
        </div>

        <div className="settings-calibration-groups" aria-label="Calibration group counts">
          {calibrationCategoryCounts.map((category) => (
            <button
              type="button"
              key={category.id}
              className={calibrationFilter === category.id ? 'is-selected' : ''}
              onClick={() => setCalibrationFilter(category.id as CalibrationCategory)}
            >
              <strong>{category.count}</strong>
              <span>{category.label}</span>
            </button>
          ))}
        </div>

        <div className="settings-bulk-calibration" aria-label="Bulk calibration editor">
          <div>
            <strong>Bulk-safe Dispatch edit</strong>
            <span>
              Applies one non-secret value to visible editable items matching the selected field.
            </span>
          </div>
          <label className="field">
            <span>Bulk field</span>
            <select
              aria-label="Bulk calibration field"
              value={bulkCalibrationField}
              onChange={(event) =>
                setBulkCalibrationField(event.target.value as CalibrationEditableTargetField)
              }
            >
              {CALIBRATION_BULK_FIELDS.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Bulk value</span>
            <textarea
              aria-label="Bulk calibration value"
              rows={bulkCalibrationField === 'healthCheckUrls' ? 3 : 1}
              value={bulkCalibrationValue}
              onChange={(event) => setBulkCalibrationValue(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!bulkCalibrationValue.trim()}
            onClick={handleApplyBulkCalibration}
          >
            Apply to {matchingBulkIssues.length} visible item(s)
          </button>
        </div>

        {filteredCalibrationIssues.length > 0 ? (
          <div className="settings-calibration-list" aria-label="Grouped calibration issues">
            {groupedCalibrationIssues.map((group) => {
              const isExpanded = expandedCalibrationGroupIdSet.has(group.id)
              const statusCounts = calibrationStatusCountsByGroup.get(group.id) ?? {
                needsValue: group.issueCount,
                entered: 0,
                verified: 0,
                deferred: 0,
              }
              const groupPreview = group.issues.slice(0, 12)

              return (
                <section key={group.id} className="settings-calibration-issue-group">
                  <button
                    type="button"
                    className="settings-calibration-group-heading"
                    aria-expanded={isExpanded}
                    onClick={() => toggleCalibrationGroup(group.id)}
                  >
                    <div>
                      <strong>{group.label}</strong>
                      <span>
                        {group.detail} / {group.categoryLabel}
                      </span>
                    </div>
                    <div className="settings-calibration-group-counts">
                      <span>
                        <strong>{group.issueCount}</strong>
                        Items
                      </span>
                      <span>
                        <strong>{statusCounts.needsValue}</strong>
                        Needs value
                      </span>
                      <span>
                        <strong>{statusCounts.verified}</strong>
                        Verified
                      </span>
                      <span>
                        <strong>{statusCounts.deferred}</strong>
                        Deferred
                      </span>
                    </div>
                    <span className="resource-pill">
                      {isExpanded ? 'Collapse' : 'Open'}
                    </span>
                  </button>
                  {isExpanded ? (
                    <div className="settings-calibration-group-body">
                      {groupPreview.map((issue) => (
                        <article key={issue.id} className="settings-calibration-card">
                          <div>
                            <div className="settings-card-heading">
                              <h3>{issue.label}</h3>
                              <span className="resource-pill state-warning">
                                {issue.severity === 'needs-real-value'
                                  ? 'Needs real value'
                                  : 'Warning'}
                              </span>
                            </div>
                            <p>{issue.message}</p>
                            <div className="resource-meta">
                              <span>{issue.projectName}</span>
                              {issue.targetName ? <span>{issue.targetName}</span> : null}
                              <span>{issue.category}</span>
                              <span>{issue.field}</span>
                            </div>
                          </div>
                          <CalibrationField
                            key={`${issue.id}-${issue.value}`}
                            issue={issue}
                            credentialReferences={calibration.credentialReferences}
                            onTargetChange={(targetId, update) => {
                              onDispatchTargetChange(targetId, update)
                              onCalibrationProgressChange(
                                issue,
                                'entered',
                                calibrationNoteDrafts[issue.id] ??
                                  calibrationProgressByIssue.get(issue.id)?.note ??
                                  '',
                              )
                              onCalibrationAudit({
                                type: 'field-edit',
                                summary: `Updated ${issue.label} for ${issue.projectName}.`,
                                issue,
                              })
                              setCalibrationMessage('Calibration field updated locally.')
                            }}
                            onRejectValue={setCalibrationMessage}
                          />
                          <div className="settings-calibration-progress">
                            <label className="field field-full">
                              <span>Calibration note</span>
                              <textarea
                                aria-label={`Calibration note for ${issue.label}`}
                                rows={2}
                                value={
                                  calibrationNoteDrafts[issue.id] ??
                                  calibrationProgressByIssue.get(issue.id)?.note ??
                                  ''
                                }
                                onChange={(event) =>
                                  setCalibrationNoteDrafts((current) => ({
                                    ...current,
                                    [issue.id]: event.target.value,
                                  }))
                                }
                              />
                            </label>
                            <div className="settings-calibration-actions">
                              <span className="resource-pill">
                                {calibrationProgressByIssue.get(issue.id)?.status ??
                                  'needs-value'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleProgressChange(issue, 'entered')}
                              >
                                Mark entered
                              </button>
                              <button
                                type="button"
                                onClick={() => handleProgressChange(issue, 'verified')}
                              >
                                Mark verified
                              </button>
                              <button
                                type="button"
                                onClick={() => handleProgressChange(issue, 'deferred')}
                              >
                                Defer
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                      {group.issues.length > groupPreview.length ? (
                        <p className="empty-state">
                          Showing 12 of {group.issues.length} items in this group. Narrow the
                          filter for the rest.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              )
            })}
            {groupedCalibrationIssues.length > 12 ? (
              <p className="empty-state">
                {groupedCalibrationIssues.length} grouped targets/projects are visible. Use the
                filter cards above to narrow the list.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="empty-state">
            No calibration gaps match this filter. This does not verify credentials or server
            access.
          </p>
        )}
        {calibrationMessage ? (
          <p className="data-action-message">{calibrationMessage}</p>
        ) : null}
        {calibration.auditEvents.length > 0 ? (
          <div className="settings-audit-list" aria-label="Calibration audit events">
            <strong>Latest calibration audit</strong>
            {calibration.auditEvents.slice(0, 8).map((event) => (
              <article key={event.id}>
                <span>{new Date(event.occurredAt).toLocaleString()}</span>
                <span>{event.type}</span>
                <p>{event.summary}</p>
              </article>
            ))}
          </div>
        ) : null}
      </section>
  )
}
