import { useEffect, useState } from 'react'
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

const STORAGE_KEY = 'jamarq-atlas.calibration.v1'

function readCalibration(): AtlasCalibrationState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)

    if (!stored) {
      return emptyCalibrationState()
    }

    return normalizeCalibrationState(JSON.parse(stored))
  } catch {
    return emptyCalibrationState()
  }
}

export function useLocalCalibration() {
  const [calibration, setCalibration] = useState<AtlasCalibrationState>(() => readCalibration())

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(calibration))
  }, [calibration])

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

  function resetCalibration() {
    const freshCalibration = emptyCalibrationState()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(freshCalibration))
    setCalibration(freshCalibration)
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
