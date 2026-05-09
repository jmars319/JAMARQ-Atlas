import type {
  DeploymentRunnerPhase,
  DeploymentRunnerResult,
  DeploymentTarget,
} from '../domain/dispatch'

export const deploymentRunnerPhases: DeploymentRunnerPhase[] = [
  'preflight',
  'backup',
  'package',
  'upload',
  'release',
  'verify',
  'rollback',
]

function noOpResult(
  phase: DeploymentRunnerPhase,
  target?: DeploymentTarget,
): DeploymentRunnerResult {
  const requiresConfirmation =
    phase === 'backup' ||
    phase === 'upload' ||
    phase === 'release' ||
    phase === 'rollback' ||
    Boolean(target?.destructiveOperationsRequireConfirmation)

  return {
    phase,
    status: 'not-implemented',
    requiresConfirmation,
    message:
      'Dispatch runner is a safety stub. No network write, file overwrite, database operation, or deployment command was executed.',
  }
}

/**
 * Safety rules for future implementation:
 * - Production database imports/restores require explicit typed confirmation.
 * - Production file overwrites require a verified backup first.
 * - phpMyAdmin should not be automated directly.
 * - cPanel/GoDaddy support should prefer SSH/SFTP, mysqldump/mysql, and cPanel APIs.
 */
export async function runDeploymentPhase(
  phase: DeploymentRunnerPhase,
  target?: DeploymentTarget,
): Promise<DeploymentRunnerResult> {
  return noOpResult(phase, target)
}

export async function runDeploymentPlan(
  target?: DeploymentTarget,
): Promise<DeploymentRunnerResult[]> {
  return deploymentRunnerPhases.map((phase) => noOpResult(phase, target))
}
