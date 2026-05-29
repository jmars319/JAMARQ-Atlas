import { describe, expect, it } from 'vitest'
import type { OptimizationSnapshot } from '../src/domain/optimization'
import {
  addOptimizationSnapshot,
  bucketLabel,
  createOptimizationPlanningNote,
  emptyOptimizationState,
  getOptimizationSnapshotKind,
  groupAssessmentsByBucket,
  normalizeOptimizationState,
  parseOptimizationSnapshotJson,
  sortAssessmentsByScore,
  snapshotKindLabel,
  summarizeOptimizationState,
} from '../src/services/optimization'

const now = new Date('2026-05-10T12:00:00Z')

const snapshot: OptimizationSnapshot = {
  schemaVersion: 1,
  id: 'jamarq-optimization-test',
  title: 'JAMARQ Optimization Test',
  generatedAt: now.toISOString(),
  source: 'unit test',
  summary: {
    repoCount: 2,
    deepAuditCount: 1,
    skippedCount: 0,
    topRepoIds: ['atlas'],
  },
  assessments: [
    {
      repoId: 'template-website',
      repoName: 'Template Website',
      atlasProjectId: 'outlier-one-off-tools',
      registryStatus: 'template',
      deployModel: 'template',
      securityGate: 'blocking',
      priorityBucket: 'next',
      scorecard: {
        value: 4,
        urgency: 3,
        clientProductionImportance: 3,
        strategicLeverage: 5,
        maintenanceBurden: 2,
        readinessGap: 2,
        unblockPotential: 4,
        total: 23,
      },
      scoreRationale: 'Useful leverage but less urgent than Atlas.',
      criticalPath: 'Keep the template usable for client cPanel work.',
      releaseVersioning: 'Version examples with template changes.',
      observabilityRecovery: 'Document rollback expectations.',
      uxProductAudit: 'Audit the starter flows after major template changes.',
      consolidationRetirement: 'Do not retire; it is the current template.',
      reusablePatterns: 'Reusable cPanel packaging and deployment checks.',
      inspectionStatus: 'registry-docs-inspected',
      inspectionNotes: 'Unit test packet.',
    },
    {
      repoId: 'atlas',
      repoName: 'Atlas',
      atlasProjectId: 'jamarq-atlas',
      registryStatus: 'active',
      deployModel: 'local app',
      securityGate: 'blocking',
      priorityBucket: 'active-now',
      scorecard: {
        value: 5,
        urgency: 5,
        clientProductionImportance: 3,
        strategicLeverage: 5,
        maintenanceBurden: 2,
        readinessGap: 3,
        unblockPotential: 5,
        total: 28,
      },
      scoreRationale: 'Atlas turns the review into an operating interface.',
      criticalPath: 'Import and review the optimization packet.',
      releaseVersioning: 'Keep snapshot schema versioned.',
      observabilityRecovery: 'Include optimization state in backups and sync snapshots.',
      uxProductAudit: 'Make imported recommendations actionable without automatic status mutation.',
      consolidationRetirement: 'No repo lifecycle changes from Optimize.',
      reusablePatterns: 'Local snapshot import/export and planning-note creation.',
      inspectionStatus: 'deep-inspected',
      inspectionNotes: 'Unit test packet.',
    },
  ],
  recommendations: [
    {
      id: 'atlas-plan-note',
      repoId: 'atlas',
      atlasProjectId: 'jamarq-atlas',
      category: 'critical-path',
      priorityBucket: 'active-now',
      title: 'Review optimization snapshot in Atlas',
      detail: 'Import the generated packet and turn the first follow-up into a Planning note.',
    },
  ],
}

describe('optimization snapshots', () => {
  it('validates and normalizes optimization packet JSON', () => {
    const result = parseOptimizationSnapshotJson(JSON.stringify(snapshot))

    expect(result.ok).toBe(true)
    expect(result.snapshot?.summary.repoCount).toBe(2)
    expect(result.snapshot?.assessments).toHaveLength(2)
    expect(result.snapshot?.recommendations).toHaveLength(1)
  })

  it('rejects malformed or unsupported packets safely', () => {
    expect(parseOptimizationSnapshotJson('{not json').errors).toContain(
      'Optimization packet is not valid JSON.',
    )
    expect(
      parseOptimizationSnapshotJson(JSON.stringify({ ...snapshot, schemaVersion: 99 })).errors,
    ).toContain('Optimization packet must be schema v1 and include at least one assessment.')
  })

  it('stores snapshots, sorts scorecards, and groups by priority bucket', () => {
    const state = addOptimizationSnapshot(emptyOptimizationState(now), snapshot, now)
    const normalized = normalizeOptimizationState(state, now)
    const summary = summarizeOptimizationState(normalized)
    const sorted = sortAssessmentsByScore(snapshot.assessments)
    const grouped = groupAssessmentsByBucket(snapshot.assessments)

    expect(summary.snapshots).toBe(1)
    expect(summary.assessments).toBe(2)
    expect(sorted[0].repoId).toBe('atlas')
    expect(grouped.find((group) => group.bucket === 'active-now')?.assessments[0].repoId).toBe(
      'atlas',
    )
    expect(bucketLabel('probably-retire')).toBe('Probably Retire')
  })

  it('creates Planning note payloads from recommendations without mutating projects', () => {
    const note = createOptimizationPlanningNote(snapshot.recommendations[0])

    expect(note.title).toBe('Optimization: Review optimization snapshot in Atlas')
    expect(note.detail).toContain('Critical path recommendation')
    expect(note.detail).toContain('Import the generated packet')
  })

  it('recognizes boundary audit packets and labels their planning notes', () => {
    const boundarySnapshot: OptimizationSnapshot = {
      ...snapshot,
      id: 'app-boundary-audit-test',
      title: 'App Boundary Audit Test',
      source: 'Owner-confirmed boundary audit decisions',
    }
    const kind = getOptimizationSnapshotKind(boundarySnapshot)
    const note = createOptimizationPlanningNote(boundarySnapshot.recommendations[0], kind)

    expect(kind).toBe('app-boundary-audit')
    expect(snapshotKindLabel(kind)).toBe('Boundary audit')
    expect(note.title).toBe('Boundary: Review optimization snapshot in Atlas')
    expect(note.detail).toContain('boundary audit packet')
  })
})
