import { describe, expect, it } from 'vitest'
import { seedDispatchState } from '../src/data/seedDispatch'
import { seedWorkspace } from '../src/data/seedWorkspace'
import type { DeploymentTarget } from '../src/domain/dispatch'
import {
  canStoreCalibrationValue,
  isPlaceholderValue,
  scanAtlasCalibration,
} from '../src/services/calibration'
import { replaceDeploymentTarget } from '../src/services/dispatchStorage'

describe('Atlas calibration checks', () => {
  it('finds seed Dispatch placeholder values', () => {
    const issues = scanAtlasCalibration(seedWorkspace, seedDispatchState)

    expect(issues.some((issue) => issue.field === 'remoteHost')).toBe(true)
    expect(issues.some((issue) => issue.field === 'remoteFrontendPath')).toBe(true)
    expect(issues.some((issue) => issue.category === 'github-bindings')).toBe(true)
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
})
