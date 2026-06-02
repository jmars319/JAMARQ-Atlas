import { AppViewBoundary } from '../components/AppViewBoundary'
import { ProjectDetail } from '../components/ProjectDetail'
import type { ProjectRecord } from '../domain/atlas'
import type {
  DispatchDeploySession,
  DispatchDeploySessionStep,
  DispatchDeploySessionStepKind,
  DispatchHostEvidenceRun,
  DispatchRecoveryPlan,
  DispatchState,
  DispatchVerificationEvidenceRun,
} from '../domain/dispatch'
import type { PlanningState } from '../domain/planning'
import type { ReportsState } from '../domain/reports'
import type { ReviewState } from '../domain/review'
import type { TimelineEvent } from '../domain/timeline'
import type { WritingDraft } from '../domain/writing'
import type { CalibrationCredentialReference } from '../domain/calibration'
import type { DeploySessionChecklistPresetId } from '../services/deploySessions'
import type { createAtlasActions } from '../services/atlasActions'
import type { useLocalDispatch } from '../hooks/useLocalDispatch'
import type { useLocalReview } from '../hooks/useLocalReview'
import type { useLocalWorkspace } from '../hooks/useLocalWorkspace'

type AtlasActions = ReturnType<typeof createAtlasActions>
type LocalDispatch = ReturnType<typeof useLocalDispatch>
type LocalReview = ReturnType<typeof useLocalReview>
type LocalWorkspace = ReturnType<typeof useLocalWorkspace>

interface ProjectInspectorRouteProps {
  selectedRecord: ProjectRecord | undefined
  dispatch: DispatchState
  planning: PlanningState
  reports: ReportsState
  review: ReviewState
  credentialReferences: CalibrationCredentialReference[]
  writingDrafts: WritingDraft[]
  timelineEvents: TimelineEvent[]
  actions: AtlasActions
  resetWorkspace: LocalWorkspace['resetWorkspace']
  updateDeploymentArtifact: LocalDispatch['updateDeploymentArtifact']
  updateDeploymentPreservePath: LocalDispatch['updateDeploymentPreservePath']
  updateDeploymentVerificationCheck: LocalDispatch['updateDeploymentVerificationCheck']
  updateRecoveryPlan: LocalDispatch['updateRecoveryPlan']
  createDeploySession: LocalDispatch['createDeploySession']
  updateDeploySessionFields: LocalDispatch['updateDeploySessionFields']
  updateDeploySessionStepFields: LocalDispatch['updateDeploySessionStepFields']
  recordManualDeployment: LocalDispatch['recordManualDeployment']
  attachDeploySessionEvidence: LocalDispatch['attachDeploySessionEvidence']
  applyDeploySessionPreset: LocalDispatch['applyDeploySessionPreset']
  addHostEvidenceRun: LocalDispatch['addHostEvidenceRun']
  addVerificationEvidenceRun: LocalDispatch['addVerificationEvidenceRun']
  addReviewNote: LocalReview['addNote']
  preflightRunningTargetId: string
}

export function ProjectInspectorRoute({
  selectedRecord,
  dispatch,
  planning,
  reports,
  review,
  credentialReferences,
  writingDrafts,
  timelineEvents,
  actions,
  resetWorkspace,
  updateDeploymentArtifact,
  updateDeploymentPreservePath,
  updateDeploymentVerificationCheck,
  updateRecoveryPlan,
  createDeploySession,
  updateDeploySessionFields,
  updateDeploySessionStepFields,
  recordManualDeployment,
  attachDeploySessionEvidence,
  applyDeploySessionPreset,
  addHostEvidenceRun,
  addVerificationEvidenceRun,
  addReviewNote,
  preflightRunningTargetId,
}: ProjectInspectorRouteProps) {
  if (!selectedRecord) {
    return null
  }

  return (
    <AppViewBoundary viewKey={`project-${selectedRecord.project.id}`} title="Project detail">
      <ProjectDetail
        record={selectedRecord}
        dispatch={dispatch}
        planning={planning}
        reports={reports}
        review={review}
        credentialReferences={credentialReferences}
        writingDrafts={writingDrafts}
        timelineEvents={timelineEvents.filter(
          (event) => event.projectId === selectedRecord.project.id,
        )}
        onManualChange={actions.updateManualState}
        onDispatchTargetChange={actions.updateDispatchTarget}
        onDispatchReadinessChange={actions.updateDispatchReadiness}
        onDispatchAutomationReadinessChange={actions.updateDispatchAutomationReadiness}
        onDeploymentArtifactChange={updateDeploymentArtifact}
        onDeploymentPreservePathChange={updateDeploymentPreservePath}
        onDeploymentVerificationCheckChange={updateDeploymentVerificationCheck}
        onRecoveryPlanChange={(targetId: string, update: Partial<DispatchRecoveryPlan>) =>
          updateRecoveryPlan(targetId, update)
        }
        onStartDeploySession={createDeploySession}
        onDeploySessionChange={(
          sessionId: string,
          update: Partial<
            Pick<
              DispatchDeploySession,
              | 'versionLabel'
              | 'sourceRef'
              | 'commitSha'
              | 'artifactName'
              | 'deployedBy'
              | 'summary'
              | 'recordStatus'
              | 'rollbackRef'
              | 'databaseBackupRef'
            >
          >,
        ) => updateDeploySessionFields(sessionId, update)}
        onDeploySessionStepChange={(
          sessionId: string,
          stepId: string,
          update: Partial<Pick<DispatchDeploySessionStep, 'status' | 'notes' | 'evidence'>>,
        ) => updateDeploySessionStepFields(sessionId, stepId, update)}
        onRecordManualDeployment={recordManualDeployment}
        onAttachDeploySessionEvidence={(
          sessionId: string,
          stepKind: DispatchDeploySessionStepKind,
          label: string,
          detail: string,
        ) => attachDeploySessionEvidence(sessionId, stepKind, label, detail)}
        onApplyDeploySessionPreset={(
          sessionId: string,
          presetId: DeploySessionChecklistPresetId,
        ) => applyDeploySessionPreset(sessionId, presetId)}
        onHostEvidenceRunAdd={(run: DispatchHostEvidenceRun) => addHostEvidenceRun(run)}
        onVerificationEvidenceRunAdd={(run: DispatchVerificationEvidenceRun) =>
          addVerificationEvidenceRun(run)
        }
        onRunDispatchPreflight={actions.runDispatchPreflight}
        preflightRunningTargetId={preflightRunningTargetId}
        onRepositoryUnbind={actions.unbindRepository}
        onVerificationCadenceChange={actions.updateVerificationCadence}
        onMarkVerified={actions.markVerified}
        onWritingRequest={actions.requestWriting}
        onOpenWritingDraft={actions.selectWritingDraft}
        onOpenPlanning={actions.openPlanning}
        onOpenReview={() => actions.openReview(selectedRecord.project.id)}
        onAddReviewNote={addReviewNote}
        onResetWorkspace={resetWorkspace}
      />
    </AppViewBoundary>
  )
}
