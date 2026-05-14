import type { DataIntegritySeverity } from './dataIntegrity'

export type OperationsReadinessGrade = 'ready' | 'attention' | 'blocked'

export type OperationsActionId =
  | 'open-project'
  | 'open-dispatch-target'
  | 'open-calibration'
  | 'open-data-center'
  | 'run-read-only-evidence-sweep'
  | 'start-manual-deploy-session'
  | 'create-planning-follow-up'
  | 'create-report-packet'
  | 'create-local-snapshot'

export interface OperationsAction {
  id: OperationsActionId
  label: string
  projectId?: string
  targetId?: string
  reportType?: string
}

export type OperationsQueueReasonId =
  | 'data-integrity'
  | 'calibration'
  | 'snapshot'
  | 'missing-evidence'
  | 'stale-evidence'
  | 'verification'
  | 'active-session'
  | 'closeout'
  | 'recovery'
  | 'artifacts'

export interface OperationsQueueReason {
  id: OperationsQueueReasonId
  label: string
  grade: OperationsReadinessGrade
  priority: number
  detail: string
  affectedCount?: number
  sourceSeverity?: DataIntegritySeverity
}

export interface OperationsQueueItem {
  id: string
  label: string
  grade: OperationsReadinessGrade
  score: number
  projectId?: string
  projectName?: string
  targetId?: string
  targetName?: string
  summary: string
  reasons: OperationsQueueReason[]
  actions: OperationsAction[]
  updatedAt: string
}

export interface OperationsCockpitCounts {
  projects: number
  dispatchTargets: number
  readyTargets: number
  attentionTargets: number
  blockedTargets: number
  dataIntegrityDanger: number
  dataIntegrityWarnings: number
  calibrationBlocked: number
  calibrationAttention: number
  missingEvidence: number
  staleEvidence: number
  overdueVerification: number
  activeSessions: number
  closeoutGaps: number
  recoveryGaps: number
  currentRecoveryPlans: number
  missingSnapshots: number
  staleSnapshots: number
  syncWarnings: number
}

export interface OperationsCockpitSummary {
  generatedAt: string
  grade: OperationsReadinessGrade
  staleEvidenceDays: number
  staleSnapshotDays: number
  latestSnapshotAt: string | null
  counts: OperationsCockpitCounts
  queue: OperationsQueueItem[]
  warnings: string[]
}
