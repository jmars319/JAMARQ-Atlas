import { useContext } from 'react'
import { DispatchTargetContext } from './DispatchTargetContextState'

export function useDispatchTargetContext() {
  const value = useContext(DispatchTargetContext)

  if (!value) {
    throw new Error('Dispatch target context is missing.')
  }

  return value
}
