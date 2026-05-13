import type {
  AtlasCalibrationState,
  CalibrationCredentialReference,
  CalibrationFieldStatus,
} from '../domain/calibration'
import type { CalibrationIssue } from '../services/calibration'
import {
  deleteCredentialReference,
  emptyCalibrationState,
  normalizeCalibrationState,
  updateCalibrationFieldProgress,
  upsertCredentialReference,
} from '../services/calibration'
import { useLocalStoreState } from './useLocalStore'

export function useLocalCalibration() {
  const {
    state: calibration,
    setState: setCalibration,
    resetState: resetCalibration,
  } = useLocalStoreState<AtlasCalibrationState>({
    storeId: 'calibration',
    fallback: emptyCalibrationState,
    normalize: normalizeCalibrationState,
  })

  function setFieldProgress(
    issue: CalibrationIssue,
    status: CalibrationFieldStatus,
    note = '',
    operatorLabel = '',
  ) {
    setCalibration((current) =>
      updateCalibrationFieldProgress(current, issue, status, note, operatorLabel),
    )
  }

  function saveCredentialReference(
    input: Pick<
      CalibrationCredentialReference,
      'label' | 'provider' | 'purpose' | 'projectIds' | 'targetIds' | 'notes'
    > & { operatorLabel?: string },
  ) {
    let message = ''

    setCalibration((current) => {
      const result = upsertCredentialReference(current, input)

      if (!result.ok) {
        message = result.message
        return current
      }

      return result.state
    })

    return message ? { ok: false, message } : { ok: true, message: '' }
  }

  function removeCredentialReference(referenceId: string, operatorLabel = '') {
    setCalibration((current) => deleteCredentialReference(current, referenceId, operatorLabel))
  }

  return {
    calibration,
    setCalibration,
    setFieldProgress,
    saveCredentialReference,
    removeCredentialReference,
    resetCalibration,
  }
}
