import { describe, expect, test } from 'vitest'
import { seedDispatchState } from '../src/data/seedDispatch'
import { seedWorkspace } from '../src/data/seedWorkspace'
import { emptyCalibrationState } from '../src/services/calibration'
import { createCalibrationWorkflow } from '../src/services/calibrationWorkflow'
import { emptyPlanningStore } from '../src/services/planning'
import { emptyReportsStore } from '../src/services/reports'
import { emptyReviewStore } from '../src/services/review'
import { createSyncSnapshot, emptySyncState } from '../src/services/syncSnapshots'
import { emptySettingsState } from '../src/services/settings'

describe('calibrationWorkflow', () => {
  test('derives guided setup groups without persisted workflow state', () => {
    const workflow = createCalibrationWorkflow({
      workspace: seedWorkspace,
      dispatch: seedDispatchState,
      calibration: {
        ...emptyCalibrationState(),
        credentialReferences: [
          {
            id: 'credential-reference',
            label: 'godaddy-production',
            provider: 'GoDaddy',
            purpose: 'Production host access label',
            projectIds: [],
            targetIds: [],
            notes: '',
            createdAt: '2026-05-13T00:00:00Z',
            updatedAt: '2026-05-13T00:00:00Z',
          },
        ],
      },
      sync: {
        ...emptySyncState(),
        snapshots: [
          createSyncSnapshot({
            stores: {
              workspace: seedWorkspace,
              dispatch: seedDispatchState,
              writing: { drafts: [] },
              planning: emptyPlanningStore(),
              reports: emptyReportsStore(),
              review: emptyReviewStore(),
              calibration: emptyCalibrationState(),
            },
            settings: emptySettingsState(),
            sync: emptySyncState(),
            label: 'Checkpoint',
            note: '',
            now: new Date('2026-05-13T00:00:00Z'),
          }),
        ],
      },
      issues: [],
    })

    expect(workflow.map((group) => group.id)).toEqual(['scope', 'dispatch', 'verification'])
    expect(workflow.every((group) => group.status === 'complete')).toBe(true)
  })

  test('marks missing credential references and snapshots as setup blockers', () => {
    const workflow = createCalibrationWorkflow({
      workspace: seedWorkspace,
      dispatch: seedDispatchState,
      calibration: emptyCalibrationState(),
      sync: emptySyncState(),
      issues: [],
    })

    const dispatchGroup = workflow.find((group) => group.id === 'dispatch')
    const verificationGroup = workflow.find((group) => group.id === 'verification')

    expect(dispatchGroup?.steps.find((step) => step.id === 'credentials')?.status).toBe('blocked')
    expect(verificationGroup?.steps.find((step) => step.id === 'snapshots')?.status).toBe(
      'blocked',
    )
  })
})
