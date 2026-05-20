import type { AtlasConnectionCard } from '../domain/settings'
import type { AtlasSyncProviderState } from '../domain/sync'
import type { GithubConnectionState } from '../services/githubIntegration'
import type { HostConnectionStatusResponse } from '../services/hostConnection'
import type { HostedSyncStatus } from '../services/hostedSync'
import type { WritingProviderStatusResponse } from '../services/writingProvider'

export type GithubStatusResponse = GithubConnectionState

export function statusLabel(status: AtlasConnectionCard['status']) {
  const labels: Record<AtlasConnectionCard['status'], string> = {
    available: 'Available',
    missing: 'Missing',
    stub: 'Stubbed',
    'local-only': 'Local only',
    unknown: 'Unknown',
  }

  return labels[status]
}

export function buildGithubCard(status: GithubStatusResponse | null, error: string | null) {
  if (error) {
    return {
      id: 'github',
      title: 'GitHub Local API',
      status: 'unknown',
      summary: 'GitHub status could not be read.',
      detail: error,
    } satisfies AtlasConnectionCard
  }

  if (!status?.configured) {
    return {
      id: 'github',
      title: 'GitHub App',
      status: 'missing',
      summary: 'GitHub App sign-in is not configured.',
      detail:
        'Set GitHub App env vars and ATLAS_SESSION_SECRET locally. Legacy GITHUB_TOKEN/GH_TOKEN remains a test fallback.',
    } satisfies AtlasConnectionCard
  }

  if (status.githubAppConfigured && !status.authenticated && !status.envTokenConfigured) {
    return {
      id: 'github',
      title: 'GitHub App',
      status: 'missing',
      summary: 'GitHub App is configured; sign-in is pending.',
      detail:
        'Use Sign in with GitHub to list installed repositories. Tokens stay server-side and write controls remain locked.',
    } satisfies AtlasConnectionCard
  }

  if (status.authMode === 'github-app-user') {
    return {
      id: 'github',
      title: 'GitHub App',
      status: 'available',
      summary: `Signed in as ${status.user?.login ?? 'GitHub user'}.`,
      detail: `${status.installCount} installation(s), ${status.repoCount} installed repos visible. Issue/comment pilot: ${String(
        status.issueCommentPilotEnabled,
      )}. Future write controls locked: ${String(
        status.writeControlsEnabled,
      )}.`,
    } satisfies AtlasConnectionCard
  }

  return {
    id: 'github',
    title: 'GitHub App',
    status: 'available',
    summary: 'Legacy read-only GitHub token fallback is configured.',
    detail: `${status.configuredRepos.length} configured repos through ${status.authMode}. GitHub App write controls remain locked.`,
  } satisfies AtlasConnectionCard
}

export function buildHostedSyncCard(
  status: HostedSyncStatus | null,
  error: string | null,
  provider: AtlasSyncProviderState,
) {
  if (error || provider.status === 'error') {
    return {
      id: 'supabase',
      title: 'Supabase Hosted Sync',
      status: 'unknown',
      summary: 'Hosted sync status could not be read.',
      detail: error || provider.message,
      updatedAt: provider.updatedAt,
    } satisfies AtlasConnectionCard
  }

  if (!status?.configured && provider.status !== 'configured') {
    return {
      id: 'supabase',
      title: 'Supabase Hosted Sync',
      status: 'missing',
      summary: 'Supabase hosted sync is not configured.',
      detail:
        'Atlas stays local-first. Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and ATLAS_SYNC_WORKSPACE_ID locally to enable manual remote snapshots.',
      updatedAt: provider.updatedAt,
    } satisfies AtlasConnectionCard
  }

  return {
    id: 'supabase',
    title: 'Supabase Hosted Sync',
    status: 'available',
    summary: 'Manual Supabase snapshot push and pull are configured.',
    detail: `Workspace ${status?.workspaceId || provider.workspaceId || 'configured'} is available. No background sync or merge is enabled.`,
    updatedAt: provider.updatedAt,
  } satisfies AtlasConnectionCard
}

export function buildHostConnectionCard(
  status: HostConnectionStatusResponse | null,
  error: string | null,
) {
  if (error) {
    return {
      id: 'host',
      title: 'Read-Only Host Boundary',
      status: 'unknown',
      summary: 'Host boundary status could not be read.',
      detail: error,
    } satisfies AtlasConnectionCard
  }

  if (!status?.configured) {
    return {
      id: 'host',
      title: 'Read-Only Host Boundary',
      status: 'missing',
      summary: 'No host preflight config is configured.',
      detail:
        'Set ATLAS_HOST_PREFLIGHT_CONFIG locally to enable read-only host reachability and path evidence. No credentials are stored in browser state.',
    } satisfies AtlasConnectionCard
  }

  return {
    id: 'host',
    title: 'Read-Only Host Boundary',
    status: 'available',
    summary: 'Read-only host preflight config is available.',
    detail: `${status.data?.configuredTargets.length ?? 0} targets configured; ${
      status.data?.sftpEnabledCount ?? 0
    } SFTP read-only. Atlas stores credential reference labels only.`,
  } satisfies AtlasConnectionCard
}

export function buildWritingProviderCard(
  status: WritingProviderStatusResponse | null,
  error: string | null,
) {
  if (error) {
    return {
      id: 'writing',
      title: 'Writing Provider',
      status: 'unknown',
      summary: 'Writing provider status could not be read.',
      detail: error,
    } satisfies AtlasConnectionCard
  }

  if (!status?.configured) {
    return {
      id: 'writing',
      title: 'Writing Provider',
      status: 'missing',
      summary: 'No OpenAI API key is configured.',
      detail:
        'Writing still creates local draft packets. Set OPENAI_API_KEY locally to generate provider suggestions for human review.',
    } satisfies AtlasConnectionCard
  }

  return {
    id: 'writing',
    title: 'Writing Provider',
    status: 'available',
    summary: 'OpenAI draft-only provider is configured.',
    detail: `Suggestions use ${status.model}. Generated text is stored as a suggestion until explicitly applied.`,
  } satisfies AtlasConnectionCard
}

export function issueCountLabel(count: number) {
  return count === 1 ? '1 unresolved item' : `${count} unresolved items`
}
