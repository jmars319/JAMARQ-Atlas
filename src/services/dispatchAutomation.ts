import type {
  DeploymentRunnerPhase,
  DeploymentTarget,
  DeploymentRecord,
  DeploymentRunbook,
  DispatchAutomationChecklistItem,
  DispatchAutomationDryRunPlan,
  DispatchAutomationDryRunStep,
  DispatchAutomationReadiness,
  DispatchReadiness,
  DispatchWriteAutomationGate,
  DispatchWriteAutomationGateEvaluation,
} from '../domain/dispatch'
import { deploymentRunnerPhases } from './dispatchRunner'

export interface DispatchAutomationEvaluation {
  ready: boolean
  completeChecklistItems: number
  totalChecklistItems: number
  blockers: string[]
  warnings: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function safeDate(value: unknown, fallback: Date) {
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) {
    return value
  }

  return fallback.toISOString()
}

function defaultChecklist(target: DeploymentTarget): DispatchAutomationChecklistItem[] {
  return [
    {
      id: `${target.id}-runbook-reviewed`,
      label: 'Runbook reviewed for this target',
      required: true,
      complete: false,
      notes: '',
    },
    {
      id: `${target.id}-artifact-defined`,
      label: 'Expected artifact and source ref are defined',
      required: true,
      complete: false,
      notes: '',
    },
    {
      id: `${target.id}-backup-defined`,
      label: target.backupRequired
        ? 'Backup command and storage location are defined'
        : 'Backup posture reviewed',
      required: target.backupRequired,
      complete: !target.backupRequired,
      notes: '',
    },
    {
      id: `${target.id}-rollback-defined`,
      label: 'Rollback reference and manual fallback are defined',
      required: true,
      complete: false,
      notes: '',
    },
    {
      id: `${target.id}-confirmations-defined`,
      label: 'Required typed confirmations are documented',
      required: target.destructiveOperationsRequireConfirmation,
      complete: !target.destructiveOperationsRequireConfirmation,
      notes: '',
    },
  ]
}

export function createDefaultAutomationReadiness(
  target: DeploymentTarget,
  now = new Date(),
): DispatchAutomationReadiness {
  return {
    projectId: target.projectId,
    targetId: target.id,
    runbookNotes: ['No live deployment automation is enabled. Document manual runbook steps first.'],
    requiredConfirmations: target.destructiveOperationsRequireConfirmation
      ? ['Typed production confirmation phrase not configured yet.']
      : [],
    checklistItems: defaultChecklist(target),
    artifactExpectations: ['Artifact name, build command, and source ref need confirmation.'],
    backupRequirements: target.backupRequired
      ? ['Production backup must be verified before any future write-capable workflow.']
      : ['Backup is not required by current target settings; confirm before automation.'],
    rollbackRequirements: ['Rollback reference and restore procedure need confirmation.'],
    dryRunNotes: ['Dry-run planner is advisory only and executes no deployment commands.'],
    lastReviewedAt: now.toISOString(),
  }
}

function normalizeChecklistItem(
  value: unknown,
  fallback: DispatchAutomationChecklistItem,
): DispatchAutomationChecklistItem {
  if (!isRecord(value)) {
    return fallback
  }

  return {
    id: readString(value.id) || fallback.id,
    label: readString(value.label) || fallback.label,
    required: typeof value.required === 'boolean' ? value.required : fallback.required,
    complete: typeof value.complete === 'boolean' ? value.complete : fallback.complete,
    notes: readString(value.notes),
  }
}

export function normalizeAutomationReadiness(
  value: unknown,
  target: DeploymentTarget,
  now = new Date(),
): DispatchAutomationReadiness {
  const defaults = createDefaultAutomationReadiness(target, now)

  if (!isRecord(value)) {
    return defaults
  }

  const existingChecklist = Array.isArray(value.checklistItems) ? value.checklistItems : []
  const checklistItems = defaults.checklistItems.map((fallback) => {
    const existing = existingChecklist.find(
      (item) => isRecord(item) && readString(item.id) === fallback.id,
    )
    return normalizeChecklistItem(existing, fallback)
  })

  return {
    projectId: readString(value.projectId) || target.projectId,
    targetId: readString(value.targetId) || target.id,
    runbookNotes: readStringArray(value.runbookNotes),
    requiredConfirmations: readStringArray(value.requiredConfirmations),
    checklistItems,
    artifactExpectations: readStringArray(value.artifactExpectations),
    backupRequirements: readStringArray(value.backupRequirements),
    rollbackRequirements: readStringArray(value.rollbackRequirements),
    dryRunNotes: readStringArray(value.dryRunNotes),
    lastReviewedAt: safeDate(value.lastReviewedAt, now),
  }
}

export function findAutomationReadiness(
  readiness: DispatchAutomationReadiness[],
  target: DeploymentTarget,
) {
  return (
    readiness.find(
      (candidate) => candidate.projectId === target.projectId && candidate.targetId === target.id,
    ) ?? createDefaultAutomationReadiness(target)
  )
}

export function evaluateAutomationReadiness(
  target: DeploymentTarget,
  readiness: DispatchAutomationReadiness,
): DispatchAutomationEvaluation {
  const requiredItems = readiness.checklistItems.filter((item) => item.required)
  const incompleteRequired = requiredItems.filter((item) => !item.complete)
  const blockers = [
    ...incompleteRequired.map((item) => `Required checklist item incomplete: ${item.label}`),
    ...(target.destructiveOperationsRequireConfirmation && readiness.requiredConfirmations.length === 0
      ? ['Destructive confirmation phrase is not documented.']
      : []),
    ...(target.backupRequired && readiness.backupRequirements.length === 0
      ? ['Backup requirements are not documented.']
      : []),
    ...(readiness.rollbackRequirements.length === 0
      ? ['Rollback requirements are not documented.']
      : []),
  ]
  const warnings = [
    ...(readiness.artifactExpectations.length === 0
      ? ['Artifact expectations are not documented.']
      : []),
    ...(readiness.runbookNotes.length === 0 ? ['Runbook notes are empty.'] : []),
  ]

  return {
    ready: blockers.length === 0,
    completeChecklistItems: readiness.checklistItems.filter((item) => item.complete).length,
    totalChecklistItems: readiness.checklistItems.length,
    blockers,
    warnings,
  }
}

function phaseRequiresConfirmation(phase: DeploymentRunnerPhase, target: DeploymentTarget) {
  return (
    phase === 'backup' ||
    phase === 'upload' ||
    phase === 'release' ||
    phase === 'rollback' ||
    target.destructiveOperationsRequireConfirmation
  )
}

export function createDispatchAutomationDryRunPlan({
  target,
  readiness,
  now = new Date(),
}: {
  target: DeploymentTarget
  readiness: DispatchAutomationReadiness
  now?: Date
}): DispatchAutomationDryRunPlan {
  const evaluation = evaluateAutomationReadiness(target, readiness)
  const steps: DispatchAutomationDryRunStep[] = deploymentRunnerPhases.map((phase) => ({
    phase,
    status: evaluation.blockers.length > 0 && phase !== 'preflight' ? 'blocked' : 'not-implemented',
    requiresConfirmation: phaseRequiresConfirmation(phase, target),
    message:
      'Dry-run planner is advisory only. No SSH, SFTP, cPanel, GoDaddy, file, database, release, rollback, or deployment command was executed.',
    blockers: phase === 'preflight' ? evaluation.blockers : [],
    warnings: phase === 'preflight' ? evaluation.warnings : [],
  }))

  return {
    targetId: target.id,
    projectId: target.projectId,
    generatedAt: now.toISOString(),
    status: evaluation.blockers.length > 0 ? 'blocked' : 'advisory',
    summary:
      evaluation.blockers.length > 0
        ? 'Automation dry-run plan is blocked by incomplete readiness documentation.'
        : 'Automation dry-run plan is advisory and not implemented for execution.',
    blockers: evaluation.blockers,
    warnings: evaluation.warnings,
    steps,
  }
}

function hasRealConfirmation(value: string) {
  const lower = value.toLowerCase()
  return Boolean(value.trim()) && !lower.includes('not configured') && !lower.includes('placeholder')
}

export function evaluateDispatchWriteAutomationGate({
  target,
  readiness,
  automationReadiness,
  latestDeployment,
  runbook,
  dryRunPlan,
}: {
  target: DeploymentTarget
  readiness?: DispatchReadiness
  automationReadiness: DispatchAutomationReadiness
  latestDeployment?: DeploymentRecord
  runbook?: DeploymentRunbook
  dryRunPlan?: DispatchAutomationDryRunPlan
}): DispatchWriteAutomationGateEvaluation {
  const requiredArtifacts = runbook?.artifacts.filter((artifact) => artifact.required) ?? []
  const requiredPreservePaths = runbook?.preservePaths.filter((path) => path.required) ?? []
  const verificationChecks = runbook?.verificationChecks ?? []
  const gates: DispatchWriteAutomationGate[] = [
    {
      id: 'verified-backup',
      label: 'Verified backup',
      required: target.backupRequired,
      satisfied: !target.backupRequired || Boolean(readiness?.backupReady),
      evidence: target.backupRequired
        ? readiness?.backupReady
          ? 'Backup is manually marked ready.'
          : 'Backup is required and not manually marked ready.'
        : 'Backup is not required by current target settings.',
    },
    {
      id: 'artifact-checksum',
      label: 'Artifact checksum',
      required: true,
      satisfied:
        requiredArtifacts.length > 0 &&
        requiredArtifacts.every((artifact) => artifact.checksum.startsWith('sha256-')),
      evidence:
        requiredArtifacts.length > 0
          ? `${requiredArtifacts.filter((artifact) => artifact.checksum.startsWith('sha256-')).length}/${requiredArtifacts.length} required artifacts have local checksum evidence.`
          : 'No required artifacts are defined.',
    },
    {
      id: 'preserve-path-confirmation',
      label: 'Preserve path confirmation',
      required: true,
      satisfied: requiredPreservePaths.length > 0,
      evidence:
        requiredPreservePaths.length > 0
          ? `${requiredPreservePaths.length} preserve/create paths are documented.`
          : 'No preserve/create paths are documented.',
    },
    {
      id: 'rollback-reference',
      label: 'Rollback reference',
      required: true,
      satisfied: Boolean(latestDeployment?.rollbackRef),
      evidence: latestDeployment?.rollbackRef
        ? `Latest deployment has rollback ref ${latestDeployment.rollbackRef}.`
        : 'No rollback reference is recorded on the latest deployment record.',
    },
    {
      id: 'typed-confirmation',
      label: 'Typed confirmation',
      required: target.destructiveOperationsRequireConfirmation,
      satisfied:
        !target.destructiveOperationsRequireConfirmation ||
        automationReadiness.requiredConfirmations.some(hasRealConfirmation),
      evidence: target.destructiveOperationsRequireConfirmation
        ? automationReadiness.requiredConfirmations.some(hasRealConfirmation)
          ? 'A non-placeholder typed confirmation requirement is documented.'
          : 'Typed confirmation is required but not documented with a real phrase.'
        : 'Target does not currently require destructive typed confirmation.',
    },
    {
      id: 'dry-run-pass',
      label: 'Dry-run pass',
      required: true,
      satisfied: dryRunPlan?.status === 'advisory',
      evidence:
        dryRunPlan?.status === 'advisory'
          ? 'Latest no-op dry-run plan has no readiness blockers.'
          : 'No passing dry-run evidence is persisted for write automation.',
    },
    {
      id: 'post-deploy-verification-plan',
      label: 'Post-deploy verification plan',
      required: true,
      satisfied: verificationChecks.length > 0,
      evidence:
        verificationChecks.length > 0
          ? `${verificationChecks.length} post-deploy verification checks are documented.`
          : 'No post-deploy verification checks are documented.',
    },
  ]
  const incompleteRequired = gates.filter((gate) => gate.required && !gate.satisfied)

  return {
    targetId: target.id,
    projectId: target.projectId,
    locked: true,
    status: 'locked',
    summary: `Write automation locked. ${gates.filter((gate) => gate.satisfied).length}/${gates.length} gates have evidence.`,
    gates,
    blockers: [
      'Write-capable deployment automation is intentionally locked in this Atlas phase.',
      ...incompleteRequired.map((gate) => `Required gate incomplete: ${gate.label}`),
    ],
    warnings: [
      'Future approval must happen before upload, release, rollback, SSH/SFTP write, cPanel write, or database operation code is added.',
    ],
  }
}

export function canExecuteWriteAutomation(evaluation: DispatchWriteAutomationGateEvaluation) {
  void evaluation
  return false
}
