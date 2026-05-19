import type {
  DeploymentEnvironment,
  DeploymentArtifact,
  DeploymentPreservePath,
  DeploymentRecord,
  DeploymentRunbook,
  DeploymentStatus,
  DeploymentTarget,
  DeploymentVerificationCheck,
  DispatchReadiness,
  DispatchRecoveryPlan,
  DispatchState,
  HealthCheckResult,
} from '../domain/dispatch'

function health(
  id: string,
  url: string,
  status: HealthCheckResult['status'],
  message: string,
): HealthCheckResult {
  return {
    id,
    url,
    status,
    checkedAt: '2026-05-08T14:00:00Z',
    statusCode: status === 'passing' ? 200 : undefined,
    message,
  }
}

function target(seed: DeploymentTarget): DeploymentTarget {
  return seed
}

function record(seed: DeploymentRecord): DeploymentRecord {
  return seed
}

function readiness(seed: DispatchReadiness): DispatchReadiness {
  return seed
}

function artifact(seed: DeploymentArtifact): DeploymentArtifact {
  return seed
}

function preservePath(seed: DeploymentPreservePath): DeploymentPreservePath {
  return seed
}

function verificationCheck(seed: DeploymentVerificationCheck): DeploymentVerificationCheck {
  return seed
}

function runbook(seed: DeploymentRunbook): DeploymentRunbook {
  return seed
}

function recoveryPlan(seed: DispatchRecoveryPlan): DispatchRecoveryPlan {
  return seed
}

function cpanelChecks(projectId: string, targetId: string): DeploymentVerificationCheck[] {
  return [
    verificationCheck({
      id: `${targetId}-verify-home`,
      projectId,
      targetId,
      label: 'Homepage responds',
      method: 'HEAD',
      urlPath: '/',
      expectedStatuses: [200, 301, 302],
      protectedResource: false,
      notes: ['Equivalent to curl -I https://domain.com/.'],
    }),
    verificationCheck({
      id: `${targetId}-verify-api-health`,
      projectId,
      targetId,
      label: 'API health responds when present',
      method: 'HEAD',
      urlPath: '/api/health',
      expectedStatuses: [200, 404],
      protectedResource: false,
      notes: ['Expected 200 if the app exposes /api/health; 404 is acceptable for static/placeholder sites.'],
    }),
    verificationCheck({
      id: `${targetId}-verify-env-protected`,
      projectId,
      targetId,
      label: '.env remains protected',
      method: 'HEAD',
      urlPath: '/api/.env',
      expectedStatuses: [403, 404],
      protectedResource: true,
      notes: ['Production secrets must not be web-readable.'],
    }),
    verificationCheck({
      id: `${targetId}-verify-log-protected`,
      projectId,
      targetId,
      label: 'App log remains protected',
      method: 'HEAD',
      urlPath: '/api/logs/app.log',
      expectedStatuses: [403, 404],
      protectedResource: true,
      notes: ['Logs/runtime data must not be web-readable.'],
    }),
  ]
}

function frontendArtifact(projectId: string, targetId: string, sourceRepo: string) {
  return artifact({
    id: `${targetId}-frontend-zip`,
    projectId,
    targetId,
    filename: 'frontend-deploy.zip',
    role: 'frontend',
    sourceRepo,
    targetPath: 'site-root',
    required: true,
    onlyWhenFullAppReady: false,
    checksum: '',
    inspectedAt: '',
    warnings: [],
    notes: ['Frontend zip is uploaded to the site root. Do not delete server folders wholesale.'],
  })
}

function backendArtifact(projectId: string, targetId: string, sourceRepo: string) {
  return artifact({
    id: `${targetId}-backend-zip`,
    projectId,
    targetId,
    filename: 'backend-deploy.zip',
    role: 'backend',
    sourceRepo,
    targetPath: '/api',
    required: true,
    onlyWhenFullAppReady: false,
    checksum: '',
    inspectedAt: '',
    warnings: [],
    notes: ['Backend zip is uploaded to /api. Preserve server-only files first.'],
  })
}

function placeholderArtifact(projectId: string, targetId: string, sourceRepo: string) {
  return artifact({
    id: `${targetId}-placeholder-zip`,
    projectId,
    targetId,
    filename: 'deploy-placeholder.zip',
    role: 'placeholder',
    sourceRepo,
    targetPath: 'site-root',
    required: true,
    onlyWhenFullAppReady: false,
    checksum: '',
    inspectedAt: '',
    warnings: [],
    notes: ['Use this only if keeping the placeholder live. Do not upload full app artifacts unless ready.'],
  })
}

function vercelProjectLinkArtifact(projectId: string, targetId: string, sourceRepo: string) {
  return artifact({
    id: `${targetId}-vercel-project-link`,
    projectId,
    targetId,
    filename: 'Vercel Git integration',
    role: 'frontend',
    sourceRepo,
    targetPath: 'Vercel project linked to main',
    required: false,
    onlyWhenFullAppReady: true,
    checksum: '',
    inspectedAt: '',
    warnings: ['No Vercel deployment execution is implemented in Atlas in this checkpoint.'],
    notes: [
      'Use Vercel Git integration or Vercel CLI outside Atlas until deploy execution is explicitly added.',
      'Required Vercel CI secrets: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID.',
    ],
  })
}

function vercelChecks(projectId: string, targetId: string): DeploymentVerificationCheck[] {
  return [
    verificationCheck({
      id: `${targetId}-verify-home`,
      projectId,
      targetId,
      label: 'Production app responds',
      method: 'HEAD',
      urlPath: '/',
      expectedStatuses: [200, 301, 302],
      protectedResource: false,
      notes: ['Vercel production URL should serve the Atlas shell.'],
    }),
    verificationCheck({
      id: `${targetId}-verify-github-auth-status`,
      projectId,
      targetId,
      label: 'GitHub auth status route responds',
      method: 'GET',
      urlPath: '/api/github/auth/status',
      expectedStatuses: [200],
      protectedResource: false,
      notes: ['Response must not include GitHub tokens or refresh tokens.'],
    }),
    verificationCheck({
      id: `${targetId}-verify-local-git-status-boundary`,
      projectId,
      targetId,
      label: 'Local Git status route is bounded',
      method: 'GET',
      urlPath: '/api/git/repositories/status?owner=jmars319&repo=JAMARQ-Atlas',
      expectedStatuses: [200, 400],
      protectedResource: false,
      notes: ['Production may report not-configured; the route must remain read-only.'],
    }),
  ]
}

function preserve(projectId: string, targetId: string, path: string, reason: string, temporary = false) {
  return preservePath({
    id: `${targetId}-preserve-${path.replace(/[^a-z0-9]+/gi, '-')}`,
    projectId,
    targetId,
    path,
    reason,
    required: true,
    temporary,
    notes: [],
  })
}

function productionTarget({
  id,
  projectId,
  name,
  publicUrl,
  status,
  credentialRef,
  hasDatabase = false,
  databaseName = '',
  notes,
}: {
  id: string
  projectId: string
  name: string
  publicUrl: string
  status: DeploymentStatus
  credentialRef: string
  hasDatabase?: boolean
  databaseName?: string
  notes: string[]
}) {
  return target({
    id,
    projectId,
    name,
    environment: 'production',
    hostType: 'godaddy-cpanel',
    credentialRef,
    remoteHost: 'placeholder.godaddy-cpanel.example',
    remoteUser: 'placeholder-cpanel-user',
    remoteFrontendPath: '/home/placeholder/public_html',
    remoteBackendPath: '/home/placeholder/app',
    publicUrl,
    healthCheckUrls: [publicUrl],
    hasDatabase,
    databaseName,
    backupRequired: hasDatabase,
    destructiveOperationsRequireConfirmation: true,
    status,
    lastVerified: '2026-05-08',
    deploymentNotes: ['Placeholder target. Confirm host, user, and paths before automation work.'],
    blockers: hasDatabase ? ['Database backup procedure needs confirmation.'] : [],
    notes,
  })
}

function productionRecord({
  id,
  projectId,
  targetId,
  versionLabel,
  summary,
  status = 'stable',
  environment = 'production',
  healthCheckUrl,
  rollbackRef = 'manual-rollback-placeholder',
  databaseBackupRef = '',
}: {
  id: string
  projectId: string
  targetId: string
  versionLabel: string
  summary: string
  status?: DeploymentStatus
  environment?: DeploymentEnvironment
  healthCheckUrl: string
  rollbackRef?: string
  databaseBackupRef?: string
}) {
  return record({
    id,
    projectId,
    targetId,
    environment,
    versionLabel,
    sourceRef: 'main',
    commitSha: 'placeholder',
    artifactName: 'manual-deploy-placeholder',
    startedAt: '2026-05-05T15:00:00Z',
    completedAt: '2026-05-05T15:15:00Z',
    status,
    deployedBy: 'manual',
    summary,
    healthCheckResults: [health(`${id}-health`, healthCheckUrl, 'passing', 'Seed health check placeholder.')],
    rollbackRef,
    databaseBackupRef,
    notes: ['Seed record for Dispatch UI; not produced by automation.'],
  })
}

export const seedDispatchState: DispatchState = {
  targets: [
    productionTarget({
      id: 'bow-wow-production',
      projectId: 'bow-wow-site',
      name: 'Bow Wow production',
      publicUrl: 'https://bowwow.example',
      status: 'verification',
      credentialRef: 'godaddy-bow-wow-production',
      notes: ['GoDaddy/cPanel placeholder target until full app launch is approved.'],
    }),
    productionTarget({
      id: 'midway-music-hall-production',
      projectId: 'midway-music-hall-site',
      name: 'Midway Music Hall production',
      publicUrl: 'https://midwaymusichall.example',
      status: 'configured',
      credentialRef: 'godaddy-mmh-production',
      hasDatabase: true,
      databaseName: 'placeholder_midway_music_hall',
      notes: ['GoDaddy/cPanel production target placeholder.'],
    }),
    productionTarget({
      id: 'midway-mobile-storage-production',
      projectId: 'midway-mobile-storage-site',
      name: 'Midway Mobile Storage production',
      publicUrl: 'https://midwaymobilestorage.example',
      status: 'verification',
      credentialRef: 'godaddy-mms-production',
      hasDatabase: true,
      databaseName: 'placeholder_midway_mobile_storage',
      notes: ['GoDaddy/cPanel production target placeholder.'],
    }),
    productionTarget({
      id: 'thunder-road-production',
      projectId: 'thunder-road-site',
      name: 'Thunder Road production',
      publicUrl: 'https://thunderroad.example',
      status: 'blocked',
      credentialRef: 'godaddy-trbg-production',
      hasDatabase: true,
      databaseName: 'placeholder_thunder_road',
      notes: ['GoDaddy/cPanel production target placeholder.'],
    }),
    productionTarget({
      id: 'surplus-containers-production',
      projectId: 'surplus-containers-site',
      name: 'Surplus Containers production',
      publicUrl: 'https://surpluscontainers.example',
      status: 'configured',
      credentialRef: 'godaddy-surplus-production',
      hasDatabase: true,
      databaseName: 'placeholder_surplus_containers',
      notes: ['GoDaddy/cPanel production target placeholder.'],
    }),
    target({
      id: 'jamarq-website-production',
      projectId: 'jamarq-website',
      name: 'JAMARQ website production',
      environment: 'production',
      hostType: 'static-host',
      credentialRef: 'jamarq-website-production-host',
      remoteHost: 'placeholder-static-host.example',
      remoteUser: 'placeholder-deploy-user',
      remoteFrontendPath: '/var/www/jamarq',
      remoteBackendPath: '',
      publicUrl: 'https://jamarq.digital',
      healthCheckUrls: ['https://jamarq.digital'],
      hasDatabase: false,
      databaseName: '',
      backupRequired: false,
      destructiveOperationsRequireConfirmation: true,
      status: 'configured',
      lastVerified: '2026-05-08',
      deploymentNotes: ['Confirm actual host and build artifact process.'],
      blockers: [],
      notes: ['Production target placeholder for JAMARQ public site.'],
    }),
    target({
      id: 'tenra-public-site-production',
      projectId: 'tenra-public-site',
      name: 'Tenra public site production',
      environment: 'production',
      hostType: 'static-host',
      credentialRef: 'tenra-public-site-production-host',
      remoteHost: 'placeholder-tenra-host.example',
      remoteUser: 'placeholder-deploy-user',
      remoteFrontendPath: '/var/www/tenra',
      remoteBackendPath: '',
      publicUrl: 'https://tenra.example',
      healthCheckUrls: ['https://tenra.example'],
      hasDatabase: false,
      databaseName: '',
      backupRequired: false,
      destructiveOperationsRequireConfirmation: true,
      status: 'configured',
      lastVerified: '2026-05-01',
      deploymentNotes: ['Placeholder until public site hosting is confirmed.'],
      blockers: ['Public site promise needs confirmation before launch automation.'],
      notes: ['Production target placeholder for Tenra public site.'],
    }),
    target({
      id: 'jamarq-atlas-vercel-production',
      projectId: 'jamarq-atlas',
      name: 'JAMARQ Atlas Vercel production',
      environment: 'production',
      hostType: 'vercel',
      credentialRef: 'vercel-atlas-production',
      remoteHost: 'vercel.com',
      remoteUser: 'vercel-git-integration',
      remoteFrontendPath: 'Vercel project output',
      remoteBackendPath: 'Vercel functions',
      publicUrl: 'https://atlas.jamarq.digital',
      healthCheckUrls: ['https://atlas.jamarq.digital', 'https://jamarq-atlas.vercel.app'],
      hasDatabase: false,
      databaseName: '',
      backupRequired: false,
      destructiveOperationsRequireConfirmation: true,
      status: 'configured',
      lastVerified: '2026-05-18',
      deploymentNotes: [
        'Production URL field: https://atlas.jamarq.digital.',
        'Preview URL field: https://jamarq-atlas.vercel.app.',
        'Required Vercel env checklist: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID.',
        'Required Atlas env checklist: GITHUB_APP_CLIENT_ID, GITHUB_APP_CLIENT_SECRET, GITHUB_APP_SLUG, GITHUB_APP_CALLBACK_URL, ATLAS_SESSION_SECRET, ATLAS_LOCAL_REPO_ROOTS.',
        'No Vercel deploy, promote, or rollback execution is implemented in Atlas yet.',
      ],
      blockers: ['Confirm Vercel project linkage, production domain, and env values before execution.'],
      notes: ['Self-deployment target for Atlas review checkpoint.'],
    }),
  ],
  records: [
    productionRecord({
      id: 'midway-music-hall-record-1',
      projectId: 'midway-music-hall-site',
      targetId: 'midway-music-hall-production',
      versionLabel: 'Manual baseline',
      summary: 'Manual seed deployment baseline for current production site.',
      healthCheckUrl: 'https://midwaymusichall.example',
      databaseBackupRef: 'placeholder-db-backup-ref',
    }),
    productionRecord({
      id: 'midway-mobile-storage-record-1',
      projectId: 'midway-mobile-storage-site',
      targetId: 'midway-mobile-storage-production',
      versionLabel: 'Lead form QA baseline',
      summary: 'Seed deployment record pending final form verification.',
      status: 'verification',
      healthCheckUrl: 'https://midwaymobilestorage.example',
      databaseBackupRef: 'placeholder-db-backup-ref',
    }),
    productionRecord({
      id: 'thunder-road-record-1',
      projectId: 'thunder-road-site',
      targetId: 'thunder-road-production',
      versionLabel: 'Waiting baseline',
      summary: 'Production baseline is blocked on approved public copy.',
      status: 'blocked',
      healthCheckUrl: 'https://thunderroad.example',
      databaseBackupRef: 'placeholder-db-backup-ref',
    }),
    productionRecord({
      id: 'surplus-containers-record-1',
      projectId: 'surplus-containers-site',
      targetId: 'surplus-containers-production',
      versionLabel: 'Inventory copy baseline',
      summary: 'Seed record for current sales site production state.',
      healthCheckUrl: 'https://surpluscontainers.example',
      databaseBackupRef: 'placeholder-db-backup-ref',
    }),
    productionRecord({
      id: 'jamarq-website-record-1',
      projectId: 'jamarq-website',
      targetId: 'jamarq-website-production',
      versionLabel: 'Public site baseline',
      summary: 'Seed production baseline for JAMARQ public site.',
      healthCheckUrl: 'https://jamarq.digital',
    }),
    productionRecord({
      id: 'tenra-public-site-record-1',
      projectId: 'tenra-public-site',
      targetId: 'tenra-public-site-production',
      versionLabel: 'Placeholder site baseline',
      summary: 'Seed placeholder until public site host is confirmed.',
      status: 'configured',
      healthCheckUrl: 'https://tenra.example',
      rollbackRef: '',
    }),
  ],
  readiness: [
    readiness({
      projectId: 'bow-wow-site',
      targetId: 'bow-wow-production',
      repoCleanKnown: false,
      buildStatusKnown: false,
      artifactReady: false,
      backupReady: true,
      healthChecksDefined: true,
      ready: false,
      blocked: true,
      blockers: ['Confirm placeholder-only deploy remains the intended live state.'],
      warnings: ['Host/path values are placeholders.'],
      lastCheckedAt: '2026-05-10T14:00:00Z',
    }),
    readiness({
      projectId: 'midway-music-hall-site',
      targetId: 'midway-music-hall-production',
      repoCleanKnown: false,
      buildStatusKnown: false,
      artifactReady: false,
      backupReady: false,
      healthChecksDefined: true,
      ready: false,
      blocked: true,
      blockers: ['Confirm production cPanel credentials and backup workflow.'],
      warnings: ['Host/path values are placeholders.'],
      lastCheckedAt: '2026-05-08T14:00:00Z',
    }),
    readiness({
      projectId: 'midway-mobile-storage-site',
      targetId: 'midway-mobile-storage-production',
      repoCleanKnown: false,
      buildStatusKnown: false,
      artifactReady: false,
      backupReady: false,
      healthChecksDefined: true,
      ready: false,
      blocked: true,
      blockers: ['Database backup procedure needs confirmation.'],
      warnings: ['Verify lead form path after deployment.'],
      lastCheckedAt: '2026-05-08T14:00:00Z',
    }),
    readiness({
      projectId: 'thunder-road-site',
      targetId: 'thunder-road-production',
      repoCleanKnown: false,
      buildStatusKnown: false,
      artifactReady: false,
      backupReady: false,
      healthChecksDefined: true,
      ready: false,
      blocked: true,
      blockers: ['Approved public copy is not ready.'],
      warnings: ['Host/path values are placeholders.'],
      lastCheckedAt: '2026-05-08T14:00:00Z',
    }),
    readiness({
      projectId: 'surplus-containers-site',
      targetId: 'surplus-containers-production',
      repoCleanKnown: false,
      buildStatusKnown: false,
      artifactReady: false,
      backupReady: false,
      healthChecksDefined: true,
      ready: false,
      blocked: true,
      blockers: ['Confirm inventory messaging before deployment.'],
      warnings: ['Database backup procedure needs confirmation.'],
      lastCheckedAt: '2026-05-08T14:00:00Z',
    }),
    readiness({
      projectId: 'jamarq-website',
      targetId: 'jamarq-website-production',
      repoCleanKnown: false,
      buildStatusKnown: false,
      artifactReady: false,
      backupReady: true,
      healthChecksDefined: true,
      ready: false,
      blocked: false,
      blockers: [],
      warnings: ['Confirm static host and artifact path before automation.'],
      lastCheckedAt: '2026-05-08T14:00:00Z',
    }),
    readiness({
      projectId: 'tenra-public-site',
      targetId: 'tenra-public-site-production',
      repoCleanKnown: false,
      buildStatusKnown: false,
      artifactReady: false,
      backupReady: true,
      healthChecksDefined: true,
      ready: false,
      blocked: true,
      blockers: ['Public site promise needs confirmation.'],
      warnings: ['Host/path values are placeholders.'],
      lastCheckedAt: '2026-05-01T14:00:00Z',
    }),
    readiness({
      projectId: 'jamarq-atlas',
      targetId: 'jamarq-atlas-vercel-production',
      repoCleanKnown: false,
      buildStatusKnown: false,
      artifactReady: false,
      backupReady: true,
      healthChecksDefined: true,
      ready: false,
      blocked: true,
      blockers: ['Vercel env checklist and domain linkage are not confirmed in Atlas yet.'],
      warnings: ['Local Git status is advisory only and must not mutate readiness automatically.'],
      lastCheckedAt: '2026-05-18T14:00:00Z',
    }),
  ],
  runbooks: [
    runbook({
      id: 'atlas-vercel-runbook',
      projectId: 'jamarq-atlas',
      targetId: 'jamarq-atlas-vercel-production',
      siteName: 'Atlas Vercel',
      summary:
        'Review-ready Vercel deployment target for Atlas itself. This records URLs, env checklist, health checks, and rollback notes without executing deployments.',
      deployOrder: 1,
      enabled: true,
      notes: [
        'Production URL: https://atlas.jamarq.digital.',
        'Preview URL: https://jamarq-atlas.vercel.app.',
        'Required Vercel env: VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID.',
        'Required Atlas env: GitHub App OAuth values, ATLAS_SESSION_SECRET, and ATLAS_LOCAL_REPO_ROOTS.',
        'Use Vercel preview validation before production promotion.',
      ],
      artifacts: [
        vercelProjectLinkArtifact(
          'jamarq-atlas',
          'jamarq-atlas-vercel-production',
          'jmars319/JAMARQ-Atlas',
        ),
      ],
      preservePaths: [],
      verificationChecks: vercelChecks('jamarq-atlas', 'jamarq-atlas-vercel-production'),
      manualDeployNotes: [
        'Deployment execution remains outside Atlas for this checkpoint.',
        'Rollback note: use Vercel rollback to restore the last stable production deployment, then record the result in Dispatch.',
      ],
    }),
    runbook({
      id: 'mms-cpanel-runbook',
      projectId: 'midway-mobile-storage-site',
      targetId: 'midway-mobile-storage-production',
      siteName: 'MMS',
      summary: 'Deploy MMS first because it has the config-system transition.',
      deployOrder: 1,
      enabled: true,
      notes: [
        'Create /api/.env from local backend/.env.example.',
        'Copy current production DB/JWT/origin values from existing /api/config.php.',
        'Keep config.php for one transition deploy, then remove later after verification.',
      ],
      artifacts: [
        frontendArtifact('midway-mobile-storage-site', 'midway-mobile-storage-production', 'midway-mobile-storage'),
        backendArtifact('midway-mobile-storage-site', 'midway-mobile-storage-production', 'midway-mobile-storage'),
      ],
      preservePaths: [
        preserve('midway-mobile-storage-site', 'midway-mobile-storage-production', '/api/.env', 'Create from current production config before deploy.'),
        preserve('midway-mobile-storage-site', 'midway-mobile-storage-production', '/api/config.php', 'Preserve for one transition deploy.', true),
      ],
      verificationChecks: cpanelChecks('midway-mobile-storage-site', 'midway-mobile-storage-production'),
      manualDeployNotes: ['Upload backend zip to /api, then frontend zip to root, then verify API and public site.'],
    }),
    runbook({
      id: 'mmh-cpanel-runbook',
      projectId: 'midway-music-hall-site',
      targetId: 'midway-music-hall-production',
      siteName: 'MMH',
      summary: 'Deploy backend to /api and frontend to root after MMS config transition is verified.',
      deployOrder: 2,
      enabled: true,
      notes: ['Preserve /api/.env and uploads before uploading fresh artifacts.'],
      artifacts: [
        frontendArtifact('midway-music-hall-site', 'midway-music-hall-production', 'midway-music-hall'),
        backendArtifact('midway-music-hall-site', 'midway-music-hall-production', 'midway-music-hall'),
      ],
      preservePaths: [
        preserve('midway-music-hall-site', 'midway-music-hall-production', '/api/.env', 'Production secrets are intentionally not in deploy zips.'),
        preserve('midway-music-hall-site', 'midway-music-hall-production', '/api/uploads', 'User/runtime uploads must survive deploy.'),
      ],
      verificationChecks: cpanelChecks('midway-music-hall-site', 'midway-music-hall-production'),
      manualDeployNotes: ['Verify seat requests, admin paths, and API behavior after upload.'],
    }),
    runbook({
      id: 'surplus-cpanel-runbook',
      projectId: 'surplus-containers-site',
      targetId: 'surplus-containers-production',
      siteName: 'SurplusContainers',
      summary: 'Deploy frontend/backend artifacts while preserving env, logs, and runtime data.',
      deployOrder: 3,
      enabled: true,
      notes: ['Backend zip includes migrations intentionally; .htaccess blocks direct web access.'],
      artifacts: [
        frontendArtifact('surplus-containers-site', 'surplus-containers-production', 'surplus-containers'),
        backendArtifact('surplus-containers-site', 'surplus-containers-production', 'surplus-containers'),
      ],
      preservePaths: [
        preserve('surplus-containers-site', 'surplus-containers-production', '/api/.env', 'Production secrets are intentionally not in deploy zips.'),
        preserve('surplus-containers-site', 'surplus-containers-production', '/api/logs', 'Logs/runtime data must survive deploy.'),
        preserve('surplus-containers-site', 'surplus-containers-production', '/api/runtime', 'Runtime data must survive deploy.'),
      ],
      verificationChecks: cpanelChecks('surplus-containers-site', 'surplus-containers-production'),
      manualDeployNotes: ['Verify public pages and admin/API after upload.'],
    }),
    runbook({
      id: 'trbg-cpanel-runbook',
      projectId: 'thunder-road-site',
      targetId: 'thunder-road-production',
      siteName: 'TRBG',
      summary: 'Deploy backend with vendor included; do not run Composer on the server.',
      deployOrder: 4,
      enabled: true,
      notes: ['Backend zip includes vendor/. Do not run Composer on the server.'],
      artifacts: [
        frontendArtifact('thunder-road-site', 'thunder-road-production', 'thunder-road'),
        backendArtifact('thunder-road-site', 'thunder-road-production', 'thunder-road'),
      ],
      preservePaths: [
        preserve('thunder-road-site', 'thunder-road-production', '/api/.env', 'Production secrets are intentionally not in deploy zips.'),
        preserve('thunder-road-site', 'thunder-road-production', '/api/uploads', 'Uploaded media must survive deploy.'),
        preserve('thunder-road-site', 'thunder-road-production', '/api/incoming', 'Incoming runtime data must survive deploy.'),
        preserve('thunder-road-site', 'thunder-road-production', '/api/logs', 'Logs/runtime data must survive deploy.'),
      ],
      verificationChecks: [
        ...cpanelChecks('thunder-road-site', 'thunder-road-production'),
        verificationCheck({
          id: 'thunder-road-production-verify-settings',
          projectId: 'thunder-road-site',
          targetId: 'thunder-road-production',
          label: '/api/settings responds',
          method: 'HEAD',
          urlPath: '/api/settings',
          expectedStatuses: [200],
          protectedResource: false,
          notes: ['Also verify /api/navigation and /api/menu manually after upload.'],
        }),
      ],
      manualDeployNotes: ['Verify /api/settings, /api/navigation, and /api/menu after upload.'],
    }),
    runbook({
      id: 'bow-wow-cpanel-runbook',
      projectId: 'bow-wow-site',
      targetId: 'bow-wow-production',
      siteName: 'Bow Wow',
      summary: 'Placeholder-first deploy path. Upload full app only after launch approval.',
      deployOrder: 5,
      enabled: true,
      notes: ['Use deploy-placeholder.zip if keeping placeholder live. Do not upload full frontend/backend unless ready.'],
      artifacts: [placeholderArtifact('bow-wow-site', 'bow-wow-production', 'bow-wow')],
      preservePaths: [],
      verificationChecks: cpanelChecks('bow-wow-site', 'bow-wow-production'),
      manualDeployNotes: ['If placeholder is intended, upload only deploy-placeholder.zip to root.'],
    }),
  ],
  orderGroups: [
    {
      id: 'current-cpanel-sites',
      name: 'Current cPanel Deploy Queue',
      description: 'Recommended read-only Atlas deploy order for the five live-current cPanel sites.',
      runbookIds: [
        'mms-cpanel-runbook',
        'mmh-cpanel-runbook',
        'surplus-cpanel-runbook',
        'trbg-cpanel-runbook',
        'bow-wow-cpanel-runbook',
      ],
      notes: ['Never replace /api wholesale without preserving server-only files first.'],
    },
    {
      id: 'atlas-vercel-self-deploy',
      name: 'Atlas Vercel Self-Deploy',
      description: 'Review checkpoint for deploying Atlas itself to Vercel after GitHub App auth is proven.',
      runbookIds: ['atlas-vercel-runbook'],
      notes: ['Deployment execution is intentionally absent until the review breakpoint passes.'],
    },
  ],
  preflightRuns: [],
  automationReadiness: [],
  deploySessions: [],
  hostEvidenceRuns: [],
  verificationEvidenceRuns: [],
  evidenceRetentionPolicy: {
    hostRunLimit: 50,
    verificationRunLimit: 50,
    preserveFailedRuns: true,
  },
  recoveryPlans: [
    recoveryPlan({
      id: 'jamarq-atlas-vercel-recovery',
      projectId: 'jamarq-atlas',
      targetId: 'jamarq-atlas-vercel-production',
      backupCadence: 'Before production promotion',
      backupLocationRef: 'Vercel deployment history',
      rollbackReference: 'Use the previous stable Vercel production deployment',
      rollbackSteps: [
        'Open Vercel project deployment history outside Atlas.',
        'Select the last stable production deployment.',
        'Run Vercel rollback or promote the known-good deployment outside Atlas.',
        'Record the rollback URL and verification result in Dispatch.',
      ],
      maintenanceWindow: 'Manual operator window',
      escalationContactRef: 'jamarq-operator',
      lastReviewedAt: '2026-05-18T14:00:00Z',
      notes: ['Atlas does not execute rollback in this checkpoint.'],
    }),
  ],
}
