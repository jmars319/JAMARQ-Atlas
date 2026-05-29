import { expect, test } from '@playwright/test'
import { clickAtlasNav, readAtlasLocalStorage, uploadJsonFile } from './helpers/atlasTestUtils'

const snapshot = {
  schemaVersion: 1,
  kind: 'repo-operations',
  id: 'repo-ops-e2e',
  title: 'Repo Operations E2E',
  generatedAt: '2026-05-29T12:00:00.000Z',
  source: 'e2e registry',
  summary: {
    repoCount: 1,
    activeCount: 1,
    verificationCommandCount: 1,
    missingVerificationCount: 0,
  },
  repositories: [
    {
      id: 'atlas',
      name: 'Atlas',
      suite: 'JAMARQ',
      product: 'Atlas',
      lifecycle: 'active',
      deployCategory: 'local app',
      localPathHint: 'Apps/Atlas',
      githubRemote: 'https://github.com/jmars319/JAMARQ-Atlas',
      packageManagers: ['npm'],
      verificationCommands: ['npm run lint'],
      docs: [{ label: 'README', path: 'README.md' }],
      projectHints: [{ projectId: 'jamarq-atlas', label: 'Atlas' }],
      notes: 'E2E snapshot.',
    },
  ],
}

test('operator imports repo operations snapshot and creates Planning evidence', async ({ page }) => {
  await page.route('**/api/github/command-summaries?**', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data: [
          {
            owner: 'jmars319',
            repo: 'JAMARQ-Atlas',
            fullName: 'jmars319/JAMARQ-Atlas',
            state: 'healthy',
            severity: 'ok',
            signals: [],
            permissionGaps: [],
            latestCommit: {
              sha: 'abc1234',
              shortSha: 'abc1234',
              message: 'docs: repo ops',
              author: 'Test',
              date: '2026-05-29T12:00:00.000Z',
              htmlUrl: 'https://github.com/jmars319/JAMARQ-Atlas/commit/abc1234',
              verified: null,
              verificationReason: null,
            },
            latestWorkflowRun: null,
            latestCheckRun: null,
            latestRelease: null,
            latestDeployment: null,
            failureExplanation: null,
            localGit: {
              ok: true,
              configured: true,
              status: 'available',
              roots: [],
              error: null,
              data: {
                owner: 'jmars319',
                repo: 'JAMARQ-Atlas',
                path: '/tmp/Atlas',
                remoteUrl: 'https://github.com/jmars319/JAMARQ-Atlas',
                branch: 'main',
                upstream: 'origin/main',
                dirty: false,
                changedFiles: 0,
                ahead: 0,
                behind: 0,
                latestCommit: {
                  sha: 'abc1234',
                  shortSha: 'abc1234',
                  subject: 'docs: repo ops',
                  author: 'Test',
                  date: '2026-05-29T12:00:00.000Z',
                },
                checkedAt: '2026-05-29T12:00:00.000Z',
                diagnostic: 'clean',
              },
            },
            counts: {
              openPullRequests: 0,
              openIssues: 0,
              checkRuns: 0,
              branches: 1,
              tags: 0,
            },
            branchNames: ['main'],
            tagNames: [],
            fetchedAt: '2026-05-29T12:00:00.000Z',
            writeControlsEnabled: false,
          },
        ],
        error: null,
        permission: 'available',
      }),
    })
  })

  await page.goto('/')
  await clickAtlasNav(page, 'Repos')
  await uploadJsonFile(
    page.getByLabel('Import Repo Operations Snapshot JSON'),
    'repo-operations.json',
    snapshot,
  )

  await expect(page.getByText('Imported 1 repo operation records.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Atlas' })).toBeVisible()
  await expect(page.getByLabel('Repo operations summary')).toContainText('Registry repos')

  await page.getByRole('button', { name: 'Planning note' }).click()
  await expect(page.getByText('Planning note created for Atlas.')).toBeVisible()

  const planning = await readAtlasLocalStorage<{ notes: Array<{ title: string }> }>(
    page,
    'jamarq-atlas.planning.v1',
    { notes: [] },
  )
  expect(planning.notes.some((note) => note.title.includes('Repo workflow follow-up'))).toBe(true)
})
