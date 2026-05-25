import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { ATLAS_STORE_REGISTRY } from '../src/domain/storeRegistry'
import type { DesktopSqliteStore } from './storage'

export const BROWSER_LOCAL_STORAGE_MIGRATION_ID = 'browser-local-storage-v1'

export interface AtlasBrowserLocalStorageDocument {
  storageKey: string
  jsonValue: string
  sourcePath: string
  sourceDirectory: string
  byteLength: number
  sourceMtimeMs: number
  contentTimestampMs: number
}

export interface AtlasBrowserLocalStorageSource {
  sourceDirectory: string
  documents: AtlasBrowserLocalStorageDocument[]
}

export interface AtlasBrowserLocalStorageMigrationResult {
  status: 'disabled' | 'skipped' | 'imported' | 'no-data'
  sourceDirectory: string
  importedKeys: string[]
  skippedExistingKeys: string[]
  discoveredKeys: string[]
  message: string
}

const VALID_STORE_KEYS = new Set(ATLAS_STORE_REGISTRY.map((definition) => definition.localStorageKey))
const STORE_KEYS_BY_BUFFER = ATLAS_STORE_REGISTRY.map((definition) => ({
  storageKey: definition.localStorageKey,
  buffer: Buffer.from(definition.localStorageKey),
}))
const LOCAL_STORAGE_EXTENSIONS = new Set(['.ldb', '.log'])
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function findAllBufferOccurrences(buffer: Buffer, search: Buffer) {
  const offsets: number[] = []
  let offset = buffer.indexOf(search)

  while (offset !== -1) {
    offsets.push(offset)
    offset = buffer.indexOf(search, offset + search.length)
  }

  return offsets
}

function findJsonStart(buffer: Buffer, offset: number) {
  const end = Math.min(buffer.length, offset + 128)

  for (let index = offset; index < end; index += 1) {
    const byte = buffer[index]

    if (byte === 0x7b || byte === 0x5b) {
      return index
    }
  }

  return -1
}

function parseJsonAt(buffer: Buffer, start: number) {
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < buffer.length; index += 1) {
    const byte = buffer[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (byte === 0x5c) {
        escaped = true
      } else if (byte === 0x22) {
        inString = false
      }

      continue
    }

    if (byte === 0x22) {
      inString = true
    } else if (byte === 0x7b || byte === 0x5b) {
      depth += 1
    } else if (byte === 0x7d || byte === 0x5d) {
      depth -= 1

      if (depth === 0) {
        const jsonValue = buffer.subarray(start, index + 1).toString('utf8')
        JSON.parse(jsonValue)
        return jsonValue
      }
    }
  }

  return null
}

function collectTimestampMs(value: unknown, seen = new Set<unknown>()): number {
  if (typeof value === 'string') {
    if (!TIMESTAMP_PATTERN.test(value)) {
      return 0
    }

    const timestamp = Date.parse(value)
    return Number.isFinite(timestamp) ? timestamp : 0
  }

  if (!isRecord(value) && !Array.isArray(value)) {
    return 0
  }

  if (seen.has(value)) {
    return 0
  }

  seen.add(value)

  const values = Array.isArray(value) ? value : Object.values(value)
  return values.reduce((latest, item) => Math.max(latest, collectTimestampMs(item, seen)), 0)
}

function candidateRank(candidate: AtlasBrowserLocalStorageDocument) {
  return [
    candidate.contentTimestampMs,
    candidate.byteLength,
    candidate.sourceMtimeMs,
  ]
}

function compareCandidates(
  left: AtlasBrowserLocalStorageDocument,
  right: AtlasBrowserLocalStorageDocument,
) {
  const leftRank = candidateRank(left)
  const rightRank = candidateRank(right)

  for (let index = 0; index < leftRank.length; index += 1) {
    const delta = leftRank[index] - rightRank[index]

    if (delta !== 0) {
      return delta
    }
  }

  return left.sourcePath.localeCompare(right.sourcePath)
}

function collectLevelDbFiles(sourceDirectory: string) {
  if (!existsSync(sourceDirectory)) {
    return []
  }

  return readdirSync(sourceDirectory)
    .map((name) => path.join(sourceDirectory, name))
    .filter((filePath) => {
      try {
        return (
          statSync(filePath).isFile() &&
          LOCAL_STORAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())
        )
      } catch {
        return false
      }
    })
}

export function discoverAtlasBrowserLocalStorageDirs(homeDirectory: string) {
  const applicationSupport = path.join(homeDirectory, 'Library', 'Application Support')
  const candidateDirectories = [
    path.join(applicationSupport, 'Google', 'Chrome', 'Default', 'Local Storage', 'leveldb'),
    path.join(applicationSupport, 'Google', 'Chrome', 'Profile 1', 'Local Storage', 'leveldb'),
    path.join(applicationSupport, 'Google', 'Chrome', 'Profile 2', 'Local Storage', 'leveldb'),
    path.join(applicationSupport, 'Google', 'Chrome', 'Profile 3', 'Local Storage', 'leveldb'),
    path.join(
      applicationSupport,
      'Codex',
      'Partitions',
      'codex-browser-app',
      'Local Storage',
      'leveldb',
    ),
    path.join(applicationSupport, 'BraveSoftware', 'Brave-Browser', 'Default', 'Local Storage', 'leveldb'),
    path.join(applicationSupport, 'Microsoft Edge', 'Default', 'Local Storage', 'leveldb'),
    path.join(applicationSupport, 'Arc', 'User Data', 'Default', 'Local Storage', 'leveldb'),
  ]

  return candidateDirectories.filter((directory) => collectLevelDbFiles(directory).length > 0)
}

export function extractAtlasDocumentsFromLevelDbDir(
  sourceDirectory: string,
): AtlasBrowserLocalStorageSource {
  const documentsByKey = new Map<string, AtlasBrowserLocalStorageDocument>()

  for (const filePath of collectLevelDbFiles(sourceDirectory)) {
    const fileStat = statSync(filePath)
    const buffer = readFileSync(filePath)

    for (const storeKey of STORE_KEYS_BY_BUFFER) {
      for (const offset of findAllBufferOccurrences(buffer, storeKey.buffer)) {
        const jsonStart = findJsonStart(buffer, offset + storeKey.buffer.length)

        if (jsonStart === -1) {
          continue
        }

        try {
          const jsonValue = parseJsonAt(buffer, jsonStart)

          if (!jsonValue) {
            continue
          }

          const parsed = JSON.parse(jsonValue) as unknown
          const candidate = {
            storageKey: storeKey.storageKey,
            jsonValue,
            sourcePath: filePath,
            sourceDirectory,
            byteLength: Buffer.byteLength(jsonValue),
            sourceMtimeMs: fileStat.mtimeMs,
            contentTimestampMs: collectTimestampMs(parsed),
          }
          const existing = documentsByKey.get(storeKey.storageKey)

          if (!existing || compareCandidates(candidate, existing) > 0) {
            documentsByKey.set(storeKey.storageKey, candidate)
          }
        } catch {
          continue
        }
      }
    }
  }

  return {
    sourceDirectory,
    documents: [...documentsByKey.values()].sort((left, right) =>
      left.storageKey.localeCompare(right.storageKey),
    ),
  }
}

export function selectBestAtlasBrowserLocalStorageSource(
  sources: AtlasBrowserLocalStorageSource[],
) {
  return sources
    .filter((source) => source.documents.length > 0)
    .sort((left, right) => {
      const countDelta = right.documents.length - left.documents.length

      if (countDelta !== 0) {
        return countDelta
      }

      const rightNewest = Math.max(...right.documents.map((document) => document.contentTimestampMs))
      const leftNewest = Math.max(...left.documents.map((document) => document.contentTimestampMs))

      if (rightNewest !== leftNewest) {
        return rightNewest - leftNewest
      }

      return left.sourceDirectory.localeCompare(right.sourceDirectory)
    })[0]
}

export function migrateBrowserLocalStorageToSqlite(options: {
  sqliteStore: DesktopSqliteStore
  sourceDirectories: string[]
  disabled?: boolean
}): AtlasBrowserLocalStorageMigrationResult {
  if (options.disabled) {
    return {
      status: 'disabled',
      sourceDirectory: '',
      importedKeys: [],
      skippedExistingKeys: [],
      discoveredKeys: [],
      message: 'Browser localStorage migration is disabled.',
    }
  }

  if (options.sqliteStore.hasMigration(BROWSER_LOCAL_STORAGE_MIGRATION_ID)) {
    return {
      status: 'skipped',
      sourceDirectory: '',
      importedKeys: [],
      skippedExistingKeys: [],
      discoveredKeys: [],
      message: 'Browser localStorage migration already ran.',
    }
  }

  const source = selectBestAtlasBrowserLocalStorageSource(
    options.sourceDirectories.map((directory) => extractAtlasDocumentsFromLevelDbDir(directory)),
  )

  if (!source) {
    return {
      status: 'no-data',
      sourceDirectory: '',
      importedKeys: [],
      skippedExistingKeys: [],
      discoveredKeys: [],
      message: 'No Atlas browser localStorage data was found.',
    }
  }

  const importedKeys: string[] = []
  const skippedExistingKeys: string[] = []

  for (const document of source.documents) {
    if (!VALID_STORE_KEYS.has(document.storageKey)) {
      continue
    }

    if (options.sqliteStore.getStore(document.storageKey)) {
      skippedExistingKeys.push(document.storageKey)
      continue
    }

    options.sqliteStore.setStore(document.storageKey, document.jsonValue)
    importedKeys.push(document.storageKey)
  }

  options.sqliteStore.recordMigration(BROWSER_LOCAL_STORAGE_MIGRATION_ID)

  return {
    status: importedKeys.length > 0 ? 'imported' : 'skipped',
    sourceDirectory: source.sourceDirectory,
    importedKeys,
    skippedExistingKeys,
    discoveredKeys: source.documents.map((document) => document.storageKey),
    message:
      importedKeys.length > 0
        ? `Imported ${importedKeys.length} Atlas browser store(s) into SQLite.`
        : 'Atlas browser stores were already present in SQLite.',
  }
}
