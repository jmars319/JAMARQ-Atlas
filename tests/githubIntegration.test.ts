import { describe, expect, it } from 'vitest'
import { normalizeGithubResource } from '../server/githubApi'

describe('GitHub API normalization', () => {
  it('normalizes branch and tag resources for repo deep dive', () => {
    const branches = normalizeGithubResource('branches', [
      {
        name: 'main',
        protected: true,
        commit: {
          sha: 'abcdef1234567890',
          url: 'https://api.github.com/repos/jmars319/example/commits/abcdef1',
        },
      },
    ])
    const tags = normalizeGithubResource('tags', [
      {
        name: 'v1.0.0',
        commit: {
          sha: '123456abcdef',
        },
        zipball_url: 'https://github.com/jmars319/example/archive/v1.0.0.zip',
        tarball_url: 'https://github.com/jmars319/example/archive/v1.0.0.tar.gz',
      },
    ])

    expect(branches).toEqual([
      {
        name: 'main',
        protected: true,
        commitSha: 'abcdef1234567890',
        commitUrl: 'https://api.github.com/repos/jmars319/example/commits/abcdef1',
      },
    ])
    expect(tags).toEqual([
      {
        name: 'v1.0.0',
        commitSha: '123456abcdef',
        zipballUrl: 'https://github.com/jmars319/example/archive/v1.0.0.zip',
        tarballUrl: 'https://github.com/jmars319/example/archive/v1.0.0.tar.gz',
      },
    ])
  })
})
