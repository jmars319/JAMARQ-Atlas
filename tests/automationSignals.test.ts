import { describe, expect, it } from 'vitest'
import type { AtlasProject } from '../src/domain/atlas'
import { buildGithubSignals, buildManualSignals } from '../src/services/automationSignals'

const project: AtlasProject = {
  id: 'atlas',
  name: 'Atlas',
  kind: 'app',
  summary: 'Operator dashboard',
  repositories: [],
  links: [],
  activity: [],
  manual: {
    status: 'Active',
    verificationCadence: 'monthly',
    nextAction: 'Keep building',
    lastMeaningfulChange: '2026-05-09: created',
    lastVerified: '2026-05-01',
    currentRisk: 'None',
    blockers: ['Token permissions not configured'],
    deferredItems: [],
    notDoingItems: [],
    notes: [],
    decisions: [],
  },
}

describe('automation signals', () => {
  it('reports manual blockers without changing status', () => {
    const signals = buildManualSignals(project)

    expect(signals).toContainEqual(
      expect.objectContaining({
        source: 'manual',
        title: 'Manual blockers present',
      }),
    )
    expect(project.manual.status).toBe('Active')
  })

  it('reports commits newer than last verification as advisory GitHub signals', () => {
    const signals = buildGithubSignals({
      project,
      commits: [
        {
          sha: '123456789',
          shortSha: '1234567',
          message: 'change',
          author: 'jmars319',
          date: '2026-05-08T12:00:00Z',
          htmlUrl: 'https://github.com/example/repo/commit/123456789',
          verified: true,
          verificationReason: 'valid',
        },
      ],
    })

    expect(signals).toContainEqual(
      expect.objectContaining({
        source: 'github',
        title: 'Commits since verification',
      }),
    )
    expect(project.manual.lastVerified).toBe('2026-05-01')
  })

  it('reports GitHub permission errors as data gaps', () => {
    const signals = buildGithubSignals({
      project,
      errors: [
        {
          type: 'insufficient-permission',
          status: 403,
          resource: 'workflow-runs',
          message: 'The token does not have permission to read this GitHub resource.',
        },
      ],
    })

    expect(signals).toContainEqual(
      expect.objectContaining({
        source: 'github',
        title: 'GitHub data gap',
      }),
    )
  })
})
