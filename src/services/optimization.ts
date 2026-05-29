import {
  ATLAS_OPTIMIZATION_SCHEMA_VERSION,
  type AtlasOptimizationState,
  type OptimizationAssessment,
  type OptimizationPriorityBucket,
  type OptimizationRecommendation,
  type OptimizationRecommendationCategory,
  type OptimizationSnapshot,
} from '../domain/optimization'

const PRIORITY_BUCKETS: OptimizationPriorityBucket[] = [
  'active-now',
  'next',
  'later',
  'blocked',
  'maintenance-only',
  'probably-retire',
]

const RECOMMENDATION_CATEGORIES: OptimizationRecommendationCategory[] = [
  'critical-path',
  'release',
  'observability',
  'ux-product',
  'consolidation-retirement',
  'reusable-pattern',
]

export type OptimizationSnapshotKind = 'portfolio-optimization' | 'app-boundary-audit'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function readBucket(value: unknown): OptimizationPriorityBucket {
  return PRIORITY_BUCKETS.includes(value as OptimizationPriorityBucket)
    ? (value as OptimizationPriorityBucket)
    : 'later'
}

function readCategory(value: unknown): OptimizationRecommendationCategory {
  return RECOMMENDATION_CATEGORIES.includes(value as OptimizationRecommendationCategory)
    ? (value as OptimizationRecommendationCategory)
    : 'critical-path'
}

function normalizeScorecard(value: unknown) {
  const record = isRecord(value) ? value : {}
  const scorecard = {
    value: readNumber(record.value),
    urgency: readNumber(record.urgency),
    clientProductionImportance: readNumber(record.clientProductionImportance),
    strategicLeverage: readNumber(record.strategicLeverage),
    maintenanceBurden: readNumber(record.maintenanceBurden),
    readinessGap: readNumber(record.readinessGap),
    unblockPotential: readNumber(record.unblockPotential),
    total: readNumber(record.total),
  }
  const calculatedTotal =
    scorecard.value +
    scorecard.urgency +
    scorecard.clientProductionImportance +
    scorecard.strategicLeverage +
    scorecard.maintenanceBurden +
    scorecard.readinessGap +
    scorecard.unblockPotential

  return {
    ...scorecard,
    total: scorecard.total || calculatedTotal,
  }
}

function normalizeAssessment(value: unknown): OptimizationAssessment | null {
  if (!isRecord(value)) {
    return null
  }

  const repoId = readString(value.repoId)
  const repoName = readString(value.repoName)

  if (!repoId || !repoName) {
    return null
  }

  const inspectionStatus = readString(value.inspectionStatus)

  return {
    repoId,
    repoName,
    atlasProjectId: readString(value.atlasProjectId),
    registryStatus: readString(value.registryStatus),
    deployModel: readString(value.deployModel),
    securityGate: readString(value.securityGate),
    priorityBucket: readBucket(value.priorityBucket),
    scorecard: normalizeScorecard(value.scorecard),
    scoreRationale: readString(value.scoreRationale),
    criticalPath: readString(value.criticalPath),
    releaseVersioning: readString(value.releaseVersioning),
    observabilityRecovery: readString(value.observabilityRecovery),
    uxProductAudit: readString(value.uxProductAudit),
    consolidationRetirement: readString(value.consolidationRetirement),
    reusablePatterns: readString(value.reusablePatterns),
    inspectionStatus:
      inspectionStatus === 'deep-inspected' ||
      inspectionStatus === 'registry-docs-inspected' ||
      inspectionStatus === 'skipped-dirty' ||
      inspectionStatus === 'skipped-preflight'
        ? inspectionStatus
        : 'registry-docs-inspected',
    inspectionNotes: readString(value.inspectionNotes),
  }
}

function normalizeRecommendation(value: unknown): OptimizationRecommendation | null {
  if (!isRecord(value)) {
    return null
  }

  const id = readString(value.id)
  const repoId = readString(value.repoId)
  const title = readString(value.title)

  if (!id || !repoId || !title) {
    return null
  }

  return {
    id,
    repoId,
    atlasProjectId: readString(value.atlasProjectId),
    category: readCategory(value.category),
    priorityBucket: readBucket(value.priorityBucket),
    title,
    detail: readString(value.detail),
  }
}

export function emptyOptimizationState(now = new Date()): AtlasOptimizationState {
  return {
    schemaVersion: ATLAS_OPTIMIZATION_SCHEMA_VERSION,
    snapshots: [],
    selectedSnapshotId: '',
    updatedAt: now.toISOString(),
  }
}

export function normalizeOptimizationSnapshot(value: unknown): OptimizationSnapshot | null {
  if (!isRecord(value)) {
    return null
  }

  if (value.schemaVersion !== ATLAS_OPTIMIZATION_SCHEMA_VERSION) {
    return null
  }

  const id = readString(value.id)
  const title = readString(value.title)
  const assessments = Array.isArray(value.assessments)
    ? value.assessments
        .map((assessment) => normalizeAssessment(assessment))
        .filter((assessment): assessment is OptimizationAssessment => assessment !== null)
    : []
  const recommendations = Array.isArray(value.recommendations)
    ? value.recommendations
        .map((recommendation) => normalizeRecommendation(recommendation))
        .filter((recommendation): recommendation is OptimizationRecommendation => recommendation !== null)
    : []

  if (!id || !title || assessments.length === 0) {
    return null
  }

  const generatedAt = readString(value.generatedAt)
  const summary = isRecord(value.summary) ? value.summary : {}
  const deepAuditCount = assessments.filter(
    (assessment) => assessment.inspectionStatus === 'deep-inspected',
  ).length
  const skippedCount = assessments.filter((assessment) =>
    assessment.inspectionStatus.startsWith('skipped'),
  ).length

  return {
    schemaVersion: ATLAS_OPTIMIZATION_SCHEMA_VERSION,
    id,
    title,
    generatedAt:
      generatedAt && !Number.isNaN(Date.parse(generatedAt))
        ? generatedAt
        : new Date().toISOString(),
    source: readString(value.source) || 'Imported optimization packet',
    summary: {
      repoCount: readNumber(summary.repoCount) || assessments.length,
      deepAuditCount: readNumber(summary.deepAuditCount) || deepAuditCount,
      skippedCount: readNumber(summary.skippedCount) || skippedCount,
      topRepoIds: Array.isArray(summary.topRepoIds)
        ? summary.topRepoIds.map((item) => readString(item)).filter(Boolean)
        : sortAssessmentsByScore(assessments)
            .slice(0, 8)
            .map((assessment) => assessment.repoId),
    },
    assessments,
    recommendations,
  }
}

export function normalizeOptimizationState(value: unknown, now = new Date()): AtlasOptimizationState {
  const defaults = emptyOptimizationState(now)

  if (!isRecord(value)) {
    return defaults
  }

  const snapshots = Array.isArray(value.snapshots)
    ? value.snapshots
        .map((snapshot) => normalizeOptimizationSnapshot(snapshot))
        .filter((snapshot): snapshot is OptimizationSnapshot => snapshot !== null)
    : []
  const selectedSnapshotId = readString(value.selectedSnapshotId)
  const selected = snapshots.some((snapshot) => snapshot.id === selectedSnapshotId)
    ? selectedSnapshotId
    : snapshots[0]?.id ?? ''

  return {
    schemaVersion: ATLAS_OPTIMIZATION_SCHEMA_VERSION,
    snapshots,
    selectedSnapshotId: selected,
    updatedAt: readString(value.updatedAt) || now.toISOString(),
  }
}

export function parseOptimizationSnapshotJson(text: string): {
  ok: boolean
  snapshot: OptimizationSnapshot | null
  errors: string[]
} {
  try {
    const snapshot = normalizeOptimizationSnapshot(JSON.parse(text))

    if (!snapshot) {
      return {
        ok: false,
        snapshot: null,
        errors: ['Optimization packet must be schema v1 and include at least one assessment.'],
      }
    }

    return { ok: true, snapshot, errors: [] }
  } catch {
    return {
      ok: false,
      snapshot: null,
      errors: ['Optimization packet is not valid JSON.'],
    }
  }
}

export function addOptimizationSnapshot(
  state: AtlasOptimizationState,
  snapshot: OptimizationSnapshot,
  now = new Date(),
): AtlasOptimizationState {
  return {
    schemaVersion: ATLAS_OPTIMIZATION_SCHEMA_VERSION,
    snapshots: [snapshot, ...state.snapshots.filter((existing) => existing.id !== snapshot.id)],
    selectedSnapshotId: snapshot.id,
    updatedAt: now.toISOString(),
  }
}

export function sortAssessmentsByScore(assessments: OptimizationAssessment[]) {
  return [...assessments].sort((left, right) => {
    const scoreDiff = right.scorecard.total - left.scorecard.total

    return scoreDiff || left.repoName.localeCompare(right.repoName)
  })
}

export function groupAssessmentsByBucket(assessments: OptimizationAssessment[]) {
  return PRIORITY_BUCKETS.map((bucket) => ({
    bucket,
    assessments: sortAssessmentsByScore(
      assessments.filter((assessment) => assessment.priorityBucket === bucket),
    ),
  }))
}

export function bucketLabel(bucket: OptimizationPriorityBucket) {
  const labels: Record<OptimizationPriorityBucket, string> = {
    'active-now': 'Active Now',
    next: 'Next',
    later: 'Later',
    blocked: 'Blocked',
    'maintenance-only': 'Maintenance Only',
    'probably-retire': 'Probably Retire',
  }

  return labels[bucket]
}

export function categoryLabel(category: OptimizationRecommendationCategory) {
  const labels: Record<OptimizationRecommendationCategory, string> = {
    'critical-path': 'Critical path',
    release: 'Release',
    observability: 'Observability',
    'ux-product': 'UX/product',
    'consolidation-retirement': 'Consolidation',
    'reusable-pattern': 'Reusable pattern',
  }

  return labels[category]
}

export function getOptimizationSnapshotKind(
  snapshot: Pick<OptimizationSnapshot, 'id' | 'title' | 'source'>,
): OptimizationSnapshotKind {
  const searchable = [snapshot.id, snapshot.title, snapshot.source].join(' ').toLowerCase()

  return searchable.includes('app-boundary-audit') ||
    (searchable.includes('boundary') && searchable.includes('audit'))
    ? 'app-boundary-audit'
    : 'portfolio-optimization'
}

export function snapshotKindLabel(kind: OptimizationSnapshotKind) {
  const labels: Record<OptimizationSnapshotKind, string> = {
    'portfolio-optimization': 'Portfolio optimization',
    'app-boundary-audit': 'Boundary audit',
  }

  return labels[kind]
}

export function summarizeOptimizationState(state: AtlasOptimizationState) {
  const selected =
    state.snapshots.find((snapshot) => snapshot.id === state.selectedSnapshotId) ??
    state.snapshots[0] ??
    null

  return {
    snapshots: state.snapshots.length,
    selected,
    assessments: selected?.assessments.length ?? 0,
    recommendations: selected?.recommendations.length ?? 0,
  }
}

export function createOptimizationPlanningNote(
  recommendation: OptimizationRecommendation,
  snapshotKind: OptimizationSnapshotKind = 'portfolio-optimization',
) {
  const isBoundaryAudit = snapshotKind === 'app-boundary-audit'

  return {
    title: `${isBoundaryAudit ? 'Boundary' : 'Optimization'}: ${recommendation.title}`,
    detail: `${categoryLabel(recommendation.category)} recommendation from ${
      isBoundaryAudit ? 'boundary audit packet' : 'optimization snapshot'
    }.\n\n${recommendation.detail}`,
  }
}
