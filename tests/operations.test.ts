import { describe, expect, test } from 'vitest'
import { seedDispatchState } from '../src/data/seedDispatch'
import { seedWorkspace } from '../src/data/seedWorkspace'
import type { DataIntegrityDiagnostic } from '../src/domain/dataIntegrity'
import type { DispatchState } from '../src/domain/dispatch'
import { emptyWritingState } from '../src/domain/writing'
import { emptyCalibrationState } from '../src/services/calibration'
import { emptyPlanningStore } from '../src/services/planning'
import { emptyReportsStore } from '../src/services/reports'
import { emptyReviewStore } from '../src/services/review'
import { emptySettingsState } from '../src/services/settings'
import { createSyncSnapshot, emptySyncState } from '../src/services/syncSnapshots'
import { createOperationsCockpitSummary } from '../src/services/operations'

const now = new Date('2026-05-13T12:00:00Z')

function cloneDispatch(state: DispatchState = seedDispatchState): DispatchState {
  return JSON.parse(JSON.stringify(state)) as DispatchState
}

function syncWithSnapshot(createdAt = now) {
  const sync = emptySyncState(now)

  return {
    ...sync,
    snapshots: [
      createSyncSnapshot({
        stores: {
          workspace: seedWorkspace,
          dispatch: seedDispatchState,
          writing: emptyWritingState,
          planning: emptyPlanningStore(),
          reports: emptyReportsStore(now),
          review: emptyReviewStore(),
          calibration: emptyCalibrationState(now),
        },
        settings: emptySettingsState(),
        sync,
        label: 'Daily snapshot',
        note: '',
        now: createdAt,
      }),
    ],
  }
}

function operationsSummary({
  dispatch = seedDispatchState,
  sync = emptySyncState(now),
  diagnostics = [],
}: {
  dispatch?: DispatchState
  sync?: ReturnType<typeof emptySyncState>
  diagnostics?: DataIntegrityDiagnostic[]
} = {}) {
  return createOperationsCockpitSummary({
    workspace: seedWorkspace,
    dispatch,
    reports: emptyReportsStore(now),
    sync,
    calibration: emptyCalibrationState(now),
    calibrationIssues: [],
    dataIntegrityDiagnostics: diagnostics,
    now,
  })
}

describe('operations cockpit summary', () => {
  test('sorts data integrity danger ahead of daily operational gaps', () => {
    const diagnostics: DataIntegrityDiagnostic[] = [
      {
        id: 'dispatch-missing-projects',
        label: 'Dispatch references missing projects',
        severity: 'danger',
        storeId: 'dispatch',
        affectedCount: 1,
        affectedIds: ['stale-record'],
        detail: 'Dispatch evidence points at a missing project.',
        repairSuggestion: 'Restore the project or preserve then remove stale Dispatch records.',
      },
    ]

    const summary = operationsSummary({ diagnostics })

    expect(summary.grade).toBe('blocked')
    expect(summary.queue[0]?.id).toBe('data-integrity:danger')
    expect(summary.counts.dataIntegrityDanger).toBe(1)
  })

  test('flags host, preflight, and verification evidence as stale after seven days', () => {
    const dispatch = cloneDispatch()
    const target = dispatch.targets[0]
    const runbook = dispatch.runbooks.find((candidate) => candidate.targetId === target.id)!
    const oldEvidenceAt = '2026-05-01T12:00:00Z'

    dispatch.preflightRuns = [
      {
        id: 'old-preflight',
        projectId: target.projectId,
        targetId: target.id,
        startedAt: oldEvidenceAt,
        completedAt: oldEvidenceAt,
        status: 'passing',
        summary: 'Old read-only preflight passed.',
        checks: [],
      },
    ]
    dispatch.hostEvidenceRuns = [
      {
        id: 'old-host',
        source: 'host-preflight',
        projectId: target.projectId,
        targetId: target.id,
        startedAt: oldEvidenceAt,
        completedAt: oldEvidenceAt,
        status: 'passing',
        summary: 'Old host inspection passed.',
        credentialRef: target.credentialRef,
        probeMode: 'local-mirror',
        authMethod: 'none',
        checks: [],
        warnings: [],
      },
    ]
    dispatch.verificationEvidenceRuns = [
      {
        id: 'old-verification',
        source: 'runbook-verification',
        projectId: target.projectId,
        targetId: target.id,
        runbookId: runbook.id,
        startedAt: oldEvidenceAt,
        completedAt: oldEvidenceAt,
        status: 'passing',
        summary: 'Old runbook verification passed.',
        checks: [],
        warnings: [],
      },
    ]

    const summary = operationsSummary({ dispatch, sync: syncWithSnapshot(now) })
    const targetItem = summary.queue.find((item) => item.targetId === target.id)

    expect(summary.counts.staleEvidence).toBeGreaterThan(0)
    expect(targetItem?.reasons.map((reason) => reason.id)).toContain('stale-evidence')
  })

  test('treats hosted sync absence as a warning instead of a blocking queue item', () => {
    const summary = operationsSummary({ sync: syncWithSnapshot(now) })

    expect(summary.counts.syncWarnings).toBe(1)
    expect(summary.warnings.join(' ')).toContain('Hosted sync is optional')
    expect(summary.queue.map((item) => item.id)).not.toContain('sync:provider')
  })

  test('tracks local snapshot freshness as daily readiness', () => {
    const fresh = operationsSummary({ sync: syncWithSnapshot(now) })
    const stale = operationsSummary({ sync: syncWithSnapshot(new Date('2026-05-01T12:00:00Z')) })

    expect(fresh.counts.missingSnapshots).toBe(0)
    expect(fresh.counts.staleSnapshots).toBe(0)
    expect(stale.counts.staleSnapshots).toBe(1)
    expect(stale.queue.find((item) => item.id === 'sync:snapshot-stale')).toBeTruthy()
  })
})
