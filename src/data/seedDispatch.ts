import type {
  DeploymentEnvironment,
  DeploymentRecord,
  DeploymentStatus,
  DeploymentTarget,
  DispatchReadiness,
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

function productionTarget({
  id,
  projectId,
  name,
  publicUrl,
  status,
  hasDatabase = false,
  databaseName = '',
  notes,
}: {
  id: string
  projectId: string
  name: string
  publicUrl: string
  status: DeploymentStatus
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
      id: 'midway-music-hall-production',
      projectId: 'midway-music-hall-site',
      name: 'Midway Music Hall production',
      publicUrl: 'https://midwaymusichall.example',
      status: 'configured',
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
  ],
  preflightRuns: [],
}
