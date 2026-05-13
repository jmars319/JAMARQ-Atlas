import { describe, expect, it } from 'vitest'
import { seedDispatchState } from '../src/data/seedDispatch'
import { seedWorkspace } from '../src/data/seedWorkspace'
import type { DeploymentTarget } from '../src/domain/dispatch'
import {
  applyCalibrationImportPreview,
  calibrationValueToTargetUpdate,
  canStoreCalibrationValue,
  createCalibrationReadinessReport,
  emptyCalibrationState,
  isPlaceholderValue,
  normalizeCalibrationState,
  parseCalibrationImportPreview,
  scanAtlasCalibration,
  updateCalibrationFieldProgress,
  upsertCredentialReference,
  validateCalibrationDataQuality,
} from '../src/services/calibration'
import { replaceDeploymentTarget } from '../src/services/dispatchStorage'

describe('Atlas calibration checks', () => {
  it('finds seed Dispatch placeholder values', () => {
    const issues = scanAtlasCalibration(seedWorkspace, seedDispatchState)

    expect(issues.some((issue) => issue.field === 'remoteHost')).toBe(true)
    expect(issues.some((issue) => issue.field === 'remoteFrontendPath')).toBe(true)
    expect(issues.some((issue) => issue.category === 'github-bindings')).toBe(true)
    expect(issues.some((issue) => issue.category === 'host-config')).toBe(true)
    expect(issues.some((issue) => issue.category === 'health-urls')).toBe(true)
    expect(issues.some((issue) => issue.category === 'backup-rollback')).toBe(true)
  })

  it('detects placeholder values consistently', () => {
    expect(isPlaceholderValue('placeholder.godaddy-cpanel.example')).toBe(true)
    expect(isPlaceholderValue('https://midwaymusichall.com')).toBe(false)
    expect(isPlaceholderValue([])).toBe(true)
  })

  it('persists non-secret host/path calibration edits through Dispatch target updates', () => {
    const updated = replaceDeploymentTarget(seedDispatchState, 'midway-music-hall-production', {
      remoteHost: 'mmh-prod.examplehost.com',
      remoteFrontendPath: '/home/mmh/public_html',
      remoteBackendPath: '/home/mmh/public_html/api',
    })
    const target = updated.targets.find(
      (candidate) => candidate.id === 'midway-music-hall-production',
    ) as DeploymentTarget

    expect(target.remoteHost).toBe('mmh-prod.examplehost.com')
    expect(target.remoteFrontendPath).toBe('/home/mmh/public_html')
    expect(target.remoteBackendPath).toBe('/home/mmh/public_html/api')
  })

  it('supports guarded calibration updates for credential references and health URLs', () => {
    const credentialUpdate = calibrationValueToTargetUpdate(
      'credentialRef',
      'godaddy-mmh-production',
    )
    const healthUpdate = calibrationValueToTargetUpdate(
      'healthCheckUrls',
      'https://midwaymusichall.com/\nhttps://midwaymusichall.com/api/health',
    )

    expect(credentialUpdate).toEqual({ credentialRef: 'godaddy-mmh-production' })
    expect(healthUpdate).toEqual({
      healthCheckUrls: [
        'https://midwaymusichall.com/',
        'https://midwaymusichall.com/api/health',
      ],
    })
  })

  it('flags placeholder credential reference labels without storing secrets', () => {
    const updated = replaceDeploymentTarget(seedDispatchState, 'midway-music-hall-production', {
      credentialRef: 'placeholder-credential',
    })
    const issues = scanAtlasCalibration(seedWorkspace, updated)

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: 'midway-music-hall-production',
          field: 'credentialRef',
          category: 'host-config',
          editable: true,
        }),
      ]),
    )
  })

  it('flags real host metadata with no matching host inspector config entry', () => {
    const updated = replaceDeploymentTarget(seedDispatchState, 'midway-music-hall-production', {
      remoteHost: 'mmh-prod.examplehost.com',
      remoteFrontendPath: '/home/mmh/public_html',
      remoteBackendPath: '/home/mmh/public_html/api',
    })
    const missingIssues = scanAtlasCalibration(seedWorkspace, updated, [])
    const configuredIssues = scanAtlasCalibration(seedWorkspace, updated, [
      'midway-music-hall-production',
    ])

    expect(missingIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          targetId: 'midway-music-hall-production',
          field: 'host-preflight-config',
        }),
      ]),
    )
    expect(
      configuredIssues.some(
        (issue) =>
          issue.targetId === 'midway-music-hall-production' &&
          issue.field === 'host-preflight-config',
      ),
    ).toBe(false)
  })

  it('rejects credential-shaped calibration values', () => {
    expect(canStoreCalibrationValue('mmh-production-host').ok).toBe(true)
    expect(canStoreCalibrationValue('password=do-not-store').ok).toBe(false)
    expect(canStoreCalibrationValue('OPENAI_API_KEY=do-not-store').message).toContain(
      'credential-shaped',
    )
  })

  it('normalizes missing calibration state into an empty local store', () => {
    const state = normalizeCalibrationState(null, new Date('2026-05-10T12:00:00Z'))

    expect(state.schemaVersion).toBe(1)
    expect(state.fieldProgress).toEqual([])
    expect(state.credentialReferences).toEqual([])
    expect(state.auditEvents).toEqual([])
  })

  it('tracks field progress transitions with audit events', () => {
    const issue = scanAtlasCalibration(seedWorkspace, seedDispatchState).find(
      (candidate) => candidate.field === 'remoteHost',
    )

    expect(issue).toBeDefined()

    const updated = updateCalibrationFieldProgress(
      emptyCalibrationState(new Date('2026-05-10T12:00:00Z')),
      issue!,
      'verified',
      'Confirmed from cPanel target metadata.',
      'operator',
      new Date('2026-05-11T12:00:00Z'),
    )

    expect(updated.fieldProgress[0]).toMatchObject({
      issueId: issue!.id,
      status: 'verified',
      note: 'Confirmed from cPanel target metadata.',
      operatorLabel: 'operator',
    })
    expect(updated.fieldProgress[0].verifiedAt).toBe('2026-05-11T12:00:00.000Z')
    expect(updated.auditEvents[0]).toMatchObject({
      type: 'field-progress',
      issueId: issue!.id,
    })
  })

  it('validates non-secret credential references and flags unregistered target labels', () => {
    const empty = emptyCalibrationState(new Date('2026-05-10T12:00:00Z'))
    const rejected = upsertCredentialReference(empty, {
      label: 'password=do-not-store',
      provider: 'GoDaddy',
      purpose: 'Production cPanel',
    })
    const saved = upsertCredentialReference(empty, {
      label: 'godaddy-mmh-production',
      provider: 'GoDaddy cPanel',
      purpose: 'Production host access label',
      targetIds: ['midway-music-hall-production'],
    })

    expect(rejected.ok).toBe(false)
    expect(saved.ok).toBe(true)

    const updated = replaceDeploymentTarget(seedDispatchState, 'midway-music-hall-production', {
      credentialRef: 'godaddy-mmh-production',
    })
    const missingRegistry = scanAtlasCalibration(seedWorkspace, updated, [], [])
    const withRegistry = scanAtlasCalibration(seedWorkspace, updated, [], [
      'godaddy-mmh-production',
    ])

    expect(
      missingRegistry.some(
        (issue) =>
          issue.targetId === 'midway-music-hall-production' &&
          issue.field === 'credentialRef-registry',
      ),
    ).toBe(true)
    expect(
      withRegistry.some(
        (issue) =>
          issue.targetId === 'midway-music-hall-production' &&
          issue.field === 'credentialRef-registry',
      ),
    ).toBe(false)
  })

  it('previews and applies calibration JSON imports without accepting secrets', () => {
    const text = JSON.stringify({
      rows: [
        {
          kind: 'dispatch-target',
          targetId: 'midway-music-hall-production',
          remoteHost: 'mmh-prod.examplehost.com',
          remoteBackendPath: '/home/mmh/public_html/api',
          healthCheckUrls: 'https://midwaymusichall.com/|https://midwaymusichall.com/api/health',
          credentialRef: 'godaddy-mmh-production',
        },
        {
          kind: 'credential-reference',
          label: 'godaddy-mmh-production',
          provider: 'GoDaddy cPanel',
          purpose: 'Production host access label',
          targetIds: 'midway-music-hall-production',
        },
        {
          kind: 'dispatch-target',
          targetId: 'midway-mobile-storage-production',
          remoteHost: 'password=do-not-store',
        },
      ],
    })
    const preview = parseCalibrationImportPreview(text, seedWorkspace, seedDispatchState)

    expect(preview.acceptedRows).toHaveLength(2)
    expect(preview.rejectedRows).toHaveLength(1)
    expect(preview.kindSummaries.find((summary) => summary.kind === 'dispatch-target')).toMatchObject({
      accepted: 1,
      rejected: 1,
    })
    expect(preview.acceptedRows[0].changeDetails[0]).toEqual(
      expect.objectContaining({
        field: 'remoteHost',
        before: expect.any(String),
        after: 'mmh-prod.examplehost.com',
      }),
    )
    expect(preview.rejectedRows[0].errors.join(' ')).toContain('Secret-shaped values')

    const result = applyCalibrationImportPreview({
      workspace: seedWorkspace,
      dispatch: seedDispatchState,
      calibration: emptyCalibrationState(new Date('2026-05-10T12:00:00Z')),
      preview,
      operatorLabel: 'operator',
      now: new Date('2026-05-11T12:00:00Z'),
    })
    const target = result.dispatch.targets.find(
      (candidate) => candidate.id === 'midway-music-hall-production',
    )

    expect(target?.remoteHost).toBe('mmh-prod.examplehost.com')
    expect(target?.healthCheckUrls).toContain('https://midwaymusichall.com/api/health')
    expect(result.calibration.credentialReferences[0].label).toBe('godaddy-mmh-production')
    expect(result.calibration.auditEvents.some((event) => event.type === 'import-apply')).toBe(true)
  })

  it('parses CSV imports with quoted commas, empty fields, and multiline health URLs', () => {
    const csv = [
      'kind,targetId,remoteHost,remoteUser,remoteBackendPath,publicUrl,healthCheckUrls,credentialRef,label,provider,purpose,notes',
      '"dispatch-target","midway-music-hall-production","mmh-prod.examplehost.com","deploy,user","/home/mmh/public_html/api","https://midwaymusichall.com","https://midwaymusichall.com/',
      'https://midwaymusichall.com/api/health","godaddy-mmh-production","","","",""',
      '"credential-reference","","","","","","","","godaddy-mmh-production","GoDaddy, cPanel","Production host access label","Reference location note"',
    ].join('\n')
    const preview = parseCalibrationImportPreview(csv, seedWorkspace, seedDispatchState)

    expect(preview.acceptedRows).toHaveLength(2)
    expect(preview.rejectedRows).toHaveLength(0)
    expect(preview.acceptedRows[0].data.remoteUser).toBe('deploy,user')
    expect(preview.acceptedRows[0].data.healthCheckUrls).toContain('/api/health')
    expect(preview.acceptedRows[1].data.provider).toBe('GoDaddy, cPanel')
  })

  it('reports duplicate import warnings before apply', () => {
    const savedReference = upsertCredentialReference(emptyCalibrationState(), {
      label: 'godaddy-mmh-production',
      provider: 'GoDaddy',
      purpose: 'Production host access label',
    })
    expect(savedReference.ok).toBe(true)
    const calibration = savedReference.ok ? savedReference.state : emptyCalibrationState()
    const preview = parseCalibrationImportPreview(
      JSON.stringify({
        rows: [
          {
            kind: 'credential-reference',
            label: 'godaddy-mmh-production',
          },
          {
            kind: 'credential-reference',
            label: 'godaddy-mmh-production',
          },
          {
            kind: 'dispatch-target',
            targetId: 'midway-music-hall-production',
            remoteHost: 'mmh-prod.examplehost.com',
          },
          {
            kind: 'dispatch-target',
            targetId: 'midway-music-hall-production',
            remoteBackendPath: '/home/mmh/public_html/api',
          },
        ],
      }),
      seedWorkspace,
      seedDispatchState,
      calibration,
    )

    expect(preview.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('already exists'),
        expect.stringContaining('Duplicate credential reference label'),
        expect.stringContaining('Duplicate dispatch target row'),
      ]),
    )
  })

  it('summarizes calibration readiness from issues, progress, registry, and import warnings', () => {
    const issue = scanAtlasCalibration(seedWorkspace, seedDispatchState).find(
      (candidate) => candidate.field === 'remoteHost',
    )!
    const calibration = updateCalibrationFieldProgress(
      emptyCalibrationState(),
      issue,
      'verified',
      'Confirmed.',
      'operator',
      new Date('2026-05-11T12:00:00Z'),
    )
    const preview = parseCalibrationImportPreview(
      JSON.stringify({
        rows: [
          {
            kind: 'dispatch-target',
            targetId: 'midway-music-hall-production',
            publicUrl: 'midwaymusichall.com',
          },
        ],
      }),
      seedWorkspace,
      seedDispatchState,
    )
    const report = createCalibrationReadinessReport({
      issues: scanAtlasCalibration(seedWorkspace, seedDispatchState, [], []),
      calibration,
      importPreview: preview,
    })

    expect(report.unresolved).toBeGreaterThan(0)
    expect(report.verified).toBe(1)
    expect(report.importWarnings).toBeGreaterThan(0)
    expect(report.unregisteredCredentialRefs).toBeGreaterThan(0)
    expect(report.topAffectedItems.length).toBeGreaterThan(0)
    expect(report.latestAuditEvents[0].type).toBe('field-progress')
  })

  it('reports URL, path, repo, and database quality warnings', () => {
    expect(validateCalibrationDataQuality('publicUrl', 'midwaymusichall.com')).toEqual(
      expect.arrayContaining([expect.objectContaining({ level: 'warning' })]),
    )
    expect(validateCalibrationDataQuality('remoteBackendPath', '/home/mmh/public_html')).toEqual(
      expect.arrayContaining([expect.objectContaining({ message: expect.stringContaining('/api') })]),
    )
    expect(validateCalibrationDataQuality('repository', 'https://github.com/jmars319/JAMARQ-Atlas')).toEqual([])
    expect(validateCalibrationDataQuality('databaseName', 'password=abc')).toEqual(
      expect.arrayContaining([expect.objectContaining({ level: 'blocked' })]),
    )
  })
})
