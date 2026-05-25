import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ATLAS_STORE_REGISTRY } from '../src/domain/storeRegistry'

export interface DesktopSqliteStoreOptions {
  databasePath: string
}

export interface SecureItemRecord {
  key: string
  value: string
}

const VALID_STORE_KEYS = new Set(ATLAS_STORE_REGISTRY.map((definition) => definition.localStorageKey))
const SECURE_KEY_PATTERN = /^[A-Za-z0-9_.:-]+$/

export class DesktopSqliteStore {
  readonly databasePath: string
  private readonly database: DatabaseSync

  constructor(options: DesktopSqliteStoreOptions) {
    this.databasePath = options.databasePath
    mkdirSync(path.dirname(this.databasePath), { recursive: true })
    this.database = new DatabaseSync(this.databasePath, { timeout: 5000 })
    this.migrate()
  }

  private migrate() {
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS atlas_schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS atlas_stores (
        storage_key TEXT PRIMARY KEY,
        json_value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS atlas_secure_items (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      INSERT OR IGNORE INTO atlas_schema_migrations (id, applied_at)
      VALUES ('desktop-storage-v1', datetime('now'));
    `)
  }

  hasMigration(id: string) {
    const row = this.database
      .prepare('SELECT id FROM atlas_schema_migrations WHERE id = ?')
      .get(id) as { id?: string } | undefined

    return Boolean(row?.id)
  }

  recordMigration(id: string) {
    this.database
      .prepare(
        `
          INSERT OR IGNORE INTO atlas_schema_migrations (id, applied_at)
          VALUES (?, datetime('now'))
        `,
      )
      .run(id)
  }

  countStores() {
    const row = this.database.prepare('SELECT COUNT(*) AS count FROM atlas_stores').get() as {
      count?: number
    }

    return row.count ?? 0
  }

  close() {
    this.database.close()
  }

  getStore(storageKey: string) {
    this.assertStoreKey(storageKey)
    const row = this.database
      .prepare('SELECT json_value FROM atlas_stores WHERE storage_key = ?')
      .get(storageKey) as { json_value?: string } | undefined

    return row?.json_value ?? null
  }

  setStore(storageKey: string, value: string) {
    this.assertStoreKey(storageKey)
    JSON.parse(value)
    this.database
      .prepare(
        `
          INSERT INTO atlas_stores (storage_key, json_value, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(storage_key) DO UPDATE SET
            json_value = excluded.json_value,
            updated_at = excluded.updated_at
        `,
      )
      .run(storageKey, value)
  }

  removeStore(storageKey: string) {
    this.assertStoreKey(storageKey)
    this.database.prepare('DELETE FROM atlas_stores WHERE storage_key = ?').run(storageKey)
  }

  getSecureItem(key: string) {
    this.assertSecureKey(key)
    const row = this.database
      .prepare('SELECT value FROM atlas_secure_items WHERE key = ?')
      .get(key) as { value?: string } | undefined

    return row?.value ?? null
  }

  setSecureItem(key: string, value: string) {
    this.assertSecureKey(key)
    this.database
      .prepare(
        `
          INSERT INTO atlas_secure_items (key, value, updated_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `,
      )
      .run(key, value)
  }

  removeSecureItem(key: string) {
    this.assertSecureKey(key)
    this.database.prepare('DELETE FROM atlas_secure_items WHERE key = ?').run(key)
  }

  private assertStoreKey(storageKey: string) {
    if (!VALID_STORE_KEYS.has(storageKey)) {
      throw new Error(`Unsupported Atlas store key: ${storageKey}`)
    }
  }

  private assertSecureKey(key: string) {
    if (!SECURE_KEY_PATTERN.test(key)) {
      throw new Error(`Unsupported secure item key: ${key}`)
    }
  }
}
