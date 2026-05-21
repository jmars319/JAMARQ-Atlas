import type { DeploymentTarget } from '../domain/dispatch'
import { requestJson } from './requestClient'

export type VercelPermissionState =
  | 'available'
  | 'missing-token'
  | 'insufficient'
  | 'unknown'

export type VercelErrorType =
  | 'missing-token'
  | 'unauthorized'
  | 'insufficient-access'
  | 'not-found'
  | 'rate-limited'
  | 'invalid-config'
  | 'vercel-unavailable'
  | 'unknown'

export type VercelSignalSeverity = 'ok' | 'warning' | 'danger' | 'muted'

export interface VercelApiError {
  type: VercelErrorType
  message: string
  status: number
  resource: string
}

export interface VercelApiResponse<T> {
  data: T | null
  error: VercelApiError | null
  permission: VercelPermissionState
  fetchedAt: string
}

export interface VercelProjectMapEntry {
  targetId: string
  projectIdOrName: string
}

export interface VercelConnectionState {
  configured: boolean
  tokenConfigured: boolean
  teamIdConfigured: boolean
  teamSlugConfigured: boolean
  teamScope: {
    teamIdConfigured: boolean
    teamSlugConfigured: boolean
    usesOrgIdFallback: boolean
  }
  missingConfig: string[]
  mappedTargets: VercelProjectMapEntry[]
  mappedTargetCount: number
  writeControlsEnabled: false
  message: string
}

export interface VercelProjectSummary {
  id: string
  name: string
  framework: string | null
  accountId: string | null
  createdAt: string | null
  updatedAt: string | null
  publicSource: boolean | null
  rootDirectory: string | null
  outputDirectory: string | null
  nodeVersion: string | null
  link: {
    type: string
    repo: string | null
    productionBranch: string | null
  } | null
  latestDeployments: VercelDeploymentSummary[]
}

export interface VercelDomainSummary {
  name: string
  apexName: string | null
  projectId: string | null
  verified: boolean
  redirect: string | null
  redirectStatusCode: number | null
  gitBranch: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface VercelDeploymentSummary {
  id: string
  name: string
  projectId: string | null
  url: string | null
  deploymentUrl: string | null
  inspectorUrl: string | null
  state: string
  readyState: string
  target: string | null
  readySubstate: string | null
  checksState: string | null
  checksConclusion: string | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: string | null
  buildingAt: string | null
  readyAt: string | null
  creator: string | null
  source: string | null
  branch: string | null
  sha: string | null
  meta: {
    githubCommitSha: string | null
    githubCommitRef: string | null
    githubRepo: string | null
    githubOrg: string | null
  }
}

export interface VercelTargetBinding {
  targetId: string
  projectIdOrName: string | null
  mapped: boolean
}

export interface VercelReadinessSignal {
  id: string
  category: 'mapping' | 'project' | 'deployment' | 'domain' | 'git' | 'permission'
  severity: VercelSignalSeverity
  title: string
  detail: string
  evidence: string[]
  url: string | null
}

export interface VercelPermissionGap {
  resource: string
  type: VercelErrorType
  message: string
  status: number
}

export interface VercelDeploymentCommandSummary {
  targetId: string
  projectIdOrName: string | null
  binding: VercelTargetBinding
  project: VercelProjectSummary | null
  domains: VercelDomainSummary[]
  latestProduction: VercelDeploymentSummary | null
  latestPreview: VercelDeploymentSummary | null
  deployments: VercelDeploymentSummary[]
  signals: VercelReadinessSignal[]
  permissionGaps: VercelPermissionGap[]
  state: 'healthy' | 'attention' | 'unknown'
  fetchedAt: string
  writeControlsEnabled: false
}

export function vercelCommandSummariesPath(targetIds: string[]) {
  const params = new URLSearchParams({ targetIds: targetIds.join(',') })

  return `/api/vercel/command-summaries?${params.toString()}`
}

export async function fetchVercelStatus(signal?: AbortSignal) {
  return requestJson<VercelConnectionState>(
    '/api/vercel/status',
    {},
    { signal, retries: 1, retrySafe: true, timeoutMs: 12_000 },
  )
}

export async function fetchVercelCommandSummaries(
  targetIds: string[],
  signal?: AbortSignal,
  cache: 'default' | 'reload' = 'default',
) {
  return requestJson<VercelApiResponse<VercelDeploymentCommandSummary[]>>(
    vercelCommandSummariesPath(targetIds),
    { cache },
    { signal, retries: 1, retrySafe: true, timeoutMs: 15_000 },
  )
}

function dateFromMillis(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return new Date(value).toISOString()
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function readNullableString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function metaString(meta: Record<string, unknown> | undefined, keys: string[]) {
  for (const key of keys) {
    const value = meta?.[key]

    if (typeof value === 'string' && value) {
      return value
    }
  }

  return null
}

export function normalizeVercelDeployment(value: unknown): VercelDeploymentSummary | null {
  if (!isRecord(value)) {
    return null
  }

  const id = readString(value.uid) || readString(value.id)
  const meta = isRecord(value.meta) ? value.meta : {}

  if (!id) {
    return null
  }

  const url = readNullableString(value.url) || readNullableString(value.deploymentHostname)
  const creator = isRecord(value.creator)
    ? readString(value.creator.githubLogin) ||
      readString(value.creator.username) ||
      readString(value.creator.email) ||
      null
    : null
  const createdAt =
    dateFromMillis(value.createdAt) ||
    dateFromMillis(value.created) ||
    dateFromMillis(value.requestedAt)

  return {
    id,
    name: readString(value.name) || id,
    projectId: readNullableString(value.projectId),
    url,
    deploymentUrl: url ? `https://${url}` : null,
    inspectorUrl: readNullableString(value.inspectorUrl),
    state: readString(value.state) || readString(value.readyState) || 'UNKNOWN',
    readyState: readString(value.readyState) || readString(value.state) || 'UNKNOWN',
    target: readNullableString(value.target),
    readySubstate: readNullableString(value.readySubstate),
    checksState: readNullableString(value.checksState),
    checksConclusion: readNullableString(value.checksConclusion),
    errorCode: readNullableString(value.errorCode),
    errorMessage: readNullableString(value.errorMessage),
    createdAt,
    buildingAt: dateFromMillis(value.buildingAt),
    readyAt: dateFromMillis(value.ready),
    creator,
    source: readNullableString(value.source),
    branch:
      readNullableString(value.branch) ||
      metaString(meta, ['githubCommitRef', 'githubCommitRefName', 'branch']),
    sha: readNullableString(value.sha) || metaString(meta, ['githubCommitSha', 'commitSha']),
    meta: {
      githubCommitSha: metaString(meta, ['githubCommitSha', 'commitSha']),
      githubCommitRef: metaString(meta, ['githubCommitRef', 'githubCommitRefName']),
      githubRepo: metaString(meta, ['githubRepo', 'githubCommitRepo']),
      githubOrg: metaString(meta, ['githubOrg', 'githubCommitOrg']),
    },
  }
}

export function normalizeVercelProject(value: unknown): VercelProjectSummary | null {
  if (!isRecord(value)) {
    return null
  }

  const id = readString(value.id)
  const name = readString(value.name)

  if (!id || !name) {
    return null
  }

  const link = isRecord(value.link)
    ? {
        type: readString(value.link.type),
        repo: readNullableString(value.link.repo),
        productionBranch: readNullableString(value.link.productionBranch),
      }
    : null
  const deployments = Array.isArray(value.latestDeployments)
    ? value.latestDeployments
        .map((deployment) => normalizeVercelDeployment(deployment))
        .filter((deployment): deployment is VercelDeploymentSummary => deployment !== null)
    : []

  return {
    id,
    name,
    framework: readNullableString(value.framework),
    accountId: readNullableString(value.accountId),
    createdAt: dateFromMillis(value.createdAt),
    updatedAt: dateFromMillis(value.updatedAt),
    publicSource: typeof value.publicSource === 'boolean' ? value.publicSource : null,
    rootDirectory: readNullableString(value.rootDirectory),
    outputDirectory: readNullableString(value.outputDirectory),
    nodeVersion: readNullableString(value.nodeVersion),
    link,
    latestDeployments: deployments,
  }
}

export function normalizeVercelDomain(value: unknown): VercelDomainSummary | null {
  if (!isRecord(value)) {
    return null
  }

  const name = readString(value.name)

  if (!name) {
    return null
  }

  return {
    name,
    apexName: readNullableString(value.apexName),
    projectId: readNullableString(value.projectId),
    verified: value.verified === true,
    redirect: readNullableString(value.redirect),
    redirectStatusCode: readNumber(value.redirectStatusCode),
    gitBranch: readNullableString(value.gitBranch),
    createdAt: dateFromMillis(value.createdAt),
    updatedAt: dateFromMillis(value.updatedAt),
  }
}

export function isVercelDeploymentFailure(deployment: VercelDeploymentSummary | null) {
  if (!deployment) {
    return false
  }

  return (
    ['ERROR', 'CANCELED'].includes(deployment.readyState) ||
    ['ERROR', 'CANCELED'].includes(deployment.state) ||
    ['failed', 'canceled'].includes(deployment.checksConclusion ?? '') ||
    Boolean(deployment.errorCode)
  )
}

export function vercelDeploymentLabel(deployment: VercelDeploymentSummary | null) {
  if (!deployment) {
    return 'Unavailable'
  }

  return [deployment.readyState, deployment.target, deployment.branch, deployment.sha?.slice(0, 7)]
    .filter(Boolean)
    .join(' / ')
}

function hostFromUrl(value: string) {
  try {
    return new URL(value).host.toLowerCase()
  } catch {
    return value.replace(/^https?:\/\//, '').split('/')[0].toLowerCase()
  }
}

function daysOld(value: string | null, now = new Date()) {
  if (!value) {
    return null
  }

  const parsed = Date.parse(value)

  if (Number.isNaN(parsed)) {
    return null
  }

  return Math.floor((now.getTime() - parsed) / 86_400_000)
}

export function deriveVercelReadinessSignals({
  summary,
  target,
  repositoryKeys = [],
  now = new Date(),
}: {
  summary: VercelDeploymentCommandSummary
  target?: DeploymentTarget
  repositoryKeys?: string[]
  now?: Date
}): VercelReadinessSignal[] {
  const signals: VercelReadinessSignal[] = [...summary.signals]
  const signalIds = new Set(signals.map((signal) => signal.id))

  function push(signal: VercelReadinessSignal) {
    if (!signalIds.has(signal.id)) {
      signals.push(signal)
      signalIds.add(signal.id)
    }
  }

  if (!summary.binding.mapped) {
    push({
      id: `${summary.targetId}-vercel-missing-map`,
      category: 'mapping',
      severity: 'warning',
      title: 'Vercel project mapping missing',
      detail: 'Set ATLAS_VERCEL_PROJECT_MAP to connect this Dispatch target to a Vercel project.',
      evidence: [summary.targetId],
      url: null,
    })
  }

  if (summary.latestProduction && isVercelDeploymentFailure(summary.latestProduction)) {
    push({
      id: `${summary.targetId}-vercel-production-failed`,
      category: 'deployment',
      severity: 'danger',
      title: 'Latest production deployment needs review',
      detail:
        summary.latestProduction.errorMessage ||
        summary.latestProduction.errorCode ||
        vercelDeploymentLabel(summary.latestProduction),
      evidence: [
        summary.latestProduction.readyState,
        summary.latestProduction.checksConclusion ?? 'checks unknown',
      ],
      url: summary.latestProduction.inspectorUrl ?? summary.latestProduction.deploymentUrl,
    })
  }

  if (!summary.latestProduction && summary.binding.mapped && !summary.permissionGaps.length) {
    push({
      id: `${summary.targetId}-vercel-production-missing`,
      category: 'deployment',
      severity: 'warning',
      title: 'No production deployment evidence',
      detail: 'Vercel returned no production deployment for the mapped project.',
      evidence: [summary.projectIdOrName ?? summary.targetId],
      url: null,
    })
  }

  const productionAge = daysOld(summary.latestProduction?.readyAt ?? summary.latestProduction?.createdAt ?? null, now)

  if (productionAge !== null && productionAge > 14) {
    push({
      id: `${summary.targetId}-vercel-production-stale`,
      category: 'deployment',
      severity: 'warning',
      title: 'Production deployment is stale',
      detail: `Latest production deployment is ${productionAge} day(s) old.`,
      evidence: [summary.latestProduction?.readyAt ?? summary.latestProduction?.createdAt ?? 'unknown'],
      url: summary.latestProduction?.inspectorUrl ?? summary.latestProduction?.deploymentUrl ?? null,
    })
  }

  if (target?.publicUrl && summary.domains.length > 0) {
    const publicHost = hostFromUrl(target.publicUrl)
    const domainNames = new Set(summary.domains.map((domain) => domain.name.toLowerCase()))

    if (!domainNames.has(publicHost)) {
      push({
        id: `${summary.targetId}-vercel-domain-mismatch`,
        category: 'domain',
        severity: 'warning',
        title: 'Dispatch URL is not in Vercel domains',
        detail: `${publicHost} is not listed in the mapped Vercel project domains.`,
        evidence: summary.domains.slice(0, 4).map((domain) => domain.name),
        url: target.publicUrl,
      })
    }
  }

  const unverifiedDomains = summary.domains.filter((domain) => !domain.verified)

  if (unverifiedDomains.length > 0) {
    push({
      id: `${summary.targetId}-vercel-domain-unverified`,
      category: 'domain',
      severity: 'warning',
      title: 'Vercel domain verification incomplete',
      detail: `${unverifiedDomains.length} mapped domain(s) are not verified.`,
      evidence: unverifiedDomains.slice(0, 4).map((domain) => domain.name),
      url: null,
    })
  }

  if (summary.project?.link?.repo && repositoryKeys.length > 0) {
    const linkedRepo = summary.project.link.repo.toLowerCase()
    const hasMatch = repositoryKeys.some((repositoryKey) =>
      repositoryKey.toLowerCase().endsWith(linkedRepo),
    )

    if (!hasMatch) {
      push({
        id: `${summary.targetId}-vercel-git-mismatch`,
        category: 'git',
        severity: 'warning',
        title: 'Vercel Git repo differs from Atlas project repo',
        detail: `Vercel is linked to ${summary.project.link.repo}.`,
        evidence: repositoryKeys,
        url: null,
      })
    }
  }

  return signals
}

export function summarizeVercelTargetState(signals: VercelReadinessSignal[]) {
  if (signals.some((signal) => signal.severity === 'danger')) {
    return 'attention' as const
  }

  if (signals.some((signal) => signal.severity === 'warning')) {
    return 'attention' as const
  }

  if (signals.some((signal) => signal.severity === 'ok')) {
    return 'healthy' as const
  }

  return 'unknown' as const
}
