export const ATLAS_SETTINGS_SCHEMA_VERSION = 1

export type AtlasSettingsSchemaVersion = typeof ATLAS_SETTINGS_SCHEMA_VERSION

export interface AtlasSettingsState {
  schemaVersion: AtlasSettingsSchemaVersion
  deviceId: string
  deviceLabel: string
  operatorLabel: string
  notes: string
  updatedAt: string
}

export type AtlasConnectionStatus = 'available' | 'missing' | 'stub' | 'local-only' | 'unknown'

export interface AtlasConnectionCard {
  id: string
  title: string
  status: AtlasConnectionStatus
  summary: string
  detail: string
  updatedAt?: string
}
