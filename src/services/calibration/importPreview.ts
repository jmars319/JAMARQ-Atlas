import type { Workspace, VerificationCadence, WorkStatus } from '../../domain/atlas'
import { flattenProjects, VERIFICATION_CADENCES, WORK_STATUSES } from '../../domain/atlas'
import type { DispatchState } from '../../domain/dispatch'
import type { AtlasCalibrationState } from '../../domain/calibration'
import { parseRepositoryFullName } from '../repoBinding'
import { readString, valueLabel } from './shared'
import { DISPATCH_IMPORT_FIELDS, PROJECT_MANUAL_IMPORT_FIELDS, RECOVERY_PLAN_IMPORT_FIELDS, RUNBOOK_ARTIFACT_IMPORT_FIELDS, RUNBOOK_PRESERVE_PATH_IMPORT_FIELDS, RUNBOOK_VERIFICATION_CHECK_IMPORT_FIELDS, collectRowWarnings, createImportChange, createKindSummaries, duplicateImportWarnings, findImportRunbook, hasImportValue, normalizeImportKind, normalizeImportRows, parseExpectedStatuses, rowValue, valueFromRecoveryPlan } from './importShared'
import type { CalibrationImportAcceptedRow, CalibrationImportChange, CalibrationImportPreview, CalibrationImportRejectedRow } from './types'

export function parseCalibrationImportPreview(
  text: string,
  workspace: Workspace,
  dispatch: DispatchState,
  calibration?: AtlasCalibrationState,
): CalibrationImportPreview {
  let rows: Record<string, string>[]

  try {
    rows = normalizeImportRows(text)
  } catch {
    return {
      acceptedRows: [],
      rejectedRows: [
        {
          index: 1,
          kind: 'unknown',
          identifier: 'import',
          errors: ['Import file could not be parsed as JSON or CSV.'],
          data: {},
        },
      ],
      warnings: [],
      kindSummaries: [{ kind: 'unknown', accepted: 0, rejected: 1, warnings: 0 }],
    }
  }

  const records = flattenProjects(workspace)
  const acceptedRows: CalibrationImportAcceptedRow[] = []
  const rejectedRows: CalibrationImportRejectedRow[] = []
  const importWarnings = duplicateImportWarnings(rows, records, calibration)

  rows.forEach((row, rowIndex) => {
    const index = rowIndex + 1
    const kind = normalizeImportKind(readString(row.kind).trim())
    const identifier =
      readString(row.targetId) ||
      readString(row.runbookId) ||
      readString(row.artifactId) ||
      readString(row.preservePathId) ||
      readString(row.verificationCheckId) ||
      readString(row.projectId) ||
      readString(row.label) ||
      `row-${index}`
    const errors: string[] = []
    const warnings = collectRowWarnings(row)
    const blocked = warnings.filter((warning) => warning.level === 'blocked')

    if (!kind) {
      errors.push(
        'Row kind must be dispatch-target, repo-binding, credential-reference, project-manual, recovery-plan, runbook-artifact, runbook-preserve-path, or runbook-verification-check.',
      )
    }

    if (blocked.length > 0) {
      errors.push(...blocked.map((warning) => warning.message))
    }

    const changes: string[] = []
    const changeDetails: CalibrationImportChange[] = []

    if (kind === 'dispatch-target') {
      const target = dispatch.targets.find((candidate) => candidate.id === row.targetId)
      if (!target) {
        errors.push('Dispatch target ID was not found.')
      } else {
        for (const field of DISPATCH_IMPORT_FIELDS) {
          if (row[field]?.trim()) {
            const before = valueLabel(target[field] as string | string[])
            const change = createImportChange(field, before, row[field])

            changeDetails.push(change)
            changes.push(change.summary)
          }
        }
      }
    }

    if (kind === 'repo-binding') {
      const project = records.find((record) => record.project.id === row.projectId)
      const repository = parseRepositoryFullName(row.repository || row.repo || row.fullName || '')
      if (!project) {
        errors.push('Project ID was not found.')
      }
      if (!repository) {
        errors.push('Repository must be owner/repo or a GitHub repository URL.')
      } else {
        const change = createImportChange(
          'repository',
          project?.project.repositories.map((repo) => `${repo.owner}/${repo.name}`).join(', ') ?? '',
          `${repository.owner}/${repository.name}`,
        )

        changeDetails.push(change)
        changes.push(`Bind ${repository.owner}/${repository.name} to ${row.projectId}.`)
      }
    }

    if (kind === 'credential-reference') {
      if (!row.label?.trim()) {
        errors.push('Credential reference label is required.')
      } else {
        const existingReference = calibration?.credentialReferences.find(
          (reference) => reference.label.toLowerCase() === row.label.toLowerCase(),
        )
        const change = createImportChange(
          'credential-reference',
          existingReference ? 'existing reference' : '',
          row.label,
        )

        changeDetails.push(change)
        changes.push(`Save credential reference ${row.label}.`)
      }
    }

    if (kind === 'project-manual') {
      const project = records.find((record) => record.project.id === row.projectId)
      if (!project) {
        errors.push('Project ID was not found.')
      } else {
        if (hasImportValue(row, 'status')) {
          const status = row.status as WorkStatus
          if (!WORK_STATUSES.some((definition) => definition.id === status)) {
            errors.push('Project status is not a known Atlas work status.')
          }
        }
        if (hasImportValue(row, 'verificationCadence')) {
          const cadence = row.verificationCadence as VerificationCadence
          if (!VERIFICATION_CADENCES.some((definition) => definition.id === cadence)) {
            errors.push('Verification cadence is not a known Atlas cadence.')
          }
        }

        for (const field of PROJECT_MANUAL_IMPORT_FIELDS) {
          if (hasImportValue(row, field)) {
            const before =
              field === 'summary'
                ? project.project.summary
                : valueLabel(project.project.manual[field] as string | string[])
            const change = createImportChange(field, before, row[field])

            changeDetails.push(change)
            changes.push(change.summary)
          }
        }
      }
    }

    if (kind === 'recovery-plan') {
      const target = dispatch.targets.find((candidate) => candidate.id === row.targetId)
      const existing = dispatch.recoveryPlans.find((plan) => plan.targetId === row.targetId)

      if (!target) {
        errors.push('Dispatch target ID was not found.')
      } else {
        for (const field of RECOVERY_PLAN_IMPORT_FIELDS) {
          if (hasImportValue(row, field)) {
            const change = createImportChange(field, valueFromRecoveryPlan(existing, field), row[field])

            changeDetails.push(change)
            changes.push(change.summary)
          }
        }
      }
    }

    if (kind === 'runbook-artifact') {
      const runbook = findImportRunbook(dispatch, row)
      if (!runbook) {
        errors.push('Runbook was not found for runbookId or targetId.')
      } else {
        const artifactId = rowValue(row, 'artifactId')
        const existing = runbook.artifacts.find((artifact) => artifact.id === artifactId)
        if (!existing && !rowValue(row, 'filename')) {
          errors.push('New runbook artifact rows require filename or an existing artifactId.')
        }

        for (const field of RUNBOOK_ARTIFACT_IMPORT_FIELDS) {
          if (hasImportValue(row, field)) {
            const before = existing
              ? valueLabel(existing[field] as string | string[])
              : ''
            const change = createImportChange(field, before, row[field])

            changeDetails.push(change)
            changes.push(change.summary)
          }
        }
      }
    }

    if (kind === 'runbook-preserve-path') {
      const runbook = findImportRunbook(dispatch, row)
      if (!runbook) {
        errors.push('Runbook was not found for runbookId or targetId.')
      } else {
        const preservePathId = rowValue(row, 'preservePathId')
        const existing =
          runbook.preservePaths.find((preservePath) => preservePath.id === preservePathId) ??
          runbook.preservePaths.find((preservePath) => preservePath.path === rowValue(row, 'path'))
        if (!existing && !rowValue(row, 'path')) {
          errors.push('New runbook preserve path rows require path or an existing preservePathId.')
        }

        for (const field of RUNBOOK_PRESERVE_PATH_IMPORT_FIELDS) {
          if (hasImportValue(row, field)) {
            const before = existing
              ? valueLabel(existing[field] as string | string[])
              : ''
            const change = createImportChange(field, before, row[field])

            changeDetails.push(change)
            changes.push(change.summary)
          }
        }
      }
    }

    if (kind === 'runbook-verification-check') {
      const runbook = findImportRunbook(dispatch, row)
      if (!runbook) {
        errors.push('Runbook was not found for runbookId or targetId.')
      } else {
        const checkId = rowValue(row, 'verificationCheckId')
        const existing =
          runbook.verificationChecks.find((check) => check.id === checkId) ??
          runbook.verificationChecks.find((check) => check.urlPath === rowValue(row, 'urlPath'))
        if (!existing && (!rowValue(row, 'label') || !rowValue(row, 'urlPath'))) {
          errors.push('New runbook verification check rows require label and urlPath.')
        }
        if (hasImportValue(row, 'method') && !['GET', 'HEAD'].includes(row.method.toUpperCase())) {
          errors.push('Verification check method must be HEAD or GET.')
        }
        if (hasImportValue(row, 'expectedStatuses') && parseExpectedStatuses(row.expectedStatuses).length === 0) {
          errors.push('Expected statuses must include at least one HTTP status code.')
        }

        for (const field of RUNBOOK_VERIFICATION_CHECK_IMPORT_FIELDS) {
          if (hasImportValue(row, field)) {
            const before = existing
              ? valueLabel(existing[field] as string | string[])
              : ''
            const change = createImportChange(field, before, row[field])

            changeDetails.push(change)
            changes.push(change.summary)
          }
        }
      }
    }

    if (errors.length > 0 || !kind) {
      rejectedRows.push({
        index,
        kind: row.kind || 'unknown',
        identifier,
        errors,
        data: row,
      })
      return
    }

    acceptedRows.push({
      index,
      kind,
      identifier,
      changes,
      changeDetails,
      warnings: warnings.filter((warning) => warning.level === 'warning'),
      data: row,
    })
  })

  const warnings = [
    ...(rows.length === 0 ? ['Import file did not contain any rows.'] : []),
    ...importWarnings,
  ]

  return {
    acceptedRows,
    rejectedRows,
    warnings,
    kindSummaries: createKindSummaries(acceptedRows, rejectedRows),
  }
}
