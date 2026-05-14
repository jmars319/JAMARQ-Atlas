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
  emptyCalibrationState,
  scanAtlasCalibration,
  updateCalibrationFieldProgress,
  upsertCredentialReference,
} from '../src/services/calibration'
import {
  addReviewNote,
  addReviewSession,
  createReviewNote,
  createReviewSession,
  emptyReviewStore,
} from '../src/services/review'
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
import { buildReportTemplateFocus } from '../src/services/reportTemplates'
import { createDataIntegrityDiagnostics } from '../src/services/dataIntegrity'
import { emptySyncState } from '../src/services/syncSnapshots'
import { emptyWritingState } from '../src/domain/writing'
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

    expect(reports.schemaVersion).toBe(2)
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

  it('keeps report template focus definitions reusable by packet type', () => {
    expect(buildReportTemplateFocus('client-update-packet')).toContain('client-safe')
    expect(buildReportTemplateFocus('release-packet')).toContain('release context')
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

  it('includes Review Center notes in internal weekly and handoff packets', () => {
    const review = addReviewNote(
      emptyReviewStore(now),
      createReviewNote({
        id: 'report-review-note',
        projectId: 'vaexcore-studio',
        source: 'workspace',
        outcome: 'needs-follow-up',
        body: 'Review Center note for weekly packet.',
        now,
      }),
    )
    const packet = createReportPacket({
      type: 'internal-weekly-packet',
      projectRecords,
      dispatch: seedDispatchState,
      reports: emptyReportsStore(now),
      review,
      planning: emptyPlanningStore(now),
      writingDrafts: [],
      projectIds: ['vaexcore-studio'],
      writingDraftIds: [],
      now,
    })

    expect(packet.markdown).toContain('Review Center Notes')
    expect(packet.markdown).toContain('Review Center note for weekly packet.')
    expect(packet.markdown).toContain('Review Center notes are human-authored context only')
  })

  it('includes Calibration Operations summaries in operator and deployment packets', () => {
    const issues = scanAtlasCalibration(seedWorkspace, seedDispatchState, [], [])
    const issue = issues.find((candidate) => candidate.field === 'remoteHost')

    if (!issue) {
      throw new Error('Expected calibration issue.')
    }

    const progressed = updateCalibrationFieldProgress(
      emptyCalibrationState(now),
      issue,
      'verified',
      'Confirmed non-secret host label.',
      'operator',
      now,
    )
    const savedReference = upsertCredentialReference(progressed, {
      label: 'godaddy-mmh-production',
      provider: 'GoDaddy cPanel',
      purpose: 'Production host reference label',
      targetIds: ['midway-music-hall-production'],
      now,
    })
    const calibration = savedReference.ok ? savedReference.state : progressed
    const packet = createReportPacket({
      type: 'internal-weekly-packet',
      projectRecords,
      dispatch: seedDispatchState,
      reports: emptyReportsStore(now),
      planning: emptyPlanningStore(now),
      writingDrafts: [],
      projectIds: ['midway-music-hall-site'],
      writingDraftIds: [],
      calibration,
      calibrationIssues: issues,
      now,
    })

    expect(packet.markdown).toContain('Calibration Operations')
    expect(packet.markdown).toContain('Progress records: 1')
    expect(packet.markdown).toContain('Verified: 1')
    expect(packet.markdown).toContain('Credential references: 1')
    expect(packet.markdown).toContain('Unregistered credential refs:')
    expect(packet.markdown).toContain('godaddy-mmh-production: GoDaddy cPanel')
  })

  it('creates operations readiness packets from Ops Cockpit context', () => {
    const calibration = emptyCalibrationState(now)
    const planning = emptyPlanningStore(now)
    const reports = emptyReportsStore(now)
    const review = emptyReviewStore(now)
    const diagnostics = createDataIntegrityDiagnostics({
      workspace: seedWorkspace,
      dispatch: seedDispatchState,
      writing: emptyWritingState,
      planning,
      reports,
      review,
      calibration,
    })
    const packet = createReportPacket({
      type: 'operations-readiness-packet',
      workspace: seedWorkspace,
      projectRecords,
      dispatch: seedDispatchState,
      reports,
      review,
      planning,
      writingDrafts: [],
      projectIds: ['midway-mobile-storage-site'],
      writingDraftIds: [],
      calibration,
      calibrationIssues: scanAtlasCalibration(seedWorkspace, seedDispatchState, [], []),
      sync: emptySyncState(now),
      dataIntegrityDiagnostics: diagnostics,
      now,
    })

    expect(packet.type).toBe('operations-readiness-packet')
    expect(packet.markdown).toContain('Ops Cockpit Summary')
    expect(packet.markdown).toContain('Top Daily Queue')
    expect(packet.markdown).toContain('Recovery Gaps')
    expect(packet.markdown).toContain('Snapshot Status')
    expect(packet.contextWarnings).not.toContain(
      'No approved or exported Writing drafts are included.',
    )
  })

  it('includes explicitly selected Review sessions and notes in report packets', () => {
    const initialReview = emptyReviewStore(now)
    const session = createReviewSession({
      id: 'selected-review-session',
      title: 'Deploy follow-up review',
      itemIds: ['dispatch-closeout-midway-mobile-storage-production'],
      projectIds: ['midway-mobile-storage-site'],
      now,
    })
    const note = createReviewNote({
      id: 'selected-review-note',
      sessionId: session.id,
      projectId: 'midway-mobile-storage-site',
      itemId: 'dispatch-closeout-midway-mobile-storage-production',
      source: 'dispatch',
      outcome: 'needs-follow-up',
      body: 'Selected deploy follow-up note.',
      now,
    })
    const review = addReviewNote(addReviewSession(initialReview, session), note)
    const packet = createReportPacket({
      type: 'dispatch-closeout-summary-packet',
      projectRecords,
      dispatch: seedDispatchState,
      reports: emptyReportsStore(now),
      review,
      planning: emptyPlanningStore(now),
      writingDrafts: [],
      projectIds: ['midway-mobile-storage-site'],
      writingDraftIds: [],
      reviewNoteIds: [note.id],
      reviewSessionIds: [session.id],
      now,
    })

    expect(packet.reviewNoteIds).toEqual([note.id])
    expect(packet.reviewSessionIds).toEqual([session.id])
    expect(packet.markdown).toContain('Selected Review notes')
    expect(packet.markdown).toContain('Selected deploy follow-up note.')
    expect(packet.markdown).toContain('Dispatch closeout summary')
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
    const dispatchWithEvidence = {
      ...recorded.state,
      hostEvidenceRuns: [
        {
          id: 'host-evidence-report',
          source: 'host-preflight' as const,
          projectId: 'midway-mobile-storage-site',
          targetId: 'midway-mobile-storage-production',
          startedAt: '2026-05-10T11:40:00Z',
          completedAt: '2026-05-10T11:40:00Z',
          status: 'not-configured' as const,
          summary: 'Read-only host preflight is not configured for this target.',
          credentialRef: 'godaddy-mms-production',
          checks: [],
          warnings: ['Read-only host preflight is not configured for this target.'],
        },
      ],
      verificationEvidenceRuns: [
        {
          id: 'verification-evidence-report',
          source: 'runbook-verification' as const,
          projectId: 'midway-mobile-storage-site',
          targetId: 'midway-mobile-storage-production',
          runbookId: 'mms-cpanel-runbook',
          startedAt: '2026-05-10T11:42:00Z',
          completedAt: '2026-05-10T11:42:00Z',
          status: 'passing' as const,
          summary: 'Runbook verification checks matched expected statuses.',
          checks: [],
          warnings: [],
        },
      ],
    }
    const packet = createReportPacket({
      type: 'deployment-readiness-packet',
      projectRecords,
      dispatch: dispatchWithEvidence,
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
    expect(packet.markdown).toContain('Dispatch Closeout Analytics')
    expect(packet.markdown).toContain('Closeout state:')
    expect(packet.markdown).toContain('Deployment report packet')
    expect(packet.markdown).toContain('Outside-Atlas upload completed')
    expect(packet.markdown).toContain('operator note 2026-05-10')
    expect(packet.markdown).toContain(recorded.recordId ?? 'manual-deployment')
    expect(packet.markdown).toContain('Stored Dispatch Evidence')
    expect(packet.markdown).toContain('host-evidence-report')
    expect(packet.markdown).toContain('verification-evidence-report')
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
