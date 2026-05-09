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
