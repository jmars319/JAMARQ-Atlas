import { describe, expect, it } from 'vitest'
import type { AtlasProject, Workspace } from '../src/domain/atlas'
import {
  addCadenceDays,
  evaluateVerification,
  markProjectVerified,
  normalizeWorkspaceVerificationCadence,
} from '../src/services/verification'

const baseProject: AtlasProject = {
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
    lastMeaningfulChange: '2026-05-01: created',
    lastVerified: '2026-05-01',
    currentRisk: 'None',
    blockers: [],
    deferredItems: [],
    notDoingItems: [],
    notes: ['Keep manual status intact.'],
    decisions: [],
  },
}

function workspaceWith(project: AtlasProject): Workspace {
  return {
    id: 'workspace',
    name: 'Workspace',
    purpose: 'Testing',
    sections: [
      {
        id: 'section',
        name: 'Section',
        summary: 'Section',
        groups: [
          {
            id: 'group',
            name: 'Group',
            summary: 'Group',
            projects: [project],
          },
        ],
      },
    ],
  }
}

describe('verification', () => {
  it('calculates due dates from cadence', () => {
    expect(addCadenceDays('2026-05-01', 'weekly')).toBe('2026-05-08')
    expect(addCadenceDays('2026-05-01', 'biweekly')).toBe('2026-05-15')
    expect(addCadenceDays('2026-05-01', 'monthly')).toBe('2026-05-31')
    expect(addCadenceDays('2026-05-01', 'quarterly')).toBe('2026-07-30')
    expect(addCadenceDays('2026-05-01', 'ad-hoc')).toBeNull()
  })

  it('classifies overdue, due, upcoming, recent, ad-hoc, and unverified projects', () => {
    const now = new Date('2026-05-09T12:00:00Z')

    expect(
      evaluateVerification(
        {
          ...baseProject,
          manual: {
            ...baseProject.manual,
            verificationCadence: 'weekly',
            lastVerified: '2026-05-01',
          },
        },
        now,
      ).dueState,
    ).toBe('overdue')
    expect(
      evaluateVerification(
        {
          ...baseProject,
          manual: {
            ...baseProject.manual,
            verificationCadence: 'weekly',
            lastVerified: '2026-05-02',
          },
        },
        now,
      ).dueState,
    ).toBe('due')
    expect(
      evaluateVerification(
        {
          ...baseProject,
          manual: {
            ...baseProject.manual,
            verificationCadence: 'biweekly',
            lastVerified: '2026-04-28',
          },
        },
        now,
      ).dueState,
    ).toBe('upcoming')
    expect(
      evaluateVerification(
        {
          ...baseProject,
          manual: {
            ...baseProject.manual,
            verificationCadence: 'monthly',
            lastVerified: '2026-05-08',
          },
        },
        now,
      ).dueState,
    ).toBe('recent')
    expect(
      evaluateVerification(
        {
          ...baseProject,
          manual: {
            ...baseProject.manual,
            verificationCadence: 'ad-hoc',
            lastVerified: '2026-01-01',
          },
        },
        now,
      ).dueState,
    ).toBe('ad-hoc')
    expect(
      evaluateVerification(
        {
          ...baseProject,
          manual: {
            ...baseProject.manual,
            verificationCadence: 'monthly',
            lastVerified: '',
          },
        },
        now,
      ).dueState,
    ).toBe('unverified')
  })

  it('normalizes existing workspace records without changing manual intent', () => {
    const legacyProject = {
      ...baseProject,
      manual: {
        ...baseProject.manual,
        status: 'Waiting',
        verificationCadence: undefined,
      },
    } as unknown as AtlasProject
    const normalized = normalizeWorkspaceVerificationCadence(workspaceWith(legacyProject))
    const project = normalized.sections[0].groups[0].projects[0]

    expect(project.manual.verificationCadence).toBe('monthly')
    expect(project.manual.status).toBe('Waiting')
    expect(project.manual.notes).toEqual(['Keep manual status intact.'])
  })

  it('marks verified without changing status, risk, or cadence', () => {
    const workspace = workspaceWith(baseProject)
    const next = markProjectVerified(
      workspace,
      'atlas',
      'Checked public and repo surfaces.',
      '2026-05-09',
    )
    const project = next.sections[0].groups[0].projects[0]

    expect(project.manual.lastVerified).toBe('2026-05-09')
    expect(project.manual.status).toBe('Active')
    expect(project.manual.currentRisk).toBe('None')
    expect(project.manual.verificationCadence).toBe('monthly')
    expect(project.activity[0]).toMatchObject({
      source: 'manual',
      type: 'verification',
      title: 'Manual verification recorded',
      detail: 'Checked public and repo surfaces.',
    })
  })
})
