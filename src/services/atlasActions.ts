import type { Dispatch as ReactDispatch, SetStateAction } from 'react'
import {
  findProjectRecord,
  flattenProjects,
  updateProject,
  type GithubRepositoryLink,
  type ManualOperationalState,
  type ProjectRecord,
  type VerificationCadence,
  type Workspace,
} from '../domain/atlas'
import type {
  DeploymentTarget,
  DispatchAutomationReadiness,
  DispatchHostEvidenceRun,
  DispatchReadiness,
  DispatchState,
  DispatchVerificationEvidenceRun,
} from '../domain/dispatch'
import { getRunbookForTarget } from '../domain/dispatch'
import type {
  AtlasCalibrationState,
  CalibrationAuditEventType,
  CalibrationCredentialReference,
  CalibrationFieldStatus,
} from '../domain/calibration'
import type { AtlasBackupStores } from '../domain/dataPortability'
import type { PlanningSourceLink, PlanningState } from '../domain/planning'
import type { ReportsState } from '../domain/reports'
import type { ReviewState } from '../domain/review'
import type { AtlasSettingsState } from '../domain/settings'
import type { AtlasSyncCoreStores, AtlasSyncSnapshot, AtlasSyncState } from '../domain/sync'
import type { WritingDraft, WritingTemplateId, WritingWorkbenchState } from '../domain/writing'
import {
  applyCalibrationImportPreview,
  recordCalibrationAuditEvent,
  type CalibrationImportPreview,
  type CalibrationIssue,
} from './calibration'
import { runDeploymentVerificationChecks } from './deployPreflight'
import { createHostEvidenceRun, createVerificationEvidenceRun } from './dispatchEvidence'
import { runDispatchPreflight } from './dispatchPreflight'
import { requestHostConnectionPreflight } from './hostConnection'
import { createReportPacket } from './reports'
import {
  bindRepositoryToProject,
  createInboxProjectFromRepository,
  repositorySummaryToLink,
  unbindRepositoryFromProject,
} from './repoBinding'
import { createSyncSnapshot } from './syncSnapshots'
import { markProjectVerified, updateProjectVerificationCadence } from './verification'
import type { GithubRepositorySummary } from './githubIntegration'

export type AtlasActionView =
  | 'board'
  | 'timeline'
  | 'github'
  | 'planning'
  | 'reports'
  | 'review'
  | 'verification'
  | 'dispatch'
  | 'writing'
  | 'data'
  | 'settings'

interface AtlasActionsContext {
  workspace: Workspace
  setWorkspace: ReactDispatch<SetStateAction<Workspace>>
  selectedRecord: ProjectRecord | undefined
  projectRecords: ProjectRecord[]
  dispatch: DispatchState
  setDispatch: ReactDispatch<SetStateAction<DispatchState>>
  updateTarget: (targetId: string, update: Partial<DeploymentTarget>) => void
  updateReadiness: (
    targetId: string,
    projectId: string,
    update: Partial<DispatchReadiness>,
  ) => void
  updateAutomationReadiness: (
    targetId: string,
    projectId: string,
    update: Partial<DispatchAutomationReadiness>,
  ) => void
  addPreflightRun: (run: DispatchState['preflightRuns'][number]) => void
  addHostEvidenceRun: (run: DispatchHostEvidenceRun) => void
  addVerificationEvidenceRun: (run: DispatchVerificationEvidenceRun) => void
  settings: AtlasSettingsState
  setSettings: ReactDispatch<SetStateAction<AtlasSettingsState>>
  calibration: AtlasCalibrationState
  setCalibration: ReactDispatch<SetStateAction<AtlasCalibrationState>>
  setCalibrationFieldProgress: (
    issue: CalibrationIssue,
    status: CalibrationFieldStatus,
    note?: string,
    operatorLabel?: string,
  ) => void
  saveCredentialReference: (
    input: Pick<
      CalibrationCredentialReference,
      'label' | 'provider' | 'purpose' | 'projectIds' | 'targetIds' | 'notes'
    > & { operatorLabel?: string },
  ) => { ok: boolean; message: string }
  sync: AtlasSyncState
  setSync: ReactDispatch<SetStateAction<AtlasSyncState>>
  addSnapshot: (snapshot: AtlasSyncSnapshot) => void
  writing: WritingWorkbenchState
  setWriting: ReactDispatch<SetStateAction<WritingWorkbenchState>>
  addDraft: (draft: WritingDraft) => void
  planning: PlanningState
  setPlanning: ReactDispatch<SetStateAction<PlanningState>>
  createPlanningItem: (input: {
    kind: 'note'
    record: ProjectRecord
    title: string
    detail: string
    sourceLinks?: PlanningSourceLink[]
    status?: 'planned'
  }) => void
  reports: ReportsState
  setReports: ReactDispatch<SetStateAction<ReportsState>>
  addReportPacket: (packet: ReportsState['packets'][number]) => void
  review: ReviewState
  setReview: ReactDispatch<SetStateAction<ReviewState>>
  calibrationIssues: CalibrationIssue[]
  setSelectedProjectId: ReactDispatch<SetStateAction<string>>
  setSelectedWritingTemplate: ReactDispatch<SetStateAction<WritingTemplateId>>
  setSelectedWritingDraftId: ReactDispatch<SetStateAction<string>>
  setAppView: ReactDispatch<SetStateAction<AtlasActionView>>
  setPreflightRunningTargetId: ReactDispatch<SetStateAction<string>>
  setHostInspectionRunningTargetIds: ReactDispatch<SetStateAction<string[]>>
  setVerificationRunningTargetIds: ReactDispatch<SetStateAction<string[]>>
  setQueueEvidenceSweepRunning: ReactDispatch<SetStateAction<boolean>>
}

export function createAtlasActions(context: AtlasActionsContext) {
  function selectProject(projectId: string) {
    context.setSelectedProjectId(projectId)
    context.setSelectedWritingDraftId('')
  }

  function updateManualState(update: Partial<ManualOperationalState>) {
    if (!context.selectedRecord) {
      return
    }

    context.setWorkspace((currentWorkspace) =>
      updateProject(currentWorkspace, context.selectedRecord!.project.id, (project) => ({
        ...project,
        manual: {
          ...project.manual,
          ...update,
        },
      })),
    )
  }

  async function runDispatchPreflightForTarget(targetId: string) {
    const target = context.dispatch.targets.find((candidate) => candidate.id === targetId)

    if (!target) {
      return
    }

    const record = findProjectRecord(context.workspace, target.projectId)

    if (!record) {
      return
    }

    context.setPreflightRunningTargetId(targetId)

    try {
      const run = await runDispatchPreflight({
        record,
        dispatch: context.dispatch,
        target,
      })
      context.addPreflightRun(run)
    } finally {
      context.setPreflightRunningTargetId('')
    }
  }

  async function runHostInspection(targetId: string) {
    const target = context.dispatch.targets.find((candidate) => candidate.id === targetId)

    if (!target) {
      return
    }

    const runbook = getRunbookForTarget(context.dispatch, target.id)

    context.setHostInspectionRunningTargetIds((current) =>
      current.includes(targetId) ? current : [...current, targetId],
    )

    try {
      const result = await requestHostConnectionPreflight({
        target,
        preservePaths: runbook?.preservePaths.map((preservePath) => preservePath.path) ?? [],
      })
      context.addHostEvidenceRun(
        createHostEvidenceRun({
          projectId: target.projectId,
          result,
        }),
      )
    } finally {
      context.setHostInspectionRunningTargetIds((current) =>
        current.filter((candidate) => candidate !== targetId),
      )
    }
  }

  async function runDeploymentVerification(targetId: string) {
    const target = context.dispatch.targets.find((candidate) => candidate.id === targetId)
    const runbook = target ? getRunbookForTarget(context.dispatch, target.id) : undefined

    if (!target || !runbook) {
      return
    }

    context.setVerificationRunningTargetIds((current) =>
      current.includes(targetId) ? current : [...current, targetId],
    )

    try {
      const evidence = await runDeploymentVerificationChecks({
        target,
        checks: runbook.verificationChecks,
      })
      const run = createVerificationEvidenceRun({
        projectId: target.projectId,
        targetId: target.id,
        runbookId: runbook.id,
        evidence,
      })

      context.addVerificationEvidenceRun(run)
    } finally {
      context.setVerificationRunningTargetIds((current) =>
        current.filter((candidate) => candidate !== targetId),
      )
    }
  }

  async function runQueueEvidenceSweep(targetIds: string[]) {
    context.setQueueEvidenceSweepRunning(true)

    try {
      for (const targetId of targetIds) {
        await runDispatchPreflightForTarget(targetId)
        await runHostInspection(targetId)
        await runDeploymentVerification(targetId)
      }
    } finally {
      context.setQueueEvidenceSweepRunning(false)
    }
  }

  function createReadinessReport(projectId: string) {
    const packet = createReportPacket({
      type: 'deployment-readiness-packet',
      projectRecords: context.projectRecords,
      dispatch: context.dispatch,
      reports: context.reports,
      planning: context.planning,
      writingDrafts: context.writing.drafts,
      review: context.review,
      projectIds: [projectId],
      writingDraftIds: [],
      calibration: context.calibration,
      calibrationIssues: context.calibrationIssues,
    })

    context.addReportPacket(packet)
    selectProject(projectId)
    context.setAppView('reports')
  }

  function bindRepository(projectId: string, repository: GithubRepositorySummary) {
    const link = repositorySummaryToLink(repository)
    context.setWorkspace((currentWorkspace) =>
      bindRepositoryToProject(currentWorkspace, projectId, link),
    )
    selectProject(projectId)
  }

  function createInboxProject(repository: GithubRepositorySummary) {
    const result = createInboxProjectFromRepository(context.workspace, repository)
    context.setWorkspace(result.workspace)
    selectProject(result.projectId)
  }

  function unbindRepository(projectId: string, repository: GithubRepositoryLink) {
    context.setWorkspace((currentWorkspace) =>
      unbindRepositoryFromProject(currentWorkspace, projectId, repository),
    )
  }

  function updateVerificationCadence(
    projectId: string,
    verificationCadence: VerificationCadence,
  ) {
    context.setWorkspace((currentWorkspace) =>
      updateProjectVerificationCadence(currentWorkspace, projectId, verificationCadence),
    )
  }

  function markVerified(projectId: string, note: string) {
    context.setWorkspace((currentWorkspace) => markProjectVerified(currentWorkspace, projectId, note))
    selectProject(projectId)
  }

  function requestWriting(projectId: string, templateId: WritingTemplateId) {
    context.setSelectedProjectId(projectId)
    context.setSelectedWritingTemplate(templateId)
    context.setSelectedWritingDraftId('')
    context.setAppView('writing')
  }

  function openPlanning(projectId: string) {
    selectProject(projectId)
    context.setAppView('planning')
  }

  function openReview(projectId?: string) {
    if (projectId) {
      selectProject(projectId)
    }
    context.setAppView('review')
  }

  function createPlanningNoteFromReview(
    projectId: string,
    title: string,
    detail: string,
    sourceLinks: PlanningSourceLink[] = [],
  ) {
    const record = findProjectRecord(context.workspace, projectId)

    if (!record) {
      return
    }

    context.createPlanningItem({
      kind: 'note',
      record,
      title,
      detail,
      sourceLinks,
      status: 'planned',
    })
  }

  function createWritingDraft(draft: WritingDraft) {
    context.addDraft(draft)
    context.setSelectedProjectId(draft.projectId)
    context.setSelectedWritingTemplate(draft.templateId)
    context.setSelectedWritingDraftId(draft.id)
  }

  function selectWritingDraft(draftId: string) {
    const draft = context.writing.drafts.find((candidate) => candidate.id === draftId)

    if (!draft) {
      return
    }

    context.setSelectedProjectId(draft.projectId)
    context.setSelectedWritingTemplate(draft.templateId)
    context.setSelectedWritingDraftId(draft.id)
    context.setAppView('writing')
  }

  function restoreStores(stores: AtlasBackupStores) {
    context.setWorkspace(stores.workspace)
    context.setDispatch(stores.dispatch)
    context.setWriting(stores.writing)
    context.setPlanning(stores.planning)
    context.setReports(stores.reports)
    context.setReview(stores.review)
    context.setCalibration(stores.calibration)
    context.setSettings(stores.settings)
    context.setSync(stores.sync)
    context.setSelectedProjectId(flattenProjects(stores.workspace)[0]?.project.id ?? '')
    context.setSelectedWritingDraftId('')
  }

  function createSnapshot(label: string, note: string) {
    context.addSnapshot(
      createSyncSnapshot({
        stores: {
          workspace: context.workspace,
          dispatch: context.dispatch,
          writing: context.writing,
          planning: context.planning,
          reports: context.reports,
          review: context.review,
          calibration: context.calibration,
        },
        settings: context.settings,
        sync: context.sync,
        label,
        note,
      }),
    )
  }

  function restoreSnapshot(stores: AtlasSyncCoreStores) {
    context.setWorkspace(stores.workspace)
    context.setDispatch(stores.dispatch)
    context.setWriting(stores.writing)
    context.setPlanning(stores.planning)
    context.setReports(stores.reports)
    context.setReview(stores.review)
    context.setCalibration(stores.calibration)
    context.setSelectedProjectId(flattenProjects(stores.workspace)[0]?.project.id ?? '')
    context.setSelectedWritingDraftId('')
  }

  function updateCalibrationProgress(
    issue: CalibrationIssue,
    status: CalibrationFieldStatus,
    note: string,
  ) {
    context.setCalibrationFieldProgress(issue, status, note, context.settings.operatorLabel)
  }

  function recordCalibrationAudit(input: {
    type: CalibrationAuditEventType
    summary: string
    issue?: CalibrationIssue
    projectId?: string | null
    targetId?: string | null
    field?: string
  }) {
    context.setCalibration((current) =>
      recordCalibrationAuditEvent(current, {
        type: input.type,
        summary: input.summary,
        operatorLabel: context.settings.operatorLabel,
        issueId: input.issue?.id,
        projectId: input.issue?.projectId ?? input.projectId,
        targetId: input.issue?.targetId ?? input.targetId,
        field: input.issue?.field ?? input.field,
      }),
    )
  }

  function saveCredentialReference(
    input: Pick<
      CalibrationCredentialReference,
      'label' | 'provider' | 'purpose' | 'projectIds' | 'targetIds' | 'notes'
    >,
  ) {
    return context.saveCredentialReference({
      ...input,
      operatorLabel: context.settings.operatorLabel,
    })
  }

  function applyCalibrationImport(preview: CalibrationImportPreview) {
    const result = applyCalibrationImportPreview({
      workspace: context.workspace,
      dispatch: context.dispatch,
      calibration: context.calibration,
      preview,
      operatorLabel: context.settings.operatorLabel,
    })
    context.setWorkspace(result.workspace)
    context.setDispatch(result.dispatch)
    context.setCalibration(result.calibration)
  }

  return {
    selectProject,
    updateManualState,
    updateDispatchTarget: context.updateTarget,
    updateDispatchReadiness: context.updateReadiness,
    updateDispatchAutomationReadiness: context.updateAutomationReadiness,
    runDispatchPreflight: runDispatchPreflightForTarget,
    runHostInspection,
    runHostInspections: (targetIds: string[]) =>
      Promise.all(targetIds.map((targetId) => runHostInspection(targetId))).then(() => undefined),
    runDeploymentVerification,
    runQueueEvidenceSweep,
    createReadinessReport,
    bindRepository,
    createInboxProject,
    unbindRepository,
    updateVerificationCadence,
    markVerified,
    requestWriting,
    openPlanning,
    openReview,
    createPlanningNoteFromReview,
    createWritingDraft,
    selectWritingDraft,
    restoreStores,
    createSnapshot,
    restoreSnapshot,
    updateCalibrationProgress,
    recordCalibrationAudit,
    saveCredentialReference,
    applyCalibrationImport,
  }
}
