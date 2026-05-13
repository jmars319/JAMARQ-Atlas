import type { AtlasStoreId } from './storeRegistry'

export type DataIntegritySeverity = 'info' | 'warning' | 'danger'

export interface DataIntegrityDiagnostic {
  id: string
  label: string
  severity: DataIntegritySeverity
  storeId: AtlasStoreId
  affectedCount: number
  affectedIds: string[]
  detail: string
  repairSuggestion: string
}
