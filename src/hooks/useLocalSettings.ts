import type { AtlasSettingsState } from '../domain/settings'
import { emptySettingsState, normalizeSettingsState, updateSettings } from '../services/settings'
import { useLocalStoreState } from './useLocalStore'

export function useLocalSettings() {
  const {
    state: settings,
    setState: setSettings,
    resetState: resetSettings,
  } = useLocalStoreState<AtlasSettingsState>({
    storeId: 'settings',
    fallback: emptySettingsState,
    normalize: normalizeSettingsState,
  })

  function updateLocalSettings(
    update: Partial<Pick<AtlasSettingsState, 'deviceLabel' | 'operatorLabel' | 'notes'>>,
  ) {
    setSettings((current) => updateSettings(current, update))
  }

  return {
    settings,
    setSettings,
    updateLocalSettings,
    resetSettings,
  }
}
