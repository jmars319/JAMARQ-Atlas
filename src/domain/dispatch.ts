export type DeploymentEnvironment = 'production' | 'staging' | 'preview' | 'local' | 'other'

export type DeploymentHostType =
  | 'cpanel'
  | 'godaddy-cpanel'
  | 'vps'
  | 'static-host'
  | 'vercel'
  | 'netlify'
  | 'cloudflare-pages'
  | 'github-pages'
  | 'other'

export const DEPLOYMENT_STATUSES = [
  'not-configured',
  'configured',
  'ready',
  'blocked',
  'deploying',
  'verification',
  'stable',
  'failed',
  'rollback-needed',
  'archived',
] as const

export type DeploymentStatus = (typeof DEPLOYMENT_STATUSES)[number]

export type HealthCheckStatus = 'not-checked' | 'passing' | 'warning' | 'failed'

export interface HealthCheckResult {
  id: string
  url: string
  status: HealthCheckStatus
  checkedAt: string | null
  statusCode?: number
  message: string
}

export interface DeploymentTarget {
  id: string
  projectId: string
  name: string
  environment: DeploymentEnvironment
  hostType: DeploymentHostType
  credentialRef: string
  remoteHost: string
  remoteUser: string
  remoteFrontendPath: string
  remoteBackendPath: string
  publicUrl: string
  healthCheckUrls: string[]
  hasDatabase: boolean
  databaseName: string
  backupRequired: boolean
  destructiveOperationsRequireConfirmation: boolean
  status: DeploymentStatus
  lastVerified: string
  deploymentNotes: string[]
  blockers: string[]
  notes: string[]
}

export interface DeploymentRecord {
  id: string
  projectId: string
  targetId: string
  environment: DeploymentEnvironment
  versionLabel: string
  sourceRef: string
  commitSha: string
  artifactName: string
  startedAt: string
  completedAt: string
  status: DeploymentStatus
  deployedBy: string
  summary: string
  healthCheckResults: HealthCheckResult[]
  rollbackRef: string
  databaseBackupRef: string
  notes: string[]
}

export interface DispatchReadiness {
  projectId: string
  targetId: string
  repoCleanKnown: boolean
  buildStatusKnown: boolean
  artifactReady: boolean
  backupReady: boolean
  healthChecksDefined: boolean
  ready: boolean
  blocked: boolean
  blockers: string[]
  warnings: string[]
  lastCheckedAt: string
}

export type DispatchPreflightStatus = 'passing' | 'warning' | 'failed' | 'skipped'

export type DispatchPreflightCheckType =
  | 'target-config'
  | 'health'
  | 'backup'
  | 'rollback'
  | 'github-commit'
  | 'github-workflow'
  | 'github-release'
  | 'github-deployment'
  | 'github-permission'

export type DispatchPreflightSource = 'atlas' | 'dispatch' | 'health-check' | 'github'

export interface DispatchPreflightCheck {
  id: string
  type: DispatchPreflightCheckType
  source: DispatchPreflightSource
  label: string
  status: DispatchPreflightStatus
  message: string
  checkedAt: string
  url?: string
  details?: string[]
}

export interface DispatchPreflightRun {
  id: string
  projectId: string
  targetId: string
  startedAt: string
  completedAt: string
  status: DispatchPreflightStatus
  summary: string
  checks: DispatchPreflightCheck[]
}

export interface DispatchAutomationChecklistItem {
  id: string
  label: string
  required: boolean
  complete: boolean
  notes: string
}

export interface DispatchAutomationReadiness {
  projectId: string
  targetId: string
  runbookNotes: string[]
  requiredConfirmations: string[]
  checklistItems: DispatchAutomationChecklistItem[]
  artifactExpectations: string[]
  backupRequirements: string[]
  rollbackRequirements: string[]
  dryRunNotes: string[]
  lastReviewedAt: string
}

export interface DispatchAutomationDryRunStep {
  phase: DeploymentRunnerPhase
  status: 'not-implemented' | 'skipped' | 'blocked'
  requiresConfirmation: boolean
  message: string
  blockers: string[]
  warnings: string[]
}

export interface DispatchAutomationDryRunPlan {
  targetId: string
  projectId: string
  generatedAt: string
  status: 'advisory' | 'blocked'
  summary: string
  blockers: string[]
  warnings: string[]
  steps: DispatchAutomationDryRunStep[]
}

export type DispatchWriteAutomationGateId =
  | 'verified-backup'
  | 'artifact-checksum'
  | 'preserve-path-confirmation'
  | 'rollback-reference'
  | 'typed-confirmation'
  | 'dry-run-pass'
  | 'post-deploy-verification-plan'

export interface DispatchWriteAutomationGate {
  id: DispatchWriteAutomationGateId
  label: string
  required: boolean
  satisfied: boolean
  evidence: string
}

export interface DispatchWriteAutomationGateEvaluation {
  targetId: string
  projectId: string
  locked: true
  status: 'locked'
  summary: string
  gates: DispatchWriteAutomationGate[]
  blockers: string[]
  warnings: string[]
}

export type DeploymentArtifactRole = 'frontend' | 'backend' | 'placeholder'

export interface DeploymentArtifact {
  id: string
  projectId: string
  targetId: string
  filename: string
  role: DeploymentArtifactRole
  sourceRepo: string
  targetPath: string
  required: boolean
  onlyWhenFullAppReady: boolean
  checksum: string
  inspectedAt: string
  warnings: string[]
  notes: string[]
}

export interface DeploymentPreservePath {
  id: string
  projectId: string
  targetId: string
  path: string
  reason: string
  required: boolean
  temporary: boolean
  notes: string[]
}

export interface DeploymentVerificationCheck {
  id: string
  projectId: string
  targetId: string
  label: string
  method: 'HEAD' | 'GET'
  urlPath: string
  expectedStatuses: number[]
  protectedResource: boolean
  notes: string[]
}

export interface DeploymentRunbook {
  id: string
  projectId: string
  targetId: string
  siteName: string
  summary: string
  deployOrder: number
  enabled: boolean
  notes: string[]
  artifacts: DeploymentArtifact[]
  preservePaths: DeploymentPreservePath[]
  verificationChecks: DeploymentVerificationCheck[]
  manualDeployNotes: string[]
}

export interface DeploymentOrderGroup {
  id: string
  name: string
  description: string
  runbookIds: string[]
  notes: string[]
}

export type HostConnectionCheckStatus =
  | 'not-configured'
  | 'passing'
  | 'warning'
  | 'failed'
  | 'skipped'

export type HostConnectionProbeMode = 'tcp' | 'local-mirror' | 'sftp-readonly'

export type HostConnectionAuthMethod =
  | 'none'
  | 'password-env'
  | 'private-key-env'
  | 'not-configured'

export type HostConnectionCheckType =
  | 'credential-reference'
  | 'host-reachable'
  | 'sftp-connect'
  | 'target-root'
  | 'api-root'
  | 'preserve-path'

export interface HostConnectionCheck {
  id: string
  type: HostConnectionCheckType
  label: string
  status: HostConnectionCheckStatus
  message: string
  checkedAt: string
  path?: string
  host?: string
  probeMode?: HostConnectionProbeMode
  authMethod?: HostConnectionAuthMethod
  entryCount?: number
  fileCount?: number
  directoryCount?: number
  symlinkCount?: number
}

export interface HostConnectionPreflightResult {
  targetId: string
  configured: boolean
  status: HostConnectionCheckStatus
  checkedAt: string
  credentialRef: string
  probeMode: HostConnectionProbeMode
  authMethod: HostConnectionAuthMethod
  message: string
  checks: HostConnectionCheck[]
  warnings: string[]
}

export type DispatchEvidenceSource = 'host-preflight' | 'runbook-verification'

export type DispatchEvidenceStatus = HostConnectionCheckStatus

export interface DispatchHostEvidenceRun {
  id: string
  source: 'host-preflight'
  projectId: string
  targetId: string
  startedAt: string
  completedAt: string
  status: DispatchEvidenceStatus
  summary: string
  credentialRef: string
  probeMode: HostConnectionProbeMode
  authMethod: HostConnectionAuthMethod
  checks: HostConnectionCheck[]
  warnings: string[]
}

export interface DispatchVerificationEvidenceCheck {
  id: string
  label: string
  method: 'HEAD' | 'GET'
  url: string
  urlPath: string
  expectedStatuses: number[]
  protectedResource: boolean
  status: DispatchEvidenceStatus
  observedStatusCode?: number
  message: string
  checkedAt: string
}

export interface DispatchVerificationEvidenceRun {
  id: string
  source: 'runbook-verification'
  projectId: string
  targetId: string
  runbookId: string
  startedAt: string
  completedAt: string
  status: DispatchEvidenceStatus
  summary: string
  checks: DispatchVerificationEvidenceCheck[]
  warnings: string[]
}

export interface DispatchEvidenceRetentionPolicy {
  hostRunLimit: number
  verificationRunLimit: number
  preserveFailedRuns: boolean
}

export type DispatchDeploySessionStatus =
  | 'active'
  | 'blocked'
  | 'completed'
  | 'recorded'
  | 'archived'

export type DispatchDeploySessionStepStatus =
  | 'pending'
  | 'in-progress'
  | 'confirmed'
  | 'skipped'
  | 'blocked'

export type DispatchDeploySessionStepKind =
  | 'preflight'
  | 'artifact-inspection'
  | 'preserve-paths'
  | 'backup-readiness'
  | 'outside-atlas-upload'
  | 'verification-checks'
  | 'notes'
  | 'post-deploy-wrap-up'

export interface DispatchDeploySessionStep {
  id: string
  kind: DispatchDeploySessionStepKind
  label: string
  status: DispatchDeploySessionStepStatus
  detail: string
  evidence: string
  notes: string
  updatedAt: string
}

export type DispatchDeploySessionEventType =
  | 'created'
  | 'step-updated'
  | 'session-updated'
  | 'completed'
  | 'manual-deployment-recorded'

export interface DispatchDeploySessionEvent {
  id: string
  sessionId: string
  type: DispatchDeploySessionEventType
  occurredAt: string
  detail: string
}

export interface DispatchDeploySession {
  id: string
  projectId: string
  targetId: string
  runbookId: string
  orderGroupId: string
  siteName: string
  status: DispatchDeploySessionStatus
  startedAt: string
  updatedAt: string
  completedAt: string | null
  recordedDeploymentRecordId: string | null
  versionLabel: string
  sourceRef: string
  commitSha: string
  artifactName: string
  deployedBy: string
  summary: string
  recordStatus: DeploymentStatus
  rollbackRef: string
  databaseBackupRef: string
  steps: DispatchDeploySessionStep[]
  events: DispatchDeploySessionEvent[]
}

export interface DispatchState {
  targets: DeploymentTarget[]
  records: DeploymentRecord[]
  readiness: DispatchReadiness[]
  preflightRuns: DispatchPreflightRun[]
  automationReadiness: DispatchAutomationReadiness[]
  runbooks: DeploymentRunbook[]
  orderGroups: DeploymentOrderGroup[]
  deploySessions: DispatchDeploySession[]
  hostEvidenceRuns: DispatchHostEvidenceRun[]
  verificationEvidenceRuns: DispatchVerificationEvidenceRun[]
  evidenceRetentionPolicy?: DispatchEvidenceRetentionPolicy
}

export type DeploymentRunnerPhase =
  | 'preflight'
  | 'backup'
  | 'package'
  | 'upload'
  | 'release'
  | 'verify'
  | 'rollback'

export interface DeploymentRunnerResult {
  phase: DeploymentRunnerPhase
  status: 'not-implemented' | 'skipped' | 'blocked'
  requiresConfirmation: boolean
  message: string
}

export function findTargetsForProject(state: DispatchState, projectId: string) {
  return state.targets.filter((target) => target.projectId === projectId)
}

export function findReadiness(
  state: DispatchState,
  projectId: string,
  targetId: string,
): DispatchReadiness | undefined {
  return state.readiness.find(
    (readiness) => readiness.projectId === projectId && readiness.targetId === targetId,
  )
}

export function getTargetRecords(state: DispatchState, targetId: string) {
  return state.records
    .filter((record) => record.targetId === targetId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function getLatestDeploymentRecord(state: DispatchState, targetId: string) {
  return getTargetRecords(state, targetId)[0]
}

export function getTargetPreflightRuns(state: DispatchState, targetId: string) {
  return state.preflightRuns
    .filter((run) => run.targetId === targetId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function getLatestPreflightRun(state: DispatchState, targetId: string) {
  return getTargetPreflightRuns(state, targetId)[0]
}

export function getRunbookForTarget(state: DispatchState, targetId: string) {
  return state.runbooks.find((runbook) => runbook.targetId === targetId)
}

export function getTargetDeploySessions(state: DispatchState, targetId: string) {
  return state.deploySessions
    .filter((session) => session.targetId === targetId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function getActiveDeploySession(state: DispatchState, targetId: string) {
  return getTargetDeploySessions(state, targetId).find((session) =>
    ['active', 'blocked', 'completed'].includes(session.status),
  )
}

export function getTargetHostEvidenceRuns(state: DispatchState, targetId: string) {
  return state.hostEvidenceRuns
    .filter((run) => run.targetId === targetId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function getLatestHostEvidenceRun(state: DispatchState, targetId: string) {
  return getTargetHostEvidenceRuns(state, targetId)[0]
}

export function getTargetVerificationEvidenceRuns(
  state: DispatchState,
  targetId: string,
  runbookId?: string,
) {
  return state.verificationEvidenceRuns
    .filter((run) => run.targetId === targetId && (!runbookId || run.runbookId === runbookId))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function getLatestVerificationEvidenceRun(
  state: DispatchState,
  targetId: string,
  runbookId?: string,
) {
  return getTargetVerificationEvidenceRuns(state, targetId, runbookId)[0]
}

export function summarizePreflightStatus(checks: DispatchPreflightCheck[]): DispatchPreflightStatus {
  if (checks.some((check) => check.status === 'failed')) {
    return 'failed'
  }

  if (checks.some((check) => check.status === 'warning')) {
    return 'warning'
  }

  if (checks.length > 0 && checks.every((check) => check.status === 'skipped')) {
    return 'skipped'
  }

  return 'passing'
}

export function formatPreflightStatus(status: DispatchPreflightStatus) {
  return status.slice(0, 1).toUpperCase() + status.slice(1)
}

export function getHealthCheckSummary(results: HealthCheckResult[] | undefined) {
  if (!results || results.length === 0) {
    return {
      status: 'not-checked' as HealthCheckStatus,
      label: 'Not checked',
    }
  }

  if (results.some((result) => result.status === 'failed')) {
    return {
      status: 'failed' as HealthCheckStatus,
      label: 'Failing',
    }
  }

  if (results.some((result) => result.status === 'warning')) {
    return {
      status: 'warning' as HealthCheckStatus,
      label: 'Warnings',
    }
  }

  if (results.every((result) => result.status === 'passing')) {
    return {
      status: 'passing' as HealthCheckStatus,
      label: 'Passing',
    }
  }

  return {
    status: 'not-checked' as HealthCheckStatus,
    label: 'Not checked',
  }
}

export function formatDeploymentStatus(status: DeploymentStatus) {
  return status
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}
