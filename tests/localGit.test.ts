import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  getLocalGitRepositoryPreview,
  getLocalGitRepositoryStatus,
  localGitApiMiddleware,
  normalizeGithubRemoteUrl,
  parseAllowedWorkflowCommand,
  parseGitNumstat,
  parseGitStatusFileChanges,
  parseGitStatusPorcelain,
  parseLatestCommit,
  runLocalGitWorkflow,
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

  it('parses file-level local Git preview evidence', () => {
    expect(
      parseGitStatusFileChanges(
        '## main...origin/main\n M src/App.tsx\nA  src/new.ts\nR  old.ts -> src/renamed.ts\n?? notes.txt\n',
      ),
    ).toEqual([
      expect.objectContaining({
        path: 'src/App.tsx',
        change: 'modified',
        staged: false,
        unstaged: true,
      }),
      expect.objectContaining({
        path: 'src/new.ts',
        change: 'added',
        staged: true,
        unstaged: false,
      }),
      expect.objectContaining({
        path: 'src/renamed.ts',
        previousPath: 'old.ts',
        change: 'renamed',
      }),
      expect.objectContaining({
        path: 'notes.txt',
        change: 'untracked',
        untracked: true,
      }),
    ])

    expect(parseGitNumstat('4\t2\tsrc/App.tsx\n-\t-\tpublic/image.png\n').get('src/App.tsx')).toEqual({
      additions: 4,
      deletions: 2,
    })
    expect(parseGitNumstat('4\t2\tsrc/App.tsx\n-\t-\tpublic/image.png\n').get('public/image.png')).toEqual({
      additions: null,
      deletions: null,
    })
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

  it('builds read-only local Git previews without staging or committing', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'atlas-local-git-preview-'))
    const repoPath = path.join(root, 'JAMARQ-Atlas')

    mkdirSync(repoPath)
    execFileSync('git', ['-C', repoPath, 'init', '-b', 'main'])
    execFileSync('git', [
      '-C',
      repoPath,
      'remote',
      'add',
      'origin',
      'git@github.com:jmars319/JAMARQ-Atlas.git',
    ])
    writeFileSync(path.join(repoPath, 'README.md'), 'Atlas preview\n')

    const preview = await getLocalGitRepositoryPreview('jmars319', 'JAMARQ-Atlas', {
      ATLAS_LOCAL_REPO_ROOTS: root,
    })

    expect(preview.status).toBe('available')
    expect(preview.data?.changedFiles).toEqual([
      expect.objectContaining({
        path: 'README.md',
        change: 'untracked',
        untracked: true,
      }),
    ])
    expect(preview.data?.dryRunCommit.blocked).toBe(true)
    expect(preview.data?.dryRunCommit.commandPreview).toEqual(
      expect.arrayContaining(['future locked: git add <reviewed-files>']),
    )
  })

  it('keeps local Git preview routes GET-only', async () => {
    const chunks: string[] = []
    const response = {
      statusCode: 0,
      setHeader: () => undefined,
      end: (chunk: string) => {
        chunks.push(chunk)
      },
    }

    await localGitApiMiddleware(
      {
        method: 'POST',
        url: '/api/git/repositories/preview?owner=jmars319&repo=JAMARQ-Atlas',
      } as Parameters<typeof localGitApiMiddleware>[0],
      response as unknown as Parameters<typeof localGitApiMiddleware>[1],
    )

    expect(response.statusCode).toBe(405)
    expect(chunks.join('')).toContain('status and preview routes expose GET only')
  })

  it('parses only allowlisted repo workflow commands', () => {
    expect(parseAllowedWorkflowCommand('npm run lint')).toEqual({
      executable: 'npm',
      args: ['run', 'lint'],
    })
    expect(parseAllowedWorkflowCommand('mise exec -- pnpm run verify:contracts')).toEqual({
      executable: 'mise',
      args: ['exec', '--', 'pnpm', 'run', 'verify:contracts'],
    })
    expect(parseAllowedWorkflowCommand('git diff --check')).toEqual({
      executable: 'git',
      args: ['diff', '--check'],
    })
    expect(parseAllowedWorkflowCommand('git reset --hard')).toBeNull()
    expect(parseAllowedWorkflowCommand('npm run build && git push')).toBeNull()
  })

  it('runs allowlisted workflow commands and blocks destructive commands', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'atlas-local-git-workflow-'))
    const repoPath = path.join(root, 'JAMARQ-Atlas')

    mkdirSync(repoPath)
    execFileSync('git', ['-C', repoPath, 'init', '-b', 'main'])
    execFileSync('git', [
      '-C',
      repoPath,
      'remote',
      'add',
      'origin',
      'git@github.com:jmars319/JAMARQ-Atlas.git',
    ])
    writeFileSync(path.join(repoPath, 'README.md'), 'Atlas workflow\n')

    const completed = await runLocalGitWorkflow(
      {
        repositoryId: 'atlas',
        owner: 'jmars319',
        repo: 'JAMARQ-Atlas',
        command: { kind: 'verify-command', command: 'git diff --check' },
      },
      { ATLAS_LOCAL_REPO_ROOTS: root },
    )
    const blocked = await runLocalGitWorkflow(
      {
        repositoryId: 'atlas',
        owner: 'jmars319',
        repo: 'JAMARQ-Atlas',
        command: { kind: 'verify-command', command: 'git reset --hard' },
      },
      { ATLAS_LOCAL_REPO_ROOTS: root },
    )

    expect(completed.status).toBe('completed')
    expect(completed.run?.commandLabel).toBe('git diff --check')
    expect(blocked.status).toBe('blocked')
    expect(blocked.run?.diagnostic).toContain('not allowlisted')
  })

  it('requires confirmation and a clean upstream branch before fast-forward pull', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'atlas-local-git-pull-'))
    const repoPath = path.join(root, 'JAMARQ-Atlas')

    mkdirSync(repoPath)
    execFileSync('git', ['-C', repoPath, 'init', '-b', 'main'])
    execFileSync('git', [
      '-C',
      repoPath,
      'remote',
      'add',
      'origin',
      'git@github.com:jmars319/JAMARQ-Atlas.git',
    ])
    writeFileSync(path.join(repoPath, 'README.md'), 'Atlas workflow\n')

    const wrongConfirmation = await runLocalGitWorkflow(
      {
        repositoryId: 'atlas',
        owner: 'jmars319',
        repo: 'JAMARQ-Atlas',
        command: { kind: 'git-pull-ff-only' },
        confirmation: 'pull',
      },
      { ATLAS_LOCAL_REPO_ROOTS: root },
    )
    const dirtyRepo = await runLocalGitWorkflow(
      {
        repositoryId: 'atlas',
        owner: 'jmars319',
        repo: 'JAMARQ-Atlas',
        command: { kind: 'git-pull-ff-only' },
        confirmation: 'PULL jmars319/JAMARQ-Atlas',
      },
      { ATLAS_LOCAL_REPO_ROOTS: root },
    )

    expect(wrongConfirmation.status).toBe('blocked')
    expect(wrongConfirmation.run?.diagnostic).toContain('typed confirmation')
    expect(dirtyRepo.status).toBe('blocked')
    expect(dirtyRepo.run?.diagnostic).toContain('working tree is clean')
  })
})
