import { createContext } from 'react'
import type { SettingsCenterContextValue } from './SettingsCenterContext'

export const SettingsCenterContext = createContext<SettingsCenterContextValue | null>(null)
