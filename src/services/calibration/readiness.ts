import type { AtlasCalibrationState, CalibrationCategory } from '../../domain/calibration'
import { CALIBRATION_CATEGORIES, type CalibrationImportPreview, type CalibrationIssue, type CalibrationReadinessAffectedItem, type CalibrationReadinessReport } from './types'

export function summarizeCalibrationState(state: AtlasCalibrationState) {
  const fieldProgress = Array.isArray(state?.fieldProgress) ? state.fieldProgress : []
  const credentialReferences = Array.isArray(state?.credentialReferences)
    ? state.credentialReferences
    : []
  const auditEvents = Array.isArray(state?.auditEvents) ? state.auditEvents : []

  return {
    progressRecords: fieldProgress.length,
    needsValue: fieldProgress.filter((item) => item.status === 'needs-value').length,
    entered: fieldProgress.filter((item) => item.status === 'entered').length,
    verified: fieldProgress.filter((item) => item.status === 'verified').length,
    deferred: fieldProgress.filter((item) => item.status === 'deferred').length,
    credentialReferences: credentialReferences.length,
    auditEvents: auditEvents.length,
  }
}

export function createCalibrationReadinessReport({
  issues,
  calibration,
  importPreview = null,
}: {
  issues: CalibrationIssue[]
  calibration: AtlasCalibrationState
  importPreview?: CalibrationImportPreview | null
}): CalibrationReadinessReport {
  const summary = summarizeCalibrationState(calibration)
  const affected = new Map<string, CalibrationReadinessAffectedItem>()

  for (const issue of issues) {
    const key = issue.targetId ?? issue.projectId ?? issue.id
    const label = issue.targetName
      ? `${issue.projectName} / ${issue.targetName}`
      : issue.projectName
    const current = affected.get(key) ?? {
      label,
      projectId: issue.projectId,
      targetId: issue.targetId,
      count: 0,
    }

    current.count += 1
    affected.set(key, current)
  }

  return {
    unresolved: issues.length,
    needsValue: summary.needsValue,
    entered: summary.entered,
    verified: summary.verified,
    deferred: summary.deferred,
    credentialReferences: summary.credentialReferences,
    unregisteredCredentialRefs: issues.filter((issue) => issue.field === 'credentialRef-registry')
      .length,
    importWarnings:
      (importPreview?.warnings.length ?? 0) +
      (importPreview?.acceptedRows.reduce((total, row) => total + row.warnings.length, 0) ?? 0),
    categoryCounts: CALIBRATION_CATEGORIES.filter(
      (category): category is { id: CalibrationCategory; label: string } => category.id !== 'all',
    ).map((category) => ({
        category: category.id,
        count: issues.filter((issue) => issue.category === category.id).length,
      })),
    topAffectedItems: Array.from(affected.values())
      .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      .slice(0, 5),
    latestAuditEvents: calibration.auditEvents.slice(0, 5),
  }
}
