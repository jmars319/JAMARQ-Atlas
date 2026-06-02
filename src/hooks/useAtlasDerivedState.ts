import { useMemo } from 'react'
import { flattenProjects, type Workspace } from '../domain/atlas'
import type { AtlasCalibrationState } from '../domain/calibration'
import type { DispatchState } from '../domain/dispatch'
import type { AtlasOptimizationState } from '../domain/optimization'
import type { PlanningState } from '../domain/planning'
import type { RepoOperationsState } from '../domain/repoOperations'
import type { RepoWorkflowRunsState } from '../domain/repoWorkflowRuns'
import type { ReportsState } from '../domain/reports'
import type { ReviewState } from '../domain/review'
import type { AtlasSyncState } from '../domain/sync'
import type { WritingWorkbenchState } from '../domain/writing'
import { scanAtlasCalibration } from '../services/calibration'
import { createDataIntegrityDiagnostics } from '../services/dataIntegrity'
import { deriveRepoOperationsRows } from '../services/repoOperations'
import { deriveTimelineEvents } from '../services/timeline'

interface AtlasDerivedStateInput {
  workspace: Workspace
  dispatch: DispatchState
  calibration: AtlasCalibrationState
  sync: AtlasSyncState
  writing: WritingWorkbenchState
  planning: PlanningState
  optimization: AtlasOptimizationState
  reports: ReportsState
  review: ReviewState
  repoOperations: RepoOperationsState
  repoWorkflowRuns: RepoWorkflowRunsState
}

export function useAtlasDerivedState({
  workspace,
  dispatch,
  calibration,
  sync,
  writing,
  planning,
  optimization,
  reports,
  review,
  repoOperations,
  repoWorkflowRuns,
}: AtlasDerivedStateInput) {
  const projectRecords = useMemo(() => flattenProjects(workspace), [workspace])
  const calibrationIssues = useMemo(
    () =>
      scanAtlasCalibration(
        workspace,
        dispatch,
        undefined,
        calibration.credentialReferences.map((reference) => reference.label),
      ),
    [calibration.credentialReferences, dispatch, workspace],
  )
  const timelineEvents = useMemo(
    () =>
      deriveTimelineEvents({
        projectRecords,
        dispatch,
        writing,
        planning,
        reports,
        review,
        calibration,
        sync,
      }),
    [calibration, dispatch, planning, projectRecords, reports, review, sync, writing],
  )
  const dataIntegrityDiagnostics = useMemo(
    () =>
      createDataIntegrityDiagnostics({
        workspace,
        dispatch,
        writing,
        planning,
        reports,
        review,
        calibration,
      }),
    [calibration, dispatch, planning, reports, review, workspace, writing],
  )
  const repoOperationsRows = useMemo(
    () =>
      deriveRepoOperationsRows({
        state: repoOperations,
        projectRecords,
        commandSummaries: [],
        workflowRuns: repoWorkflowRuns.runs,
      }),
    [projectRecords, repoOperations, repoWorkflowRuns.runs],
  )

  return {
    projectRecords,
    calibrationIssues,
    timelineEvents,
    dataIntegrityDiagnostics,
    repoOperationsRows,
    optimization,
  }
}
