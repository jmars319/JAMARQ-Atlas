import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  normalizeVercelDeployment,
  normalizeVercelDomain,
  normalizeVercelProject,
  summarizeVercelTargetState,
  type VercelApiError,
  type VercelApiResponse,
  type VercelConnectionState,
  type VercelDeploymentCommandSummary,
  type VercelDeploymentSummary,
  type VercelDomainSummary,
  type VercelErrorType,
  type VercelPermissionGap,
  type VercelPermissionState,
  type VercelProjectMapEntry,
  type VercelProjectSummary,
  type VercelReadinessSignal,
} from '../src/services/vercelIntegration'

type EnvRecord = Record<string, string | undefined>

/* Vercel API contract */ const VERCEL_API_BASE_URL = 'https://api.vercel.com'
const VERCEL_TIMEOUT_MS = 12_000
const DEFAULT_DEPLOYMENT_LIMIT = 6
const MAX_DEPLOYMENT_LIMIT = 20

interface VercelConfig {
  token: string
  teamId: string
  teamSlug: string
  usesOrgIdFallback: boolean
  mappedTargets: VercelProjectMapEntry[]
  mapErrors: string[]
}

interface VercelFetchResult<T> {
  data: T | null
  error: VercelApiError | null
  permission: VercelPermissionState
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body, null, 2))
}

function readString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseInteger(value: string | null, fallback: number) {
  const parsed = Number(value)

  return Number.isFinite(parsed) ? Math.max(1, Math.min(MAX_DEPLOYMENT_LIMIT, parsed)) : fallback
}

function normalizeTargetId(value: string) {
  return /^[A-Za-z0-9_.:-]+$/.test(value) ? value : ''
}

function parseProjectMap(raw: string | undefined) {
  const entries: VercelProjectMapEntry[] = []
  const errors: string[] = []

  if (!raw?.trim()) {
    return { entries, errors }
  }

  raw
    .split(/[,;\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .forEach((entry) => {
      const separator = entry.indexOf(':')
      const targetId = normalizeTargetId(entry.slice(0, separator).trim())
      const projectIdOrName = entry.slice(separator + 1).trim()

      if (separator < 1 || !targetId || !projectIdOrName) {
        errors.push(`Invalid Vercel project map entry: ${entry}`)
        return
      }

      if (!entries.some((candidate) => candidate.targetId === targetId)) {
        entries.push({ targetId, projectIdOrName })
      }
    })

  return { entries, errors }
}

/* Environment config boundary */ export function getVercelConfig(env: EnvRecord = process.env): VercelConfig {
  const mapped = parseProjectMap(env.ATLAS_VERCEL_PROJECT_MAP)

  return {
    token: env.VERCEL_TOKEN?.trim() ?? '',
    teamId: env.VERCEL_TEAM_ID?.trim() || env.VERCEL_ORG_ID?.trim() || '',
    teamSlug: env.VERCEL_TEAM_SLUG?.trim() ?? '',
    usesOrgIdFallback: Boolean(!env.VERCEL_TEAM_ID?.trim() && env.VERCEL_ORG_ID?.trim()),
    mappedTargets: mapped.entries,
    mapErrors: mapped.errors,
  }
}

export function createVercelStatus(config = getVercelConfig()): VercelConnectionState {
  const missingConfig = [
    config.token ? '' : 'VERCEL_TOKEN',
    config.mappedTargets.length > 0 ? '' : 'ATLAS_VERCEL_PROJECT_MAP',
    ...config.mapErrors,
  ].filter(Boolean)
  const configured = Boolean(config.token)

  return {
    configured,
    tokenConfigured: Boolean(config.token),
    teamIdConfigured: Boolean(config.teamId),
    teamSlugConfigured: Boolean(config.teamSlug),
    teamScope: {
      teamIdConfigured: Boolean(config.teamId),
      teamSlugConfigured: Boolean(config.teamSlug),
      usesOrgIdFallback: config.usesOrgIdFallback,
    },
    missingConfig,
    mappedTargets: config.mappedTargets,
    mappedTargetCount: config.mappedTargets.length,
    writeControlsEnabled: false,
    message: configured
      ? `Vercel read-only API configured with ${config.mappedTargets.length} mapped target(s).`
      : 'Set VERCEL_TOKEN locally to enable read-only Vercel deployment evidence.',
  }
}

function vercelErrorType(status: number): VercelErrorType {
  if (status === 401) {
    return 'unauthorized'
  }

  if (status === 403) {
    return 'insufficient-access'
  }

  if (status === 404) {
    return 'not-found'
  }

  if (status === 429) {
    return 'rate-limited'
  }

  return status >= 500 ? 'vercel-unavailable' : 'unknown'
}

function permissionForError(error: VercelApiError | null): VercelPermissionState {
  if (!error) {
    return 'available'
  }

  if (error.type === 'missing-token') {
    return 'missing-token'
  }

  if (error.type === 'insufficient-access' || error.type === 'unauthorized') {
    return 'insufficient'
  }

  return 'unknown'
}

function errorMessage(body: unknown, fallback: string) {
  if (!isRecord(body)) {
    return fallback
  }

  const nested = isRecord(body.error) ? body.error : null

  return readString(nested?.message) || readString(body.message) || fallback
}

/* Provider error boundary */ function apiError({
  type,
  status,
  resource,
  message,
}: {
  type: VercelErrorType
  status: number
  resource: string
  message: string
}): VercelApiError {
  return { type, status, resource, message }
}

function missingTokenResponse<T>(resource: string): VercelFetchResult<T> {
  const error = apiError({
    type: 'missing-token',
    status: 401,
    resource,
    message: 'VERCEL_TOKEN is not configured for the local Atlas server.',
  })

  return {
    data: null,
    error,
    permission: permissionForError(error),
  }
}

function appendTeamScope(url: URL, config: VercelConfig) {
  if (config.teamId) {
    url.searchParams.set('teamId', config.teamId)
  } else if (config.teamSlug) {
    url.searchParams.set('slug', config.teamSlug)
  }
}

/* External fetch boundary */ async function fetchVercel<T>({
  path,
  resource,
  config,
  params,
}: {
  path: string
  resource: string
  config: VercelConfig
  params?: URLSearchParams
}): Promise<VercelFetchResult<T>> {
  if (!config.token) {
    return missingTokenResponse(resource)
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VERCEL_TIMEOUT_MS)
  const url = new URL(path, VERCEL_API_BASE_URL)

  appendTeamScope(url, config)
  params?.forEach((value, key) => url.searchParams.set(key, value))

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${config.token}`,
        Accept: 'application/json',
      },
      signal: controller.signal,
    })
    const body = await response.json().catch(() => null)

    if (!response.ok) {
      const error = apiError({
        type: vercelErrorType(response.status),
        status: response.status,
        resource,
        message: errorMessage(body, `Vercel ${resource} returned ${response.status}.`),
      })

      return {
        data: null,
        error,
        permission: permissionForError(error),
      }
    }

    return {
      data: body as T,
      error: null,
      permission: 'available',
    }
  } catch (error) {
    const mapped = apiError({
      type: 'vercel-unavailable',
      status: 503,
      resource,
      message: error instanceof Error ? error.message : `Vercel ${resource} request failed.`,
    })

    return {
      data: null,
      error: mapped,
      permission: permissionForError(mapped),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function response<T>(
  data: T | null,
  error: VercelApiError | null,
  permission: VercelPermissionState,
): VercelApiResponse<T> {
  return {
    data,
    error,
    permission,
    fetchedAt: new Date().toISOString(),
  }
}

function projectListFromBody(body: unknown) {
  if (Array.isArray(body)) {
    return body
  }

  if (isRecord(body) && Array.isArray(body.projects)) {
    return body.projects
  }

  return []
}

function domainsFromBody(body: unknown) {
  return isRecord(body) && Array.isArray(body.domains) ? body.domains : []
}

function deploymentsFromBody(body: unknown) {
  return isRecord(body) && Array.isArray(body.deployments) ? body.deployments : []
}

async function getProjects(config: VercelConfig) {
  const result = await fetchVercel<unknown>({
    path: '/v10/projects',
    resource: 'projects',
    config,
  })

  if (result.error) {
    return result as VercelFetchResult<VercelProjectSummary[]>
  }

  return {
    ...result,
    data: projectListFromBody(result.data)
      .map((project) => normalizeVercelProject(project))
      .filter((project): project is VercelProjectSummary => project !== null),
  }
}

async function getProject(config: VercelConfig, idOrName: string) {
  const result = await fetchVercel<unknown>({
    path: `/v9/projects/${encodeURIComponent(idOrName)}`,
    resource: `project:${idOrName}`,
    config,
  })

  if (result.error) {
    return result as VercelFetchResult<VercelProjectSummary>
  }

  return {
    ...result,
    data: normalizeVercelProject(result.data),
  }
}

async function getProjectDomains(config: VercelConfig, idOrName: string) {
  const result = await fetchVercel<unknown>({
    path: `/v9/projects/${encodeURIComponent(idOrName)}/domains`,
    resource: `domains:${idOrName}`,
    config,
  })

  if (result.error) {
    return result as VercelFetchResult<VercelDomainSummary[]>
  }

  return {
    ...result,
    data: domainsFromBody(result.data)
      .map((domain) => normalizeVercelDomain(domain))
      .filter((domain): domain is VercelDomainSummary => domain !== null),
  }
}

async function getDeployments({
  config,
  projectIdOrName,
  target,
  branch,
  limit = DEFAULT_DEPLOYMENT_LIMIT,
}: {
  config: VercelConfig
  projectIdOrName: string
  target?: string
  branch?: string
  limit?: number
}) {
  const params = new URLSearchParams({
    projectId: projectIdOrName,
    limit: String(limit),
  })

  if (target) {
    params.set('target', target)
  }

  if (branch) {
    params.set('branch', branch)
  }

  const result = await fetchVercel<unknown>({
    path: '/v6/deployments',
    resource: `deployments:${projectIdOrName}`,
    config,
    params,
  })

  if (result.error) {
    return result as VercelFetchResult<VercelDeploymentSummary[]>
  }

  return {
    ...result,
    data: deploymentsFromBody(result.data)
      .map((deployment) => normalizeVercelDeployment(deployment))
      .filter((deployment): deployment is VercelDeploymentSummary => deployment !== null),
  }
}

function gapFromError(error: VercelApiError | null): VercelPermissionGap[] {
  return error
    ? [
        {
          resource: error.resource,
          type: error.type,
          message: error.message,
          status: error.status,
        },
      ]
    : []
}

function signal(
  targetId: string,
  input: Omit<VercelReadinessSignal, 'id'> & { id: string },
): VercelReadinessSignal {
  return {
    ...input,
    id: `${targetId}-${input.id}`,
  }
}

function emptySummary({
  targetId,
  projectIdOrName,
  signals,
  gaps = [],
}: {
  targetId: string
  projectIdOrName: string | null
  signals: VercelReadinessSignal[]
  gaps?: VercelPermissionGap[]
}): VercelDeploymentCommandSummary {
  const state = summarizeVercelTargetState(signals)

  return {
    targetId,
    projectIdOrName,
    binding: {
      targetId,
      projectIdOrName,
      mapped: Boolean(projectIdOrName),
    },
    project: null,
    domains: [],
    latestProduction: null,
    latestPreview: null,
    deployments: [],
    signals,
    permissionGaps: gaps,
    state,
    fetchedAt: new Date().toISOString(),
    writeControlsEnabled: false,
  }
}

/* Deployment summary boundary */ async function commandSummaryForTarget(
  config: VercelConfig,
  targetId: string,
): Promise<VercelDeploymentCommandSummary> {
  const mapped = config.mappedTargets.find((entry) => entry.targetId === targetId)

  if (!mapped) {
    return emptySummary({
      targetId,
      projectIdOrName: null,
      signals: [
        signal(targetId, {
          id: 'missing-map',
          category: 'mapping',
          severity: 'warning',
          title: 'Vercel project mapping missing',
          detail: 'Set ATLAS_VERCEL_PROJECT_MAP to connect this Dispatch target to a Vercel project.',
          evidence: [targetId],
          url: null,
        }),
      ],
    })
  }

  const project = await getProject(config, mapped.projectIdOrName)

  if (project.error || !project.data) {
    return emptySummary({
      targetId,
      projectIdOrName: mapped.projectIdOrName,
      signals: [
        signal(targetId, {
          id: 'project-unavailable',
          category: 'project',
          severity: 'warning',
          title: 'Vercel project unavailable',
          detail: project.error?.message ?? 'Mapped Vercel project was not returned.',
          evidence: [mapped.projectIdOrName],
          url: null,
        }),
      ],
      gaps: gapFromError(project.error),
    })
  }

  const [domains, productionDeployments, previewDeployments] = await Promise.all([
    getProjectDomains(config, mapped.projectIdOrName),
    getDeployments({
      config,
      projectIdOrName: mapped.projectIdOrName,
      target: 'production',
      limit: DEFAULT_DEPLOYMENT_LIMIT,
    }),
    getDeployments({
      config,
      projectIdOrName: mapped.projectIdOrName,
      target: 'preview',
      limit: DEFAULT_DEPLOYMENT_LIMIT,
    }),
  ])
  const permissionGaps = [
    ...gapFromError(domains.error),
    ...gapFromError(productionDeployments.error),
    ...gapFromError(previewDeployments.error),
  ]
  const deployments = [
    ...(productionDeployments.data ?? []),
    ...(previewDeployments.data ?? []),
  ].filter(
    (deployment, index, all) => all.findIndex((candidate) => candidate.id === deployment.id) === index,
  )
  const latestProduction = productionDeployments.data?.[0] ?? null
  const latestPreview = previewDeployments.data?.[0] ?? null
  const signals: VercelReadinessSignal[] = [
    signal(targetId, {
      id: 'mapped',
      category: 'mapping',
      severity: 'ok',
      title: 'Vercel project mapped',
      detail: `${targetId} maps to ${project.data.name}.`,
      evidence: [project.data.id, project.data.name],
      url: null,
    }),
  ]

  if (permissionGaps.length > 0) {
    signals.push(
      signal(targetId, {
        id: 'permission-gap',
        category: 'permission',
        severity: 'warning',
        title: 'Vercel evidence gap',
        detail: permissionGaps[0].message,
        evidence: permissionGaps.map((gap) => `${gap.resource}: ${gap.type}`),
        url: null,
      }),
    )
  }

  if (!latestProduction && !productionDeployments.error) {
    signals.push(
      signal(targetId, {
        id: 'no-production-deployment',
        category: 'deployment',
        severity: 'warning',
        title: 'No production deployment returned',
        detail: 'Vercel returned no production deployments for this mapped project.',
        evidence: [mapped.projectIdOrName],
        url: null,
      }),
    )
  } else if (latestProduction) {
    signals.push(
      signal(targetId, {
        id: 'production-deployment',
        category: 'deployment',
        severity:
          latestProduction.readyState === 'READY' && !latestProduction.errorCode ? 'ok' : 'warning',
        title: 'Latest production deployment loaded',
        detail: `${latestProduction.readyState} / ${latestProduction.branch ?? 'branch unknown'}`,
        evidence: [
          latestProduction.sha?.slice(0, 12) ?? 'sha unknown',
          latestProduction.readyAt ?? latestProduction.createdAt ?? 'time unknown',
        ],
        url: latestProduction.inspectorUrl ?? latestProduction.deploymentUrl,
      }),
    )
  }

  return {
    targetId,
    projectIdOrName: mapped.projectIdOrName,
    binding: {
      targetId,
      projectIdOrName: mapped.projectIdOrName,
      mapped: true,
    },
    project: project.data,
    domains: domains.data ?? [],
    latestProduction,
    latestPreview,
    deployments,
    signals,
    permissionGaps,
    state: summarizeVercelTargetState(signals),
    fetchedAt: new Date().toISOString(),
    writeControlsEnabled: false,
  }
}

function targetIdsFromQuery(url: URL) {
  return (url.searchParams.get('targetIds') ?? '')
    .split(',')
    .map((targetId) => normalizeTargetId(targetId.trim()))
    .filter(Boolean)
    .filter((targetId, index, targetIds) => targetIds.indexOf(targetId) === index)
}

function routeSegments(url: URL) {
  return url.pathname
    .replace(/^\/api\/vercel\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment))
}

/* Vercel route boundary */ export async function vercelApiMiddleware(
  request: IncomingMessage,
  responseMessage: ServerResponse,
  next?: () => void,
) {
  const requestUrl = request.url ?? ''

  if (!requestUrl.startsWith('/api/vercel')) {
    next?.()
    return
  }

  if (request.method !== 'GET') {
    json(responseMessage, 405, {
      ok: false,
      error: {
        type: 'method-not-allowed',
        message: 'Vercel API exposes read-only GET routes only.',
      },
    })
    return
  }

  const url = new URL(requestUrl, 'http://atlas.local')
  const config = getVercelConfig()
  const segments = routeSegments(url)

  if (segments.length === 1 && segments[0] === 'status') {
    json(responseMessage, 200, createVercelStatus(config))
    return
  }

  if (segments.length === 1 && segments[0] === 'projects') {
    const result = await getProjects(config)
    json(responseMessage, 200, response(result.data, result.error, result.permission))
    return
  }

  if (segments[0] === 'projects' && segments[1]) {
    const idOrName = segments[1]

    if (segments.length === 2) {
      const result = await getProject(config, idOrName)
      json(responseMessage, 200, response(result.data, result.error, result.permission))
      return
    }

    if (segments.length === 3 && segments[2] === 'domains') {
      const result = await getProjectDomains(config, idOrName)
      json(responseMessage, 200, response(result.data, result.error, result.permission))
      return
    }

    if (segments.length === 3 && segments[2] === 'deployments') {
      const result = await getDeployments({
        config,
        projectIdOrName: idOrName,
        target: url.searchParams.get('target') ?? undefined,
        branch: url.searchParams.get('branch') ?? undefined,
        limit: parseInteger(url.searchParams.get('limit'), DEFAULT_DEPLOYMENT_LIMIT),
      })
      json(responseMessage, 200, response(result.data, result.error, result.permission))
      return
    }
  }

  if (segments.length === 3 && segments[0] === 'targets' && segments[2] === 'summary') {
    const targetId = normalizeTargetId(segments[1])

    if (!targetId) {
      json(responseMessage, 400, response(null, apiError({
        type: 'invalid-config',
        status: 400,
        resource: 'target-summary',
        message: 'Target id is invalid.',
      }), 'unknown'))
      return
    }

    json(
      responseMessage,
      200,
      response([await commandSummaryForTarget(config, targetId)][0], null, 'available'),
    )
    return
  }

  if (segments.length === 1 && segments[0] === 'command-summaries') {
    const targetIds = targetIdsFromQuery(url)

    if (targetIds.length === 0) {
      json(responseMessage, 200, response([], null, 'available'))
      return
    }

    const summaries = await Promise.all(
      targetIds.slice(0, 20).map((targetId) => commandSummaryForTarget(config, targetId)),
    )
    const firstGap = summaries.flatMap((summary) => summary.permissionGaps)[0]
    const topError = firstGap
      ? apiError({
          type: firstGap.type,
          status: firstGap.status,
          resource: firstGap.resource,
          message: firstGap.message,
        })
      : null

    json(responseMessage, 200, response(summaries, topError, permissionForError(topError)))
    return
  }

  json(responseMessage, 404, {
    ok: false,
    error: {
      type: 'not-found',
      message: 'Unknown Vercel API route.',
    },
  })
}
