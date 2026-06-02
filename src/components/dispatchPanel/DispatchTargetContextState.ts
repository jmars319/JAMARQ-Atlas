import { createContext } from 'react'
import type { DispatchTargetContextValue } from './DispatchTargetContext'

export const DispatchTargetContext = createContext<DispatchTargetContextValue | null>(null)
