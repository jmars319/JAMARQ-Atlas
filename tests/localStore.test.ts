import { describe, expect, test, vi } from 'vitest'
import {
  createLocalStoreAdapter,
  readLocalStore,
  writeLocalStore,
  type LocalStorageLike,
} from '../src/services/localStore'

function memoryStorage(initial: Record<string, string> = {}): LocalStorageLike {
  const values = new Map(Object.entries(initial))

  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value)
    },
    removeItem: (key) => {
      values.delete(key)
    },
  }
}

describe('localStore', () => {
  test('normalizes stored JSON through the shared adapter metadata', () => {
    const adapter = createLocalStoreAdapter(
      {
        storeId: 'settings',
        fallback: () => ({ label: 'fallback' }),
        normalize: (value) => ({ label: String((value as { label?: string }).label ?? '') }),
      },
      memoryStorage({ 'jamarq-atlas.settings.v1': JSON.stringify({ label: 'stored' }) }),
    )

    expect(adapter.label).toBe('Settings')
    expect(adapter.schemaVersionLabel).toContain('v')
    expect(adapter.read()).toMatchObject({
      status: 'stored',
      value: { label: 'stored' },
    })
  })

  test('falls back on corrupted JSON without throwing', () => {
    const result = readLocalStore(
      {
        label: 'Settings',
        storageKey: 'settings',
        fallback: () => ({ ok: false }),
        normalize: (value) => value as { ok: boolean },
      },
      memoryStorage({ settings: '{bad-json' }),
    )

    expect(result.status).toBe('parse-error')
    expect(result.value).toEqual({ ok: false })
    expect(result.message).toContain('could not be parsed')
  })

  test('returns quota-safe write errors', () => {
    const storage: LocalStorageLike = {
      getItem: () => null,
      setItem: vi.fn(() => {
        throw new DOMException('full', 'QuotaExceededError')
      }),
      removeItem: vi.fn(),
    }

    const result = writeLocalStore(
      { label: 'Settings', storageKey: 'settings' },
      { value: 'too large' },
      storage,
    )

    expect(result.ok).toBe(false)
    expect(result.status).toBe('quota-exceeded')
    expect(result.message).toContain('browser storage is full')
  })
})
