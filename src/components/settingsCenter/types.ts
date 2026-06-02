import type { Workspace } from '../../domain/atlas'
import type {
  AtlasCalibrationState,
  CalibrationAuditEventType,
  CalibrationCredentialReference,
  CalibrationFieldStatus,
} from '../../domain/calibration'
import type { DeploymentTarget, DispatchState } from '../../domain/dispatch'
import type { AtlasOptimizationState } from '../../domain/optimization'
import type { AtlasPlanningState } from '../../domain/planning'
import type { ReportsState } from '../../domain/reports'
import type { ReviewState } from '../../domain/review'
import type { AtlasSettingsState } from '../../domain/settings'
import type {
  AtlasRemoteSyncSnapshot,
  AtlasSyncCoreStores,
  AtlasSyncProviderState,
  AtlasSyncState,
} from '../../domain/sync'
import type { WritingWorkbenchState } from '../../domain/writing'
import type { CalibrationImportPreview, CalibrationIssue } from '../../services/calibration'

export interface SettingsCenterProps {
  settings: AtlasSettingsState
  workspace: Workspace
  dispatch: DispatchState
  writing: WritingWorkbenchState
  planning: AtlasPlanningState
  reports: ReportsState
  review: ReviewState
  calibration: AtlasCalibrationState
  optimization: AtlasOptimizationState
  sync: AtlasSyncState
  onSettingsChange: (
    update: Partial<Pick<AtlasSettingsState, 'deviceLabel' | 'operatorLabel' | 'notes'>>,
  ) => void
  onDispatchTargetChange: (targetId: string, update: Partial<DeploymentTarget>) => void
  onCalibrationProgressChange: (
    issue: CalibrationIssue,
    status: CalibrationFieldStatus,
    note: string,
  ) => void
  onCalibrationAudit: (input: {
    type: CalibrationAuditEventType
    summary: string
    issue?: CalibrationIssue
    projectId?: string | null
    targetId?: string | null
    field?: string
  }) => void
  onCredentialReferenceSave: (
    input: Pick<
      CalibrationCredentialReference,
      'label' | 'provider' | 'purpose' | 'projectIds' | 'targetIds' | 'notes'
    >,
  ) => { ok: boolean; message: string }
  onCredentialReferenceDelete: (referenceId: string) => void
  onApplyCalibrationImport: (preview: CalibrationImportPreview) => void
  onCreateSnapshot: (label: string, note: string) => void
  onDeleteSnapshot: (snapshotId: string) => void
  onRestoreSnapshot: (stores: AtlasSyncCoreStores) => void
  onSyncProviderChange: (update: Partial<AtlasSyncProviderState>) => void
  onRecordRemoteSnapshots: (snapshots: AtlasRemoteSyncSnapshot[]) => void
  onRecordRemotePush: (snapshot: AtlasRemoteSyncSnapshot) => void
  onRemoveRemoteSnapshot: (snapshotId: string) => void
}
