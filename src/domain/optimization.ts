export const ATLAS_OPTIMIZATION_SCHEMA_VERSION = 1

export type AtlasOptimizationSchemaVersion = typeof ATLAS_OPTIMIZATION_SCHEMA_VERSION

export type OptimizationPriorityBucket =
  | 'active-now'
  | 'next'
  | 'later'
  | 'blocked'
  | 'maintenance-only'
  | 'probably-retire'

export type OptimizationRecommendationCategory =
  | 'critical-path'
  | 'release'
  | 'observability'
  | 'ux-product'
  | 'consolidation-retirement'
  | 'reusable-pattern'

export type OptimizationInspectionStatus =
  | 'deep-inspected'
  | 'registry-docs-inspected'
  | 'skipped-dirty'
  | 'skipped-preflight'

export interface OptimizationScorecard {
  value: number
  urgency: number
  clientProductionImportance: number
  strategicLeverage: number
  maintenanceBurden: number
  readinessGap: number
  unblockPotential: number
  total: number
}

export interface OptimizationAssessment {
  repoId: string
  repoName: string
  atlasProjectId: string
  registryStatus: string
  deployModel: string
  securityGate: string
  priorityBucket: OptimizationPriorityBucket
  scorecard: OptimizationScorecard
  scoreRationale: string
  criticalPath: string
  releaseVersioning: string
  observabilityRecovery: string
  uxProductAudit: string
  consolidationRetirement: string
  reusablePatterns: string
  inspectionStatus: OptimizationInspectionStatus
  inspectionNotes: string
}

export interface OptimizationRecommendation {
  id: string
  repoId: string
  atlasProjectId: string
  category: OptimizationRecommendationCategory
  priorityBucket: OptimizationPriorityBucket
  title: string
  detail: string
}

export interface OptimizationSnapshotSummary {
  repoCount: number
  deepAuditCount: number
  skippedCount: number
  topRepoIds: string[]
}

export interface OptimizationSnapshot {
  schemaVersion: AtlasOptimizationSchemaVersion
  id: string
  title: string
  generatedAt: string
  source: string
  summary: OptimizationSnapshotSummary
  assessments: OptimizationAssessment[]
  recommendations: OptimizationRecommendation[]
}

export interface AtlasOptimizationState {
  schemaVersion: AtlasOptimizationSchemaVersion
  snapshots: OptimizationSnapshot[]
  selectedSnapshotId: string
  updatedAt: string
}
