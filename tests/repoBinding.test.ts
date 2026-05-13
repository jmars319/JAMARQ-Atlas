import { describe, expect, it } from 'vitest'
import { seedWorkspace } from '../src/data/seedWorkspace'
import { flattenProjects } from '../src/domain/atlas'
import type { Workspace } from '../src/domain/atlas'
import type { GithubRepositorySummary } from '../src/services/githubIntegration'
import {
  bindRepositoryToProject,
  createInboxProjectFromRepository,
  parseRepositoryFullName,
  repositorySummaryToLink,
  unbindRepositoryFromProject,
} from '../src/services/repoBinding'
import { deriveRepoPlacementSuggestions } from '../src/services/repoSuggestions'

function cloneWorkspace(): Workspace {
  return JSON.parse(JSON.stringify(seedWorkspace)) as Workspace
}

const repository: GithubRepositorySummary = {
  id: 123,
  name: 'tenra.dev',
  fullName: 'jmars319/tenra.dev',
  private: false,
  description: 'Software systems platform.',
  htmlUrl: 'https://github.com/jmars319/tenra.dev',
  defaultBranch: 'main',
  visibility: 'public',
  language: 'TypeScript',
  updatedAt: '2026-05-09T12:00:00Z',
  pushedAt: '2026-05-09T12:00:00Z',
  openIssuesCount: 0,
  stargazersCount: 0,
  forksCount: 0,
  archived: false,
  disabled: false,
}

function repo(name: string, description: string | null): GithubRepositorySummary {
  return {
    ...repository,
    id: name.length,
    name,
    fullName: `jmars319/${name}`,
    description,
    htmlUrl: `https://github.com/jmars319/${name}`,
  }
}

describe('repo binding', () => {
  it('parses repository full names and GitHub URLs', () => {
    expect(parseRepositoryFullName('jmars319/JAMARQ-Atlas')).toMatchObject({
      owner: 'jmars319',
      name: 'JAMARQ-Atlas',
    })
    expect(parseRepositoryFullName('https://github.com/jmars319/tenra.dev.git')).toMatchObject({
      owner: 'jmars319',
      name: 'tenra.dev',
    })
    expect(parseRepositoryFullName('Atlas', 'jmars319')).toMatchObject({
      owner: 'jmars319',
      name: 'Atlas',
    })
  })

  it('binds a repository to an existing project without duplicates', () => {
    const workspace = cloneWorkspace()
    const link = repositorySummaryToLink(repository)
    const once = bindRepositoryToProject(workspace, 'vaexcore-studio', link)
    const twice = bindRepositoryToProject(once, 'vaexcore-studio', link)
    const studio = flattenProjects(twice).find((record) => record.project.id === 'vaexcore-studio')

    expect(studio?.project.repositories.filter((repo) => repo.name === 'tenra.dev')).toHaveLength(1)
    expect(studio?.project.manual.status).toBe('Active')
  })

  it('unbinds a repository without changing manual status', () => {
    const workspace = cloneWorkspace()
    const existing = parseRepositoryFullName('jmars319/vaexcore-studio')

    expect(existing).not.toBeNull()

    const next = unbindRepositoryFromProject(workspace, 'vaexcore-studio', existing!)
    const studio = flattenProjects(next).find((record) => record.project.id === 'vaexcore-studio')

    expect(studio?.project.repositories).toHaveLength(0)
    expect(studio?.project.manual.status).toBe('Active')
  })

  it('creates an Inbox project in Outliers from an unbound repository', () => {
    const workspace = cloneWorkspace()
    const result = createInboxProjectFromRepository(workspace, repository)
    const created = flattenProjects(result.workspace).find(
      (record) => record.project.id === result.projectId,
    )

    expect(result.created).toBe(true)
    expect(created?.section.id).toBe('outliers')
    expect(created?.group.id).toBe('one-off-tools')
    expect(created?.project.kind).toBe('repo')
    expect(created?.project.manual.status).toBe('Inbox')
    expect(created?.project.repositories).toContainEqual(
      expect.objectContaining({
        owner: 'jmars319',
        name: 'tenra.dev',
      }),
    )
  })

  it('does not create a second Inbox project for an already bound repository', () => {
    const workspace = cloneWorkspace()
    const boundRepository = {
      ...repository,
      name: 'vaexcore-studio',
      fullName: 'jmars319/vaexcore-studio',
      htmlUrl: 'https://github.com/jmars319/vaexcore-studio',
    }
    const result = createInboxProjectFromRepository(workspace, boundRepository)

    expect(result.created).toBe(false)
    expect(result.projectId).toBe('vaexcore-studio')
  })
})

describe('repo placement suggestions', () => {
  it('returns a high-confidence project suggestion for an exact repo/project name match', () => {
    const projectRecords = flattenProjects(cloneWorkspace())
    const [suggestion] = deriveRepoPlacementSuggestions(projectRecords, [
      repo('midway-mobile-storage-website', 'Current Midway Mobile Storage site.'),
    ])

    expect(suggestion.confidence).toBe('high')
    expect(suggestion.suggestedProjectId).toBe('midway-mobile-storage-site')
    expect(suggestion.reasons.map((reason) => reason.type)).toContain('project-name')
  })

  it('returns a medium-confidence portfolio suggestion when only a section keyword is clear', () => {
    const projectRecords = flattenProjects(cloneWorkspace())
    const [suggestion] = deriveRepoPlacementSuggestions(projectRecords, [
      repo('tenra-lab-notes', 'Tenra research sketches awaiting project placement.'),
    ])

    expect(suggestion.confidence).toBe('medium')
    expect(suggestion.suggestedSectionName).toBe('Tenra')
    expect(suggestion.suggestedProjectId).toBeNull()
    expect(suggestion.reasons.map((reason) => reason.type)).toContain('portfolio-keyword')
  })

  it('guides unrelated repositories to Outliers with low confidence', () => {
    const projectRecords = flattenProjects(cloneWorkspace())
    const [suggestion] = deriveRepoPlacementSuggestions(projectRecords, [
      repo('field-notes', 'Small utility awaiting triage.'),
    ])

    expect(suggestion.confidence).toBe('low')
    expect(suggestion.suggestedSectionName).toBe('Outliers')
    expect(suggestion.suggestedGroupName).toBe('One-off tools')
    expect(suggestion.reasons.map((reason) => reason.type)).toContain('outliers')
  })

  it('excludes already-bound repositories from suggestions', () => {
    const projectRecords = flattenProjects(cloneWorkspace())
    const suggestions = deriveRepoPlacementSuggestions(projectRecords, [
      repo('JAMARQ-Atlas', 'Local-first operator dashboard.'),
      repo('new-utility', 'Small utility awaiting triage.'),
    ])

    expect(suggestions.map((suggestion) => suggestion.repository.name)).toEqual(['new-utility'])
  })

  it('does not mutate workspace records or GitHub repository objects', () => {
    const projectRecords = flattenProjects(cloneWorkspace())
    const repositories = [
      repo('thunder-road-website', 'Thunder Road public site.'),
      repo('new-utility', 'Small utility awaiting triage.'),
    ]
    const beforeRecords = JSON.stringify(projectRecords)
    const beforeRepositories = JSON.stringify(repositories)

    deriveRepoPlacementSuggestions(projectRecords, repositories)

    expect(JSON.stringify(projectRecords)).toBe(beforeRecords)
    expect(JSON.stringify(repositories)).toBe(beforeRepositories)
  })

  it('accepts a suggestion through the existing bind helper without changing manual status', () => {
    const workspace = cloneWorkspace()
    const [suggestion] = deriveRepoPlacementSuggestions(flattenProjects(workspace), [
      repo('tenra-public-site', 'Tenra public site.'),
    ])

    expect(suggestion.suggestedProjectId).toBe('tenra-public-site')

    const statusBefore = flattenProjects(workspace).find(
      (record) => record.project.id === 'tenra-public-site',
    )?.project.manual.status
    const next = bindRepositoryToProject(
      workspace,
      suggestion.suggestedProjectId!,
      repositorySummaryToLink(suggestion.repository),
    )
    const tenraSite = flattenProjects(next).find(
      (record) => record.project.id === 'tenra-public-site',
    )

    expect(tenraSite?.project.repositories).toContainEqual(
      expect.objectContaining({ name: 'tenra-public-site' }),
    )
    expect(tenraSite?.project.manual.status).toBe(statusBefore)
  })
})
