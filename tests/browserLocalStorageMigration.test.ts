import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  extractAtlasDocumentsFromLevelDbDir,
  migrateBrowserLocalStorageToSqlite,
  selectBestAtlasBrowserLocalStorageSource,
} from '../desktop/browserLocalStorageMigration'
import { DesktopSqliteStore } from '../desktop/storage'

function withTempDir(run: (dir: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'atlas-browser-storage-'))

  try {
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function writeLevelDbFragment(dir: string, name: string, entries: Record<string, unknown>) {
  mkdirSync(dir, { recursive: true })
  const fragments = Object.entries(entries).map(
    ([key, value]) => `prefix_http://127.0.0.1:5173\x00${key}\x01${JSON.stringify(value)}\n`,
  )

  writeFileSync(path.join(dir, name), fragments.join(''))
}

describe('browser localStorage migration', () => {
  it('extracts Atlas localStorage documents from Chromium LevelDB fragments', () => {
    withTempDir((dir) => {
      writeLevelDbFragment(dir, '000001.log', {
        'jamarq-atlas.settings.v1': {
          schemaVersion: 1,
          deviceLabel: 'Chrome profile',
          operatorLabel: '',
          updatedAt: '2026-05-25T13:00:00.000Z',
        },
      })

      const source = extractAtlasDocumentsFromLevelDbDir(dir)

      expect(source.documents).toHaveLength(1)
      expect(source.documents[0]).toMatchObject({
        storageKey: 'jamarq-atlas.settings.v1',
        sourceDirectory: dir,
      })
      expect(JSON.parse(source.documents[0].jsonValue)).toMatchObject({
        deviceLabel: 'Chrome profile',
      })
    })
  })

  it('selects the source with the most Atlas stores', () => {
    const sparse = {
      sourceDirectory: 'sparse',
      documents: [
        {
          storageKey: 'jamarq-atlas.settings.v1',
          jsonValue: '{}',
          sourcePath: 'sparse/000001.log',
          sourceDirectory: 'sparse',
          byteLength: 2,
          sourceMtimeMs: 1,
          contentTimestampMs: 1,
        },
      ],
    }
    const fuller = {
      sourceDirectory: 'fuller',
      documents: [
        ...sparse.documents,
        {
          storageKey: 'jamarq-atlas.sync.v1',
          jsonValue: '{"snapshots":[]}',
          sourcePath: 'fuller/000001.log',
          sourceDirectory: 'fuller',
          byteLength: 16,
          sourceMtimeMs: 1,
          contentTimestampMs: 1,
        },
      ],
    }

    expect(selectBestAtlasBrowserLocalStorageSource([sparse, fuller])?.sourceDirectory).toBe(
      'fuller',
    )
  })

  it('imports browser stores without overwriting existing SQLite values', () => {
    withTempDir((dir) => {
      const levelDbDir = path.join(dir, 'leveldb')
      const store = new DesktopSqliteStore({ databasePath: path.join(dir, 'atlas.sqlite') })
      const existing = JSON.stringify({ schemaVersion: 1, deviceLabel: 'Desktop value' })

      try {
        store.setStore('jamarq-atlas.settings.v1', existing)
        writeLevelDbFragment(levelDbDir, '000001.log', {
          'jamarq-atlas.settings.v1': {
            schemaVersion: 1,
            deviceLabel: 'Browser value',
          },
          'jamarq-atlas.sync.v1': {
            schemaVersion: 1,
            provider: { status: 'not-configured' },
            snapshots: [],
          },
        })

        const result = migrateBrowserLocalStorageToSqlite({
          sqliteStore: store,
          sourceDirectories: [levelDbDir],
        })

        expect(result.status).toBe('imported')
        expect(result.importedKeys).toEqual(['jamarq-atlas.sync.v1'])
        expect(result.skippedExistingKeys).toEqual(['jamarq-atlas.settings.v1'])
        expect(store.getStore('jamarq-atlas.settings.v1')).toBe(existing)
        expect(JSON.parse(store.getStore('jamarq-atlas.sync.v1') ?? '{}')).toMatchObject({
          snapshots: [],
        })
      } finally {
        store.close()
      }
    })
  })
})
