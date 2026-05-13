import { describe, expect, it } from 'vitest'
import { seedDispatchState } from '../src/data/seedDispatch'
import { seedWorkspace } from '../src/data/seedWorkspace'
import { flattenProjects } from '../src/domain/atlas'
import {
  addPlanningItem,
  createPlanningItem,
  emptyPlanningStore,
} from '../src/services/planning'
import {
  MANUAL_DEPLOYMENT_RECORD_CONFIRMATION,
  recordManualDeploymentFromSession,
  startDeploySession,
  updateDeploySessionStep,
} from '../src/services/deploySessions'
import {
  addReportPacket,
  archiveReportPacket,
  createReportPacket,
  emptyReportsStore,
  markReportExported,
  normalizeReportsState,
  recordReportCopied,
  reportGuardrails,
  updateReportPacketMarkdown,
} from '../src/services/reports'
import type { WritingDraft } from '../src/domain/writing'

const now = new Date('2026-05-10T12:00:00Z')
const projectRecords = flattenProjects(seedWorkspace)
const vaexcoreStudio = projectRecords.find((record) => record.project.id === 'vaexcore-studio')

if (!vaexcoreStudio) {
  throw new Error('Expected VaexCore Studio seed project.')
}

const approvedDraft: WritingDraft = {
  id: 'draft-approved-1',
  projectId: 'vaexcore-studio',
  templateId: 'client-update',
  title: 'Client update - VaexCore Studio',
  status: 'approved',
  reviewEvents: [],
  draftText: 'Approved client update text.',
  promptPacket: 'Prompt packet.',
  contextSnapshot: {
    projectId: 'vaexcore-studio',
    projectName: 'VaexCore Studio',
    sectionName: 'VaexCore',
    groupName: 'Studio',
    capturedAt: '2026-05-10T11:00:00Z',
    manual: {
      status: 'Active',
      nextAction: '',
      lastMeaningfulChange: '',
      lastVerified: '2026-05-10',
      currentRisk: '',
      blockers: [],
      deferredItems: [],
      notDoingItems: [],
      notes: [],
      decisions: [],
    },
    activity: [],
    verification: {
      cadence: 'monthly',
      dueState: 'recent',
      lastVerified: '2026-05-10',
      dueDate: '2026-06-09',
    },
    dispatch: [],
    github: {
      repository: 'jmars319/JAMARQ-Atlas',
      overview: null,
      latestCommits: [],
      warnings: ['GitHub checks unavailable.'],
    },
    warnings: [],
  },
  providerResult: {
    status: 'stub',
    providerName: 'local-stub',
    model: '',
    message: '',
    generatedText: null,
    generatedAt: null,
  },
  notes: '',
  createdAt: '2026-05-10T11:00:00Z',
  updatedAt: '2026-05-10T12:00:00Z',
}

describe('report packet builder', () => {
  it('normalizes missing report storage into an empty local store', () => {
    const reports = normalizeReportsState(null, now)

    expect(reports.schemaVersion).toBe(1)
    expect(reports.packets).toEqual([])
    expect(reports.updatedAt).toBe(now.toISOString())
  })

  it('creates Markdown report packets from approved writing and operational context', () => {
    const planning = addPlanningItem(
      emptyPlanningStore(now),
      createPlanningItem({
        id: 'planning-objective-report',
        kind: 'objective',
        projectId: 'vaexcore-studio',
        title: 'Report-ready objective',
        detail: 'Keep operator context clear.',
        now,
      }),
      now,
    )
    const packet = createReportPacket({
      type: 'client-update-packet',
      projectRecords,
      dispatch: seedDispatchState,
      planning,
      writingDrafts: [approvedDraft],
      projectIds: ['vaexcore-studio'],
      writingDraftIds: [approvedDraft.id],
      now,
    })

    expect(packet.markdown).toContain('Approved client update text.')
    expect(packet.markdown).toContain('Report-ready objective')
    expect(packet.markdown).toContain('Dispatch Posture')
    expect(packet.markdown).toContain(reportGuardrails[0])
    expect(packet.sourceSummary[0]).toMatchObject({
      projectId: 'vaexcore-studio',
      planningItems: 1,
    })
  })

  it('does not include unapproved writing drafts in packets', () => {
    const packet = createReportPacket({
      type: 'release-packet',
      projectRecords,
      dispatch: seedDispatchState,
      planning: emptyPlanningStore(now),
      writingDrafts: [{ ...approvedDraft, id: 'draft-unapproved', status: 'draft' }],
      projectIds: ['vaexcore-studio'],
      writingDraftIds: ['draft-unapproved'],
      now,
    })

    expect(packet.writingDraftIds).toEqual([])
    expect(packet.contextWarnings).toContain('No approved or exported Writing drafts are included.')
  })

  it('creates deployment report packets with runbooks, artifacts, preserve paths, checks, and guardrails', () => {
    const sessionState = startDeploySession(
      seedDispatchState,
      'mms-cpanel-runbook',
      new Date('2026-05-10T11:30:00Z'),
    )
    const session = sessionState.deploySessions[0]
    const uploadStep = session.steps.find((step) => step.kind === 'outside-atlas-upload')

    if (!uploadStep) {
      throw new Error('Expected outside-Atlas upload step.')
    }

    const updatedSessionState = updateDeploySessionStep(
      sessionState,
      session.id,
      uploadStep.id,
      {
        status: 'confirmed',
        notes: 'Human uploaded frontend and backend artifacts through cPanel.',
        evidence: 'operator note 2026-05-10',
      },
      new Date('2026-05-10T11:45:00Z'),
    )
    const recorded = recordManualDeploymentFromSession(
      updatedSessionState,
      session.id,
      MANUAL_DEPLOYMENT_RECORD_CONFIRMATION,
      new Date('2026-05-10T11:50:00Z'),
    )
    const packet = createReportPacket({
      type: 'deployment-readiness-packet',
      projectRecords,
      dispatch: recorded.state,
      planning: emptyPlanningStore(now),
      writingDrafts: [],
      projectIds: ['midway-mobile-storage-site'],
      writingDraftIds: [],
      now,
    })

    expect(packet.markdown).toContain('Deployment Runbooks & Artifact Readiness')
    expect(packet.markdown).toContain('frontend-deploy.zip')
    expect(packet.markdown).toContain('backend-deploy.zip')
    expect(packet.markdown).toContain('/api/.env')
    expect(packet.markdown).toContain('/api/config.php (temporary)')
    expect(packet.markdown).toContain('/api/.env: expect 403/404')
    expect(packet.markdown).toContain('Deploy Session Evidence')
    expect(packet.markdown).toContain('Outside-Atlas upload completed')
    expect(packet.markdown).toContain('operator note 2026-05-10')
    expect(packet.markdown).toContain(recorded.recordId ?? 'manual-deployment')
    expect(packet.markdown).toContain('Export does not mean anything was sent')
    expect(packet.auditEvents).toHaveLength(1)
  })

  it('records copy/export/archive audit without mutating source stores', () => {
    const workspaceBefore = JSON.stringify(seedWorkspace)
    const writingBefore = JSON.stringify([approvedDraft])
    const packet = createReportPacket({
      type: 'project-handoff-packet',
      projectRecords,
      dispatch: seedDispatchState,
      planning: emptyPlanningStore(now),
      writingDrafts: [approvedDraft],
      projectIds: ['vaexcore-studio'],
      writingDraftIds: [approvedDraft.id],
      now,
    })
    const state = addReportPacket(emptyReportsStore(now), packet, now)
    const updated = updateReportPacketMarkdown(
      state,
      packet.id,
      `${packet.markdown}\nHuman edit.`,
      new Date('2026-05-10T13:00:00Z'),
    )
    const copied = recordReportCopied(updated, packet.id, new Date('2026-05-10T14:00:00Z'))
    const exported = markReportExported(copied, packet.id, new Date('2026-05-10T15:00:00Z'))
    const archived = archiveReportPacket(exported, packet.id, new Date('2026-05-10T16:00:00Z'))

    expect(archived.packets[0].status).toBe('archived')
    expect(archived.packets[0].auditEvents.map((event) => event.type)).toEqual([
      'created',
      'edited',
      'copied',
      'markdown-exported',
      'archived',
    ])
    expect(JSON.stringify(seedWorkspace)).toBe(workspaceBefore)
    expect(JSON.stringify([approvedDraft])).toBe(writingBefore)
  })
})
