import { describe, expect, test } from 'vitest'
import { seedWorkspace } from '../src/data/seedWorkspace'
import { seedDispatchState } from '../src/data/seedDispatch'
import { emptyCalibrationState } from '../src/services/calibration'
import { emptyPlanningStore } from '../src/services/planning'
import { emptyReportsStore } from '../src/services/reports'
import { emptyReviewStore } from '../src/services/review'
import { createDataIntegrityDiagnostics } from '../src/services/dataIntegrity'
import { emptyWritingState } from '../src/domain/writing'

describe('dataIntegrity', () => {
  test('reports missing Dispatch project and target references without mutating state', () => {
    const dispatch = {
      ...seedDispatchState,
      records: [
        {
          ...seedDispatchState.records[0],
          id: 'stale-record',
          projectId: 'missing-project',
          targetId: 'missing-target',
        },
      ],
    }

    const diagnostics = createDataIntegrityDiagnostics({
      workspace: seedWorkspace,
      dispatch,
      writing: emptyWritingState,
      planning: emptyPlanningStore(),
      reports: emptyReportsStore(),
      review: emptyReviewStore(),
      calibration: emptyCalibrationState(),
    })

    expect(diagnostics.map((diagnostic) => diagnostic.id)).toEqual(
      expect.arrayContaining(['dispatch-missing-projects', 'dispatch-missing-targets']),
    )
    expect(
      diagnostics.find((diagnostic) => diagnostic.id === 'dispatch-missing-targets')?.affectedIds,
    ).toContain('stale-record')
  })

  test('reports stale report and calibration links', () => {
    const reports = {
      ...emptyReportsStore(),
      packets: [
        {
          id: 'report-stale',
          type: 'internal-weekly-packet' as const,
          title: 'Stale report',
          status: 'draft' as const,
          projectIds: ['missing-project'],
          writingDraftIds: ['missing-draft'],
          reviewNoteIds: [],
          reviewSessionIds: [],
          markdown: '',
          sourceSummary: [],
          contextWarnings: [],
          auditEvents: [],
          createdAt: '2026-05-13T00:00:00Z',
          updatedAt: '2026-05-13T00:00:00Z',
          exportedAt: null,
        },
      ],
    }
    const calibration = {
      ...emptyCalibrationState(),
      credentialReferences: [
        {
          id: 'credential-stale',
          label: 'stale',
          provider: '',
          purpose: '',
          projectIds: ['missing-project'],
          targetIds: ['missing-target'],
          notes: '',
          createdAt: '2026-05-13T00:00:00Z',
          updatedAt: '2026-05-13T00:00:00Z',
        },
      ],
    }

    const diagnostics = createDataIntegrityDiagnostics({
      workspace: seedWorkspace,
      dispatch: seedDispatchState,
      writing: emptyWritingState,
      planning: emptyPlanningStore(),
      reports,
      review: emptyReviewStore(),
      calibration,
    })

    expect(
      diagnostics.find((diagnostic) => diagnostic.id === 'reports-stale-links')?.affectedIds,
    ).toContain('report-stale')
    expect(
      diagnostics.find((diagnostic) => diagnostic.id === 'calibration-stale-links')?.affectedIds,
    ).toContain('credential-stale')
  })
})
