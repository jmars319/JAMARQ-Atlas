import { ATLAS_STORE_DEFINITIONS_BY_ID, type AtlasStoreId } from '../domain/storeRegistry'

export interface LocalStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type LocalStoreReadStatus = 'stored' | 'missing' | 'parse-error' | 'storage-unavailable'
export type LocalStoreWriteStatus = 'stored' | 'quota-exceeded' | 'storage-unavailable' | 'failed'

export interface LocalStoreAdapterOptions<T> {
  storeId: AtlasStoreId
  fallback: () => T
  normalize: (value: unknown) => T
}

export interface LocalStoreAdapter<T> {
  storeId: AtlasStoreId
  label: string
  storageKey: string
  schemaVersionLabel: string
  read: () => LocalStoreReadResult<T>
  write: (value: T) => LocalStoreWriteResult
  reset: () => T
}

export interface LocalStoreReadResult<T> {
  status: LocalStoreReadStatus
  value: T
  message: string
}

export interface LocalStoreWriteResult {
  status: LocalStoreWriteStatus
  ok: boolean
  message: string
}

function browserStorage(): LocalStorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

function isQuotaError(error: unknown) {
  if (typeof DOMException === 'undefined') {
    return false
  }

  if (!(error instanceof DOMException)) {
    return false
  }

  return (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014
  )
}

export function readLocalStore<T>(
  adapter: Pick<LocalStoreAdapter<T>, 'label' | 'storageKey'> & {
    fallback: () => T
    normalize: (value: unknown) => T
  },
  storage: LocalStorageLike | null = browserStorage(),
): LocalStoreReadResult<T> {
  if (!storage) {
    return {
      status: 'storage-unavailable',
      value: adapter.fallback(),
      message: `${adapter.label} local storage is unavailable; using defaults.`,
    }
  }

  try {
    const stored = storage.getItem(adapter.storageKey)

    if (!stored) {
      return {
        status: 'missing',
        value: adapter.fallback(),
        message: `${adapter.label} local store is empty; using defaults.`,
      }
    }

    return {
      status: 'stored',
      value: adapter.normalize(JSON.parse(stored)),
      message: `${adapter.label} local store loaded.`,
    }
  } catch (error) {
    return {
      status: 'parse-error',
      value: adapter.fallback(),
      message: `${adapter.label} local store could not be parsed: ${errorMessage(
        error,
        'unknown parse failure',
      )}.`,
    }
  }
}

export function writeLocalStore<T>(
  adapter: Pick<LocalStoreAdapter<T>, 'label' | 'storageKey'>,
  value: T,
  storage: LocalStorageLike | null = browserStorage(),
): LocalStoreWriteResult {
  if (!storage) {
    return {
      status: 'storage-unavailable',
      ok: false,
      message: `${adapter.label} local storage is unavailable; changes remain in memory only.`,
    }
  }

  try {
    storage.setItem(adapter.storageKey, JSON.stringify(value))
    return {
      status: 'stored',
      ok: true,
      message: `${adapter.label} local store saved.`,
    }
  } catch (error) {
    const quotaExceeded = isQuotaError(error)

    return {
      status: quotaExceeded ? 'quota-exceeded' : 'failed',
      ok: false,
      message: quotaExceeded
        ? `${adapter.label} local store could not be saved because browser storage is full.`
        : `${adapter.label} local store could not be saved: ${errorMessage(
            error,
            'unknown write failure',
          )}.`,
    }
  }
}

export function createLocalStoreAdapter<T>(
  options: LocalStoreAdapterOptions<T>,
  storage: LocalStorageLike | null = browserStorage(),
): LocalStoreAdapter<T> {
  const definition = ATLAS_STORE_DEFINITIONS_BY_ID[options.storeId]
  const adapter = {
    storeId: options.storeId,
    label: definition.label,
    storageKey: definition.localStorageKey,
    schemaVersionLabel: definition.schemaVersionLabel,
    fallback: options.fallback,
    normalize: options.normalize,
  }

  return {
    storeId: adapter.storeId,
    label: adapter.label,
    storageKey: adapter.storageKey,
    schemaVersionLabel: adapter.schemaVersionLabel,
    read: () => readLocalStore(adapter, storage),
    write: (value) => writeLocalStore(adapter, value, storage),
    reset: () => {
      const freshValue = options.fallback()
      writeLocalStore(adapter, freshValue, storage)
      return freshValue
    },
  }
}
