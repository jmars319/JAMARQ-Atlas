import { type ReactNode } from 'react'
import type { useSettingsCenterModel } from './useSettingsCenterModel'
import { SettingsCenterContext } from './SettingsCenterContextState'

export type SettingsCenterContextValue = ReturnType<typeof useSettingsCenterModel>

export function SettingsCenterProvider({
  children,
  value,
}: {
  children: ReactNode
  value: SettingsCenterContextValue
}) {
  return <SettingsCenterContext.Provider value={value}>{children}</SettingsCenterContext.Provider>
}
