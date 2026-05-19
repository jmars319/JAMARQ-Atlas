import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  getLocalGitRepositoryStatus,
  normalizeGithubRemoteUrl,
  parseGitStatusPorcelain,
  parseLatestCommit,
} from '../server/localGitApi'

describe('local Git status parsing', () => {
  it('normalizes GitHub remote URLs without mutating repositories', () => {
    expect(normalizeGithubRemoteUrl('git@github.com:jmars319/JAMARQ-Atlas.git')).toEqual({
      owner: 'jmars319',
      repo: 'jamarq-atlas',
    })
    expect(normalizeGithubRemoteUrl('https://github.com/jmars319/JAMARQ-Atlas.git')).toEqual({
      owner: 'jmars319',
      repo: 'jamarq-atlas',
    })
    expect(normalizeGithubRemoteUrl('https://example.com/jmars319/JAMARQ-Atlas.git')).toBeNull()
  })

  it('parses clean, dirty, ahead, behind, and no-upstream status output', () => {
    expect(parseGitStatusPorcelain('## main...origin/main\n')).toMatchObject({
      branch: 'main',
      upstream: 'origin/main',
      dirty: false,
      changedFiles: 0,
      ahead: 0,
      behind: 0,
    })

    expect(
      parseGitStatusPorcelain('## main...origin/main [ahead 2, behind 1]\n M src/App.tsx\n?? tmp.txt\n'),
    ).toMatchObject({
      branch: 'main',
      upstream: 'origin/main',
      dirty: true,
      changedFiles: 2,
      ahead: 2,
      behind: 1,
    })

    expect(parseGitStatusPorcelain('## feature/local\n M README.md\n')).toMatchObject({
      branch: 'feature/local',
      upstream: null,
      dirty: true,
      changedFiles: 1,
      ahead: null,
      behind: null,
    })
  })

  it('parses latest commit summaries', () => {
    expect(parseLatestCommit('abcdef123\x1fabcdef1\x1fInitial commit\x1fJason\x1f2026-05-18T14:00:00Z')).toEqual({
      sha: 'abcdef123',
      shortSha: 'abcdef1',
      subject: 'Initial commit',
      author: 'Jason',
      date: '2026-05-18T14:00:00Z',
    })
    expect(parseLatestCommit('')).toBeNull()
  })

  it('reports not-configured and no-match states explicitly', async () => {
    const noRoot = await getLocalGitRepositoryStatus('jmars319', 'JAMARQ-Atlas', {})
    const root = mkdtempSync(path.join(tmpdir(), 'atlas-local-git-'))
    const noMatch = await getLocalGitRepositoryStatus('jmars319', 'JAMARQ-Atlas', {
      ATLAS_LOCAL_REPO_ROOTS: root,
    })

    expect(noRoot.status).toBe('not-configured')
    expect(noRoot.ok).toBe(false)
    expect(noMatch.status).toBe('not-found')
    expect(noMatch.ok).toBe(false)
  })
})
