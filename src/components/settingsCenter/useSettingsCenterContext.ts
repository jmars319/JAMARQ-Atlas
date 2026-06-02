import { useContext } from 'react'
import { SettingsCenterContext } from './SettingsCenterContextState'

export function useSettingsCenterContext() {
  const value = useContext(SettingsCenterContext)

  if (!value) {
    throw new Error('SettingsCenterContext is missing.')
  }

  return value
}
