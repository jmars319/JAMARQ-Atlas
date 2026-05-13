import { ATLAS_CALIBRATION_SCHEMA_VERSION } from './calibration'
import { ATLAS_PLANNING_SCHEMA_VERSION } from './planning'
import { ATLAS_REPORTS_SCHEMA_VERSION } from './reports'
import { ATLAS_REVIEW_SCHEMA_VERSION } from './review'
import { ATLAS_SETTINGS_SCHEMA_VERSION } from './settings'
import { ATLAS_SYNC_SCHEMA_VERSION } from './sync'

export type AtlasStoreId =
  | 'workspace'
  | 'dispatch'
  | 'writing'
  | 'planning'
  | 'reports'
  | 'review'
  | 'calibration'
  | 'settings'
  | 'sync'

export type AtlasStoreRestoreBehavior =
  | 'data-and-sync-full-replace'
  | 'data-full-replace-only'

export interface AtlasStoreDefinition {
  id: AtlasStoreId
  label: string
  localStorageKey: string
  schemaVersionLabel: string
  backupIncluded: boolean
  syncSnapshotIncluded: boolean
  restoreBehavior: AtlasStoreRestoreBehavior
  restoreBehaviorLabel: string
  secretPolicy: string
}

const NO_SECRET_POLICY =
  'No secrets are stored here. Tokens, passwords, private keys, API keys, env vars, and credential values stay outside browser storage.'

export const ATLAS_STORE_REGISTRY = [
  {
    id: 'workspace',
    label: 'Workspace',
    localStorageKey: 'jamarq-atlas.workspace.v1',
    schemaVersionLabel: 'normalized workspace',
    backupIncluded: true,
    syncSnapshotIncluded: true,
    restoreBehavior: 'data-and-sync-full-replace',
    restoreBehaviorLabel: 'Full replace through Data restore and Sync snapshot restore.',
    secretPolicy: NO_SECRET_POLICY,
  },
  {
    id: 'dispatch',
    label: 'Dispatch',
    localStorageKey: 'jamarq-atlas.dispatch.v1',
    schemaVersionLabel: 'normalized dispatch v1',
    backupIncluded: true,
    syncSnapshotIncluded: true,
    restoreBehavior: 'data-and-sync-full-replace',
    restoreBehaviorLabel: 'Full replace through Data restore and Sync snapshot restore.',
    secretPolicy:
      'Stores deployment targets, evidence, runbooks, and credential reference labels only. No secrets, host credentials, or production file contents are stored.',
  },
  {
    id: 'writing',
    label: 'Writing',
    localStorageKey: 'jamarq-atlas.writing.v1',
    schemaVersionLabel: 'normalized writing v1',
    backupIncluded: true,
    syncSnapshotIncluded: true,
    restoreBehavior: 'data-and-sync-full-replace',
    restoreBehaviorLabel: 'Full replace through Data restore and Sync snapshot restore.',
    secretPolicy:
      'Stores local drafts, prompt packets, suggestions, and review audit only. No secrets or provider API keys are stored.',
  },
  {
    id: 'planning',
    label: 'Planning',
    localStorageKey: 'jamarq-atlas.planning.v1',
    schemaVersionLabel: `v${ATLAS_PLANNING_SCHEMA_VERSION}`,
    backupIncluded: true,
    syncSnapshotIncluded: true,
    restoreBehavior: 'data-and-sync-full-replace',
    restoreBehaviorLabel: 'Full replace through Data restore and Sync snapshot restore.',
    secretPolicy: NO_SECRET_POLICY,
  },
  {
    id: 'reports',
    label: 'Reports',
    localStorageKey: 'jamarq-atlas.reports.v1',
    schemaVersionLabel: `v${ATLAS_REPORTS_SCHEMA_VERSION}`,
    backupIncluded: true,
    syncSnapshotIncluded: true,
    restoreBehavior: 'data-and-sync-full-replace',
    restoreBehaviorLabel: 'Full replace through Data restore and Sync snapshot restore.',
    secretPolicy:
      'Stores local report packets and audit events only. No secrets are stored, and exports are local artifacts, not external sends.',
  },
  {
    id: 'review',
    label: 'Review',
    localStorageKey: 'jamarq-atlas.review.v1',
    schemaVersionLabel: `v${ATLAS_REVIEW_SCHEMA_VERSION}`,
    backupIncluded: true,
    syncSnapshotIncluded: true,
    restoreBehavior: 'data-and-sync-full-replace',
    restoreBehaviorLabel: 'Full replace through Data restore and Sync snapshot restore.',
    secretPolicy: NO_SECRET_POLICY,
  },
  {
    id: 'calibration',
    label: 'Calibration',
    localStorageKey: 'jamarq-atlas.calibration.v1',
    schemaVersionLabel: `v${ATLAS_CALIBRATION_SCHEMA_VERSION}`,
    backupIncluded: true,
    syncSnapshotIncluded: true,
    restoreBehavior: 'data-and-sync-full-replace',
    restoreBehaviorLabel: 'Full replace through Data restore and Sync snapshot restore.',
    secretPolicy:
      'Stores non-secret progress, audit events, and credential reference labels only. Credential values and env var names are rejected.',
  },
  {
    id: 'settings',
    label: 'Settings',
    localStorageKey: 'jamarq-atlas.settings.v1',
    schemaVersionLabel: `v${ATLAS_SETTINGS_SCHEMA_VERSION}`,
    backupIncluded: true,
    syncSnapshotIncluded: false,
    restoreBehavior: 'data-full-replace-only',
    restoreBehaviorLabel:
      'Full replace through Data restore only. Excluded from Sync snapshots to avoid device metadata recursion.',
    secretPolicy:
      'Stores local operator/device labels and notes only. No secrets are stored; connection credentials remain server-side environment configuration.',
  },
  {
    id: 'sync',
    label: 'Sync',
    localStorageKey: 'jamarq-atlas.sync.v1',
    schemaVersionLabel: `v${ATLAS_SYNC_SCHEMA_VERSION}`,
    backupIncluded: true,
    syncSnapshotIncluded: false,
    restoreBehavior: 'data-full-replace-only',
    restoreBehaviorLabel:
      'Full replace through Data restore only. Excluded from Sync snapshots to avoid recursive snapshots.',
    secretPolicy:
      'Stores local and remote snapshot metadata only. No secrets are stored; Supabase credentials remain server-side environment configuration.',
  },
] as const satisfies AtlasStoreDefinition[]

export const ATLAS_BACKUP_STORE_IDS = ATLAS_STORE_REGISTRY.filter(
  (definition) => definition.backupIncluded,
).map((definition) => definition.id)

export const ATLAS_SYNC_SNAPSHOT_STORE_IDS = ATLAS_STORE_REGISTRY.filter(
  (definition) => definition.syncSnapshotIncluded,
).map((definition) => definition.id)

export const ATLAS_STORE_DEFINITIONS_BY_ID = ATLAS_STORE_REGISTRY.reduce(
  (definitions, definition) => {
    definitions[definition.id] = definition
    return definitions
  },
  {} as Record<AtlasStoreId, AtlasStoreDefinition>,
)

export function getAtlasStoreDefinition(id: AtlasStoreId) {
  return ATLAS_STORE_DEFINITIONS_BY_ID[id]
}

export function isAtlasStoreId(value: string): value is AtlasStoreId {
  return value in ATLAS_STORE_DEFINITIONS_BY_ID
}
