import { useEffect, useState } from 'react'
import type { AtlasSettingsState } from '../domain/settings'
import { ATLAS_STORE_DEFINITIONS_BY_ID } from '../domain/storeRegistry'
import { emptySettingsState, normalizeSettingsState, updateSettings } from '../services/settings'

const STORAGE_KEY = ATLAS_STORE_DEFINITIONS_BY_ID.settings.localStorageKey

function readSettings(): AtlasSettingsState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)

    if (!stored) {
      return emptySettingsState()
    }

    return normalizeSettingsState(JSON.parse(stored))
  } catch {
    return emptySettingsState()
  }
}

export function useLocalSettings() {
  const [settings, setSettings] = useState<AtlasSettingsState>(() => readSettings())

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  function updateLocalSettings(
    update: Partial<Pick<AtlasSettingsState, 'deviceLabel' | 'operatorLabel' | 'notes'>>,
  ) {
    setSettings((current) => updateSettings(current, update))
  }

  function resetSettings() {
    const freshSettings = emptySettingsState()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(freshSettings))
    setSettings(freshSettings)
  }

  return {
    settings,
    setSettings,
    updateLocalSettings,
    resetSettings,
  }
}
