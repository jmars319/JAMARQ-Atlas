export const WORK_STATUSES = [
  {
    id: 'Inbox',
    label: 'Inbox',
    description: 'Captured but not shaped into a plan.',
    tone: 'neutral',
  },
  {
    id: 'Planned',
    label: 'Planned',
    description: 'Intended work with a known next move.',
    tone: 'planning',
  },
  {
    id: 'Active',
    label: 'Active',
    description: 'Currently moving or actively being changed.',
    tone: 'active',
  },
  {
    id: 'Waiting',
    label: 'Waiting',
    description: 'Blocked on another person, system, or decision.',
    tone: 'waiting',
  },
  {
    id: 'Verification',
    label: 'Verification',
    description: 'Needs review, QA, or deployment confirmation.',
    tone: 'verification',
  },
  {
    id: 'Stable',
    label: 'Stable',
    description: 'Known good and not demanding attention.',
    tone: 'stable',
  },
  {
    id: 'Deferred',
    label: 'Deferred',
    description: 'Valid but intentionally parked.',
    tone: 'deferred',
  },
  {
    id: 'Not Doing',
    label: 'Not Doing',
    description: 'Explicitly rejected for now.',
    tone: 'not-doing',
  },
  {
    id: 'Archived',
    label: 'Archived',
    description: 'Preserved for reference, not active.',
    tone: 'archived',
  },
] as const

export type WorkStatus = (typeof WORK_STATUSES)[number]['id']

export type ProjectKind =
  | 'workspace'
  | 'suite'
  | 'app'
  | 'website'
  | 'repo'
  | 'experiment'
  | 'infrastructure'
  | 'archive'

export type ActivitySource = 'manual' | 'github' | 'deployment' | 'mock'

export type ActivityType =
  | 'commit'
  | 'pull-request'
  | 'issue'
  | 'release'
  | 'workflow'
  | 'deployment'
  | 'note'
  | 'decision'

export interface ExternalLink {
  label: string
  url: string
}

export interface GithubRepositoryLink {
  owner: string
  name: string
  url?: string
  defaultBranch?: string
}

export interface ActivityEvent {
  id: string
  source: ActivitySource
  type: ActivityType
  title: string
  detail: string
  occurredAt: string
  actor?: string
  target?: string
  url?: string
}

export interface ManualOperationalState {
  status: WorkStatus
  nextAction: string
  lastMeaningfulChange: string
  lastVerified: string
  currentRisk: string
  blockers: string[]
  deferredItems: string[]
  notDoingItems: string[]
  notes: string[]
  decisions: string[]
}

export interface AtlasProject {
  id: string
  name: string
  kind: ProjectKind
  summary: string
  manual: ManualOperationalState
  repositories: GithubRepositoryLink[]
  links: ExternalLink[]
  activity: ActivityEvent[]
}

export interface ProjectGroup {
  id: string
  name: string
  summary: string
  projects: AtlasProject[]
}

export interface AtlasSection {
  id: string
  name: string
  summary: string
  groups: ProjectGroup[]
}

export interface Workspace {
  id: string
  name: string
  purpose: string
  sections: AtlasSection[]
}

export interface ProjectRecord {
  section: AtlasSection
  group: ProjectGroup
  project: AtlasProject
}

export function flattenProjects(workspace: Workspace): ProjectRecord[] {
  return workspace.sections.flatMap((section) =>
    section.groups.flatMap((group) =>
      group.projects.map((project) => ({ section, group, project })),
    ),
  )
}

export function findProjectRecord(
  workspace: Workspace,
  projectId: string,
): ProjectRecord | undefined {
  return flattenProjects(workspace).find((record) => record.project.id === projectId)
}

export function updateProject(
  workspace: Workspace,
  projectId: string,
  update: (project: AtlasProject) => AtlasProject,
): Workspace {
  return {
    ...workspace,
    sections: workspace.sections.map((section) => ({
      ...section,
      groups: section.groups.map((group) => ({
        ...group,
        projects: group.projects.map((project) =>
          project.id === projectId ? update(project) : project,
        ),
      })),
    })),
  }
}

export function getStatusDefinition(status: WorkStatus) {
  return WORK_STATUSES.find((definition) => definition.id === status) ?? WORK_STATUSES[0]
}

export function statusToneClass(status: WorkStatus): string {
  return `status-${getStatusDefinition(status).tone}`
}

export function formatDateLabel(value: string): string {
  if (!value) {
    return 'Not set'
  }

  const parsed = new Date(`${value}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
}
