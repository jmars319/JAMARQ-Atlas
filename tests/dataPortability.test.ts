import { describe, expect, it } from 'vitest'
import { seedDispatchState } from '../src/data/seedDispatch'
import { seedWorkspace } from '../src/data/seedWorkspace'
import { flattenProjects } from '../src/domain/atlas'
import {
  approveWritingDraft,
  createWritingDraft,
  markWritingDraftExported,
} from '../src/services/aiWritingAssistant'
import {
  canApplyAtlasRestore,
  createAtlasBackupEnvelope,
  createAtlasBackupMarkdownReport,
  createAtlasStoreDiagnostics,
  createBackupSummaryText,
  createRestorePreview,
  parseAtlasBackupJson,
  validateAtlasBackupEnvelope,
} from '../src/services/dataPortability'
import { emptyPlanningStore } from '../src/services/planning'
import { emptyReportsStore } from '../src/services/reports'
import { emptyReviewStore } from '../src/services/review'
import { emptySettingsState } from '../src/services/settings'
import { createSyncSnapshot, emptySyncState } from '../src/services/syncSnapshots'

const record = flattenProjects(seedWorkspace).find(
  (candidate) => candidate.project.id === 'midway-music-hall-site',
)!
const now = new Date('2026-05-10T12:00:00Z')
const draft = createWritingDraft({
  templateId: 'client-update',
  record,
  dispatch: seedDispatchState,
  now,
})
const exportedDraft = markWritingDraftExported(
  approveWritingDraft([draft], draft.id, now),
  draft.id,
  now,
)[0]
const planning = emptyPlanningStore(now)
const reports = emptyReportsStore(now)
const review = emptyReviewStore(now)
const settings = emptySettingsState(now)
const sync = {
  ...emptySyncState(now),
  snapshots: [
    createSyncSnapshot({
      stores: {
        workspace: seedWorkspace,
        dispatch: seedDispatchState,
        writing: { drafts: [exportedDraft] },
        planning,
        reports,
        review,
      },
      settings,
      label: 'Test snapshot',
      note: '',
      now,
    }),
  ],
}
const stores = {
  workspace: seedWorkspace,
  dispatch: seedDispatchState,
  writing: {
    drafts: [exportedDraft],
  },
  planning,
  reports,
  review,
  settings,
  sync,
}

describe('data portability', () => {
  it('creates a JSON backup envelope with all Atlas stores', () => {
    const envelope = createAtlasBackupEnvelope(stores, now)

    expect(envelope.kind).toBe('jamarq-atlas-backup')
    expect(envelope.schemaVersion).toBe(4)
    expect(envelope.stores.workspace.id).toBe('jamarq-atlas')
    expect(envelope.stores.dispatch.targets.length).toBeGreaterThan(0)
    expect(envelope.stores.writing.drafts).toHaveLength(1)
    expect(envelope.stores.planning.objectives).toHaveLength(0)
    expect(envelope.stores.reports.packets).toHaveLength(0)
    expect(envelope.stores.review.sessions).toHaveLength(0)
    expect(envelope.stores.settings.deviceLabel).toBe('Local Atlas workspace')
    expect(envelope.stores.sync.snapshots).toHaveLength(1)
    expect(envelope.summary.workspace.projects).toBeGreaterThan(0)
  })

  it('does not include credentials, env vars, or unknown local storage keys', () => {
    const serialized = JSON.stringify(createAtlasBackupEnvelope(stores, now))

    expect(serialized).not.toContain('GITHUB_TOKEN')
    expect(serialized).not.toContain('GH_TOKEN')
    expect(serialized).not.toContain('localStorage')
    expect(serialized).not.toMatch(/password|token=|secret=|api[_-]?key=/i)
  })

  it('builds a Markdown inventory report with counts and guardrails', () => {
    const report = createAtlasBackupMarkdownReport(createAtlasBackupEnvelope(stores, now))

    expect(report).toContain('# JAMARQ Atlas Backup Report')
    expect(report).toContain('Workspace:')
    expect(report).toContain('Dispatch:')
    expect(report).toContain('Writing:')
    expect(report).toContain('Planning:')
    expect(report).toContain('Reports:')
    expect(report).toContain('Review:')
    expect(report).toContain('Settings:')
    expect(report).toContain('Sync:')
    expect(report).toContain('Restore requires typed human confirmation.')
    expect(report).toContain('GitHub tokens and environment variables')
  })

  it('validates and normalizes a compatible backup', () => {
    const envelope = createAtlasBackupEnvelope(stores, now)
    const result = validateAtlasBackupEnvelope({
      ...envelope,
      stores: {
        ...envelope.stores,
        dispatch: {
          targets: envelope.stores.dispatch.targets,
          records: envelope.stores.dispatch.records,
          readiness: envelope.stores.dispatch.readiness,
        },
      },
    })

    expect(result.ok).toBe(true)
    expect(result.envelope?.stores.dispatch.preflightRuns).toEqual([])
    expect(result.warnings.map((warning) => warning.type)).toContain('legacy-normalized')
  })

  it('returns safe validation errors for malformed JSON and unsupported schemas', () => {
    expect(parseAtlasBackupJson('{not json').errors).toContain('Backup file is not valid JSON.')

    const unsupported = validateAtlasBackupEnvelope({
      ...createAtlasBackupEnvelope(stores, now),
      schemaVersion: 99,
    })

    expect(unsupported.ok).toBe(false)
    expect(unsupported.errors[0]).toContain('Unsupported backup schema version')
  })

  it('imports older v1 backups by normalizing missing Planning, Reports, Review, Settings, and Sync stores', () => {
    const envelope = createAtlasBackupEnvelope(stores, now)
    const result = validateAtlasBackupEnvelope({
      ...envelope,
      schemaVersion: 1,
      stores: {
        workspace: envelope.stores.workspace,
        dispatch: envelope.stores.dispatch,
        writing: envelope.stores.writing,
      },
    })

    expect(result.ok).toBe(true)
    expect(result.envelope?.schemaVersion).toBe(4)
    expect(result.envelope?.stores.planning.objectives).toEqual([])
    expect(result.envelope?.stores.reports.packets).toEqual([])
    expect(result.envelope?.stores.review.sessions).toEqual([])
    expect(result.envelope?.stores.settings.deviceLabel).toBe('Local Atlas workspace')
    expect(result.envelope?.stores.sync.snapshots).toEqual([])
    expect(result.warnings.map((warning) => warning.type)).toContain('missing-planning')
    expect(result.warnings.map((warning) => warning.type)).toContain('missing-reports')
    expect(result.warnings.map((warning) => warning.type)).toContain('missing-review')
    expect(result.warnings.map((warning) => warning.type)).toContain('missing-settings')
    expect(result.warnings.map((warning) => warning.type)).toContain('missing-sync')
  })

  it('builds restore previews without mutating current stores', () => {
    const currentBefore = JSON.stringify(stores)
    const incoming = createAtlasBackupEnvelope(
      {
        ...stores,
        writing: { drafts: [] },
      },
      now,
    )
    const preview = createRestorePreview(stores, incoming)

    expect(preview.currentSummary.writing.drafts).toBe(1)
    expect(preview.incomingSummary.writing.drafts).toBe(0)
    expect(preview.diffs.find((diff) => diff.id === 'writing-drafts')).toMatchObject({
      current: 1,
      incoming: 0,
      delta: -1,
      status: 'danger',
    })
    expect(JSON.stringify(stores)).toBe(currentBefore)
  })

  it('creates local store diagnostics with schema versions and repair hints', () => {
    const diagnostics = createAtlasStoreDiagnostics(stores)

    expect(diagnostics.find((item) => item.id === 'restore-compatibility')).toMatchObject({
      schemaVersion: 'backup v4',
      status: 'ok',
    })
    expect(diagnostics.find((item) => item.id === 'planning')?.schemaVersion).toBe('v2')
    expect(diagnostics.find((item) => item.id === 'reports')?.schemaVersion).toBe('v2')
    expect(diagnostics.find((item) => item.id === 'review')?.schemaVersion).toBe('v2')
    expect(diagnostics.every((item) => item.repairHint.length > 0)).toBe(true)
  })

  it('requires exact typed confirmation before restore can apply', () => {
    expect(canApplyAtlasRestore('RESTORE ATLAS')).toBe(true)
    expect(canApplyAtlasRestore('restore atlas')).toBe(false)
    expect(canApplyAtlasRestore('RESTORE')).toBe(false)
  })

  it('creates a compact backup summary for clipboard use', () => {
    const summary = createBackupSummaryText(createAtlasBackupEnvelope(stores, now))

    expect(summary).toContain('JAMARQ Atlas backup')
    expect(summary).toContain('projects')
    expect(summary).toContain('writing drafts')
    expect(summary).toContain('sync snapshots')
  })
})
