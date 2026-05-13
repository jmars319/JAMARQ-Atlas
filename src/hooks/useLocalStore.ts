import { useEffect, useMemo, useState } from 'react'
import { createLocalStoreAdapter, type LocalStoreAdapterOptions } from '../services/localStore'

export function useLocalStoreState<T>(options: LocalStoreAdapterOptions<T>) {
  const adapter = useMemo(
    () => createLocalStoreAdapter(options),
    [options.storeId, options.fallback, options.normalize],
  )
  const [state, setState] = useState<T>(() => adapter.read().value)

  useEffect(() => {
    adapter.write(state)
  }, [adapter, state])

  function resetState() {
    setState(adapter.reset())
  }

  return {
    state,
    setState,
    resetState,
    adapter,
  }
}
