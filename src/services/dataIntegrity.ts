import type { Workspace } from '../domain/atlas'
import { flattenProjects } from '../domain/atlas'
import type { AtlasCalibrationState } from '../domain/calibration'
import type { DataIntegrityDiagnostic, DataIntegritySeverity } from '../domain/dataIntegrity'
import type { DispatchState } from '../domain/dispatch'
import type { PlanningItem, PlanningState } from '../domain/planning'
import type { ReportsState } from '../domain/reports'
import type { ReviewState } from '../domain/review'
import type { AtlasStoreId } from '../domain/storeRegistry'
import type { WritingWorkbenchState } from '../domain/writing'

export interface DataIntegrityInput {
  workspace: Workspace
  dispatch: DispatchState
  writing: WritingWorkbenchState
  planning: PlanningState
  reports: ReportsState
  review: ReviewState
  calibration: AtlasCalibrationState
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function planningItems(planning: PlanningState): PlanningItem[] {
  return [
    ...planning.objectives,
    ...planning.milestones,
    ...planning.workSessions,
    ...planning.notes,
  ]
}

function pushDiagnostic(
  diagnostics: DataIntegrityDiagnostic[],
  input: {
    id: string
    label: string
    severity: DataIntegritySeverity
    storeId: AtlasStoreId
    affectedIds: string[]
    detail: string
    repairSuggestion: string
  },
) {
  const affectedIds = unique(input.affectedIds)

  if (affectedIds.length === 0) {
    return
  }

  diagnostics.push({
    ...input,
    affectedIds,
    affectedCount: affectedIds.length,
  })
}

export function createDataIntegrityDiagnostics({
  workspace,
  dispatch,
  writing,
  planning,
  reports,
  review,
  calibration,
}: DataIntegrityInput): DataIntegrityDiagnostic[] {
  const records = flattenProjects(workspace)
  const projectIds = new Set(records.map((record) => record.project.id))
  const targetIds = new Set(dispatch.targets.map((target) => target.id))
  const runbookIds = new Set(dispatch.runbooks.map((runbook) => runbook.id))
  const draftIds = new Set(writing.drafts.map((draft) => draft.id))
  const reviewNoteIds = new Set(review.notes.map((note) => note.id))
  const reviewSessionIds = new Set(review.sessions.map((session) => session.id))
  const diagnostics: DataIntegrityDiagnostic[] = []

  pushDiagnostic(diagnostics, {
    id: 'workspace-repository-bindings',
    label: 'Invalid repository bindings',
    severity: 'warning',
    storeId: 'workspace',
    affectedIds: records.flatMap((record) =>
      record.project.repositories
        .map((repository, index) =>
          repository.owner.trim() && repository.name.trim()
            ? ''
            : `${record.project.id}:repository:${index}`,
        )
        .filter(Boolean),
    ),
    detail: 'One or more repository bindings are missing an owner or repository name.',
    repairSuggestion: 'Open the project repository list, remove incomplete bindings, then rebind from GitHub Intake.',
  })

  pushDiagnostic(diagnostics, {
    id: 'dispatch-missing-projects',
    label: 'Dispatch references missing projects',
    severity: 'danger',
    storeId: 'dispatch',
    affectedIds: [
      ...dispatch.targets.map((target) => (!projectIds.has(target.projectId) ? target.id : '')),
      ...dispatch.records.map((record) => (!projectIds.has(record.projectId) ? record.id : '')),
      ...dispatch.readiness.map((readiness) =>
        !projectIds.has(readiness.projectId) ? `${readiness.projectId}:${readiness.targetId}` : '',
      ),
      ...dispatch.preflightRuns.map((run) => (!projectIds.has(run.projectId) ? run.id : '')),
      ...dispatch.hostEvidenceRuns.map((run) => (!projectIds.has(run.projectId) ? run.id : '')),
      ...dispatch.verificationEvidenceRuns.map((run) =>
        !projectIds.has(run.projectId) ? run.id : '',
      ),
      ...dispatch.runbooks.map((runbook) => (!projectIds.has(runbook.projectId) ? runbook.id : '')),
      ...dispatch.deploySessions.map((session) =>
        !projectIds.has(session.projectId) ? session.id : '',
      ),
    ],
    detail: 'Dispatch targets, evidence, runbooks, or sessions point at projects that no longer exist.',
    repairSuggestion: 'Recreate the missing project, restore from backup, or export then manually remove stale Dispatch records.',
  })

  pushDiagnostic(diagnostics, {
    id: 'dispatch-missing-targets',
    label: 'Dispatch references missing targets',
    severity: 'danger',
    storeId: 'dispatch',
    affectedIds: [
      ...dispatch.records.map((record) => (!targetIds.has(record.targetId) ? record.id : '')),
      ...dispatch.readiness.map((readiness) =>
        !targetIds.has(readiness.targetId) ? `${readiness.projectId}:${readiness.targetId}` : '',
      ),
      ...dispatch.preflightRuns.map((run) => (!targetIds.has(run.targetId) ? run.id : '')),
      ...dispatch.hostEvidenceRuns.map((run) => (!targetIds.has(run.targetId) ? run.id : '')),
      ...dispatch.verificationEvidenceRuns.map((run) =>
        !targetIds.has(run.targetId) ? run.id : '',
      ),
      ...dispatch.runbooks.map((runbook) => (!targetIds.has(runbook.targetId) ? runbook.id : '')),
      ...dispatch.deploySessions.map((session) =>
        !targetIds.has(session.targetId) ? session.id : '',
      ),
    ],
    detail: 'Dispatch evidence or operational records point at targets that are not configured.',
    repairSuggestion: 'Restore the target from backup or preserve evidence externally before manually removing stale references.',
  })

  pushDiagnostic(diagnostics, {
    id: 'dispatch-missing-runbooks',
    label: 'Deploy sessions or evidence missing runbooks',
    severity: 'warning',
    storeId: 'dispatch',
    affectedIds: [
      ...dispatch.verificationEvidenceRuns.map((run) =>
        !runbookIds.has(run.runbookId) ? run.id : '',
      ),
      ...dispatch.deploySessions.map((session) =>
        !runbookIds.has(session.runbookId) ? session.id : '',
      ),
    ],
    detail: 'Verification evidence or deploy sessions reference runbooks that are not present.',
    repairSuggestion: 'Regenerate the runbook for that target or keep the evidence as historical-only context.',
  })

  pushDiagnostic(diagnostics, {
    id: 'writing-missing-projects',
    label: 'Writing drafts reference missing projects',
    severity: 'warning',
    storeId: 'writing',
    affectedIds: writing.drafts.map((draft) => (!projectIds.has(draft.projectId) ? draft.id : '')),
    detail: 'One or more Writing drafts are attached to deleted or missing projects.',
    repairSuggestion: 'Export useful draft text, then recreate the project or archive the stale draft.',
  })

  pushDiagnostic(diagnostics, {
    id: 'planning-missing-projects',
    label: 'Planning records reference missing projects',
    severity: 'warning',
    storeId: 'planning',
    affectedIds: planningItems(planning).map((item) =>
      !projectIds.has(item.projectId) ? item.id : '',
    ),
    detail: 'Planning items reference projects that are not in Workspace.',
    repairSuggestion: 'Open Planning, copy useful context, and recreate or remove stale planning records.',
  })

  pushDiagnostic(diagnostics, {
    id: 'reports-stale-links',
    label: 'Report packets contain stale links',
    severity: 'warning',
    storeId: 'reports',
    affectedIds: reports.packets.map((packet) => {
      const stale =
        packet.projectIds.some((projectId) => !projectIds.has(projectId)) ||
        packet.writingDraftIds.some((draftId) => !draftIds.has(draftId)) ||
        packet.reviewNoteIds.some((noteId) => !reviewNoteIds.has(noteId)) ||
        packet.reviewSessionIds.some((sessionId) => !reviewSessionIds.has(sessionId))

      return stale ? packet.id : ''
    }),
    detail: 'Report packets reference missing projects, Writing drafts, Review notes, or Review sessions.',
    repairSuggestion: 'Regenerate the report packet from current context or keep the existing packet as historical-only.',
  })

  pushDiagnostic(diagnostics, {
    id: 'review-stale-links',
    label: 'Review records reference missing projects',
    severity: 'warning',
    storeId: 'review',
    affectedIds: [
      ...review.notes.map((note) =>
        note.projectId && !projectIds.has(note.projectId) ? note.id : '',
      ),
      ...review.sessions.map((session) =>
        session.projectIds.some((projectId) => !projectIds.has(projectId)) ? session.id : '',
      ),
    ],
    detail: 'Review notes or sessions point at projects that are not in Workspace.',
    repairSuggestion: 'Use Review history as context only, or restore the missing project before creating follow-up work.',
  })

  pushDiagnostic(diagnostics, {
    id: 'calibration-stale-links',
    label: 'Calibration references missing projects or targets',
    severity: 'warning',
    storeId: 'calibration',
    affectedIds: calibration.credentialReferences.map((reference) => {
      const staleProject = reference.projectIds.some((projectId) => !projectIds.has(projectId))
      const staleTarget = reference.targetIds.some((targetId) => !targetIds.has(targetId))

      return staleProject || staleTarget ? reference.id : ''
    }),
    detail: 'Credential reference labels point at missing projects or Dispatch targets.',
    repairSuggestion: 'Edit the credential reference registry so labels point only at current projects and targets.',
  })

  return diagnostics
}
