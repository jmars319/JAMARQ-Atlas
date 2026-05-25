import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DesktopSqliteStore } from '../desktop/storage'

function withStore(run: (store: DesktopSqliteStore) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'atlas-desktop-storage-'))

  try {
    const store = new DesktopSqliteStore({ databasePath: path.join(dir, 'atlas.sqlite') })

    try {
      run(store)
    } finally {
      store.close()
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe('DesktopSqliteStore', () => {
  it('stores Atlas JSON documents by existing storage key', () => {
    withStore((store) => {
      const value = JSON.stringify({ ok: true, count: 2 })

      store.setStore('jamarq-atlas.settings.v1', value)

      expect(store.getStore('jamarq-atlas.settings.v1')).toBe(value)
    })
  })

  it('removes stored Atlas documents', () => {
    withStore((store) => {
      store.setStore('jamarq-atlas.sync.v1', JSON.stringify({ snapshots: [] }))
      store.removeStore('jamarq-atlas.sync.v1')

      expect(store.getStore('jamarq-atlas.sync.v1')).toBeNull()
    })
  })

  it('rejects unknown store keys and invalid JSON', () => {
    withStore((store) => {
      expect(() => store.setStore('unknown', JSON.stringify({}))).toThrow(
        /Unsupported Atlas store key/,
      )
      expect(() => store.setStore('jamarq-atlas.settings.v1', '{')).toThrow()
    })
  })

  it('stores secure encrypted payloads outside Atlas operational stores', () => {
    withStore((store) => {
      store.setSecureItem('github.oauth.token', 'encrypted-payload')

      expect(store.getSecureItem('github.oauth.token')).toBe('encrypted-payload')

      store.removeSecureItem('github.oauth.token')

      expect(store.getSecureItem('github.oauth.token')).toBeNull()
    })
  })
})
