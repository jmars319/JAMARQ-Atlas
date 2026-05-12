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

export interface DispatchState {
  targets: DeploymentTarget[]
  records: DeploymentRecord[]
  readiness: DispatchReadiness[]
  preflightRuns: DispatchPreflightRun[]
  automationReadiness: DispatchAutomationReadiness[]
  runbooks: DeploymentRunbook[]
  orderGroups: DeploymentOrderGroup[]
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
