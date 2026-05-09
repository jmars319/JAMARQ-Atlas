import type {
  ActivityEvent,
  AtlasProject,
  GithubRepositoryLink,
  ProjectRecord,
  Workspace,
} from '../domain/atlas'
import { flattenProjects, updateProject } from '../domain/atlas'
import type { GithubRepositorySummary } from './githubIntegration'

const OUTLIERS_SECTION_ID = 'outliers'
const ONE_OFF_GROUP_ID = 'one-off-tools'

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10)
}

function uniqueProjectId(workspace: Workspace, baseId: string) {
  const existingIds = new Set(flattenProjects(workspace).map((record) => record.project.id))

  if (!existingIds.has(baseId)) {
    return baseId
  }

  let index = 2
  let candidate = `${baseId}-${index}`
  while (existingIds.has(candidate)) {
    index += 1
    candidate = `${baseId}-${index}`
  }

  return candidate
}

export function repositoryKey(repository: GithubRepositoryLink) {
  return `${repository.owner}/${repository.name}`.toLowerCase()
}

export function parseRepositoryFullName(
  value: string,
  fallbackOwner?: string,
): GithubRepositoryLink | null {
  const trimmed = value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '')
  const [owner, name] = trimmed.includes('/') ? trimmed.split('/') : [fallbackOwner, trimmed]

  if (!owner || !name) {
    return null
  }

  return {
    owner,
    name,
    url: `https://github.com/${owner}/${name}`,
  }
}

export function repositorySummaryToLink(
  repository: GithubRepositorySummary,
): GithubRepositoryLink {
  const parsed = parseRepositoryFullName(repository.fullName)

  return {
    owner: parsed?.owner ?? repository.fullName.split('/')[0] ?? '',
    name: parsed?.name ?? repository.name,
    url: repository.htmlUrl,
    defaultBranch: repository.defaultBranch,
  }
}

export function isSameRepository(
  left: GithubRepositoryLink,
  right: GithubRepositoryLink,
) {
  return repositoryKey(left) === repositoryKey(right)
}

export function projectHasRepository(
  project: AtlasProject,
  repository: GithubRepositoryLink,
) {
  return project.repositories.some((existing) => isSameRepository(existing, repository))
}

export function findRepositoryBinding(
  projectRecords: ProjectRecord[],
  repository: GithubRepositoryLink,
) {
  return projectRecords.find((record) => projectHasRepository(record.project, repository))
}

export function bindRepositoryToProject(
  workspace: Workspace,
  projectId: string,
  repository: GithubRepositoryLink,
) {
  return updateProject(workspace, projectId, (project) => {
    if (projectHasRepository(project, repository)) {
      return project
    }

    return {
      ...project,
      repositories: [...project.repositories, repository],
    }
  })
}

export function unbindRepositoryFromProject(
  workspace: Workspace,
  projectId: string,
  repository: GithubRepositoryLink,
) {
  return updateProject(workspace, projectId, (project) => ({
    ...project,
    repositories: project.repositories.filter((existing) => !isSameRepository(existing, repository)),
  }))
}

function createInboxActivity(projectId: string, repository: GithubRepositorySummary): ActivityEvent {
  return {
    id: `${projectId}-github-intake`,
    source: 'manual',
    type: 'note',
    title: 'Created from GitHub Intake',
    detail:
      'Repository binding was created for manual triage. GitHub did not set status, priority, risk, or roadmap.',
    occurredAt: todayIsoDate(),
    url: repository.htmlUrl,
  }
}

function createInboxProject(workspace: Workspace, repository: GithubRepositorySummary): AtlasProject {
  const link = repositorySummaryToLink(repository)
  const projectId = uniqueProjectId(
    workspace,
    `github-${slugify(link.owner)}-${slugify(link.name)}`,
  )

  return {
    id: projectId,
    name: repository.name,
    kind: 'repo',
    summary:
      repository.description ??
      `GitHub repository ${repository.fullName} imported for manual triage.`,
    manual: {
      status: 'Inbox',
      nextAction: 'Review this repository and decide where it belongs in Atlas.',
      lastMeaningfulChange: repository.pushedAt
        ? `GitHub reports latest push at ${repository.pushedAt}. Atlas has not interpreted it.`
        : 'Created from GitHub Intake. Atlas has not interpreted activity yet.',
      lastVerified: '',
      currentRisk: 'Not yet operationally classified.',
      blockers: [],
      deferredItems: [],
      notDoingItems: [],
      notes: ['Created from GitHub Intake. Review manually before changing status.'],
      decisions: [],
    },
    repositories: [link],
    links: repository.htmlUrl ? [{ label: 'GitHub', url: repository.htmlUrl }] : [],
    activity: [createInboxActivity(projectId, repository)],
  }
}

function appendProjectToOutliers(workspace: Workspace, project: AtlasProject): Workspace {
  let inserted = false
  let foundOutliers = false

  const sections = workspace.sections.map((section) => {
    if (section.id !== OUTLIERS_SECTION_ID) {
      return section
    }

    foundOutliers = true
    let foundOneOffGroup = false
    const groups = section.groups.map((group) => {
      if (group.id !== ONE_OFF_GROUP_ID) {
        return group
      }

      foundOneOffGroup = true
      inserted = true

      return {
        ...group,
        projects: [...group.projects, project],
      }
    })

    return {
      ...section,
      groups: foundOneOffGroup
        ? groups
        : [
            ...groups,
            {
              id: ONE_OFF_GROUP_ID,
              name: 'One-off tools',
              summary: 'Useful standalone tools with unclear long-term ownership.',
              projects: [project],
            },
          ],
    }
  })

  if (inserted) {
    return { ...workspace, sections }
  }

  if (foundOutliers) {
    return {
      ...workspace,
      sections,
    }
  }

  return {
    ...workspace,
    sections: [
      ...sections,
      {
        id: OUTLIERS_SECTION_ID,
        name: 'Outliers',
        summary: 'One-off work, paused ideas, and archived material kept out of core sections.',
        groups: [
          {
            id: ONE_OFF_GROUP_ID,
            name: 'One-off tools',
            summary: 'Useful standalone tools with unclear long-term ownership.',
            projects: [project],
          },
        ],
      },
    ],
  }
}

export function createInboxProjectFromRepository(
  workspace: Workspace,
  repository: GithubRepositorySummary,
) {
  const link = repositorySummaryToLink(repository)
  const existingBinding = findRepositoryBinding(flattenProjects(workspace), link)

  if (existingBinding) {
    return {
      workspace,
      projectId: existingBinding.project.id,
      created: false,
    }
  }

  const project = createInboxProject(workspace, repository)

  return {
    workspace: appendProjectToOutliers(workspace, project),
    projectId: project.id,
    created: true,
  }
}
