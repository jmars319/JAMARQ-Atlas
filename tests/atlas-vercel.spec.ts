import { expect, test, type Page } from '@playwright/test'
import { clickAtlasNav, expectSettingsConnectionStatus } from './helpers/atlasTestUtils'

const atlasTargetId = 'jamarq-atlas-vercel-production'

function deploymentSummary(target: 'production' | 'preview') {
  return {
    id: `dpl_atlas_${target}`,
    name: 'jamarq-atlas',
    projectId: 'prj_atlas',
    url:
      target === 'production'
        ? 'atlas.jamarq.digital'
        : 'jamarq-atlas-git-main-jamarq.vercel.app',
    deploymentUrl:
      target === 'production'
        ? 'https://atlas.jamarq.digital'
        : 'https://jamarq-atlas-git-main-jamarq.vercel.app',
    inspectorUrl: `https://vercel.com/jamarq/jamarq-atlas/${target}`,
    state: 'READY',
    readyState: 'READY',
    target,
    readySubstate: null,
    checksState: 'completed',
    checksConclusion: 'succeeded',
    errorCode: null,
    errorMessage: null,
    createdAt: target === 'production' ? '2026-05-01T12:00:00Z' : '2026-05-19T12:00:00Z',
    buildingAt: null,
    readyAt: target === 'production' ? '2026-05-01T12:03:00Z' : '2026-05-19T12:03:00Z',
    creator: 'jmars319',
    source: 'github',
    branch: target === 'production' ? 'main' : 'feature/atlas-preview',
    sha: target === 'production' ? 'b38c67b1234567890' : 'c41f7ad1234567890',
    meta: {
      githubCommitSha: target === 'production' ? 'b38c67b1234567890' : 'c41f7ad1234567890',
      githubCommitRef: target === 'production' ? 'main' : 'feature/atlas-preview',
      githubRepo: 'JAMARQ-Atlas',
      githubOrg: 'jmars319',
    },
  }
}

function atlasVercelCommandSummary() {
  const latestProduction = deploymentSummary('production')
  const latestPreview = deploymentSummary('preview')

  return {
    targetId: atlasTargetId,
    projectIdOrName: 'jamarq-atlas',
    binding: {
      targetId: atlasTargetId,
      projectIdOrName: 'jamarq-atlas',
      mapped: true,
    },
    project: {
      id: 'prj_atlas',
      name: 'jamarq-atlas',
      framework: 'vite',
      accountId: 'team_jamarq',
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-19T12:00:00Z',
      publicSource: false,
      rootDirectory: null,
      outputDirectory: 'dist',
      nodeVersion: '22.x',
      link: {
        type: 'github',
        repo: 'JAMARQ-Atlas',
        productionBranch: 'main',
      },
      latestDeployments: [latestProduction, latestPreview],
    },
    domains: [
      {
        name: 'atlas.jamarq.digital',
        apexName: 'jamarq.digital',
        projectId: 'prj_atlas',
        verified: true,
        redirect: null,
        redirectStatusCode: null,
        gitBranch: null,
        createdAt: '2026-05-01T00:00:00Z',
        updatedAt: '2026-05-19T12:00:00Z',
      },
    ],
    latestProduction,
    latestPreview,
    deployments: [latestProduction, latestPreview],
    signals: [
      {
        id: `${atlasTargetId}-mapped`,
        category: 'mapping',
        severity: 'ok',
        title: 'Vercel project mapped',
        detail: 'Atlas by Tenra Vercel production maps to jamarq-atlas.',
        evidence: ['prj_atlas', 'jamarq-atlas'],
        url: null,
      },
    ],
    permissionGaps: [],
    state: 'attention',
    fetchedAt: '2026-05-20T12:00:00Z',
    writeControlsEnabled: false,
  }
}

async function installVercelMocks(page: Page) {
  await page.route('**/api/vercel/status', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        tokenConfigured: true,
        teamIdConfigured: true,
        teamSlugConfigured: false,
        teamScope: {
          teamIdConfigured: true,
          teamSlugConfigured: false,
          usesOrgIdFallback: false,
        },
        missingConfig: [],
        mappedTargets: [{ targetId: atlasTargetId, projectIdOrName: 'jamarq-atlas' }],
        mappedTargetCount: 1,
        writeControlsEnabled: false,
        message: 'Vercel read-only API configured with 1 mapped target.',
      }),
    })
  })

  await page.route('**/api/vercel/command-summaries?**', async (route) => {
    const targetIds = new URL(route.request().url()).searchParams.get('targetIds') ?? ''
    const data = targetIds.includes(atlasTargetId) ? [atlasVercelCommandSummary()] : []

    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        data,
        error: null,
        permission: 'available',
        fetchedAt: '2026-05-20T12:00:00Z',
      }),
    })
  })
}

test('Vercel deployment evidence stays read-only across Settings, Dispatch, Project, and Review', async ({
  page,
}) => {
  await installVercelMocks(page)
  await page.goto('/')

  await clickAtlasNav(page, 'Settings')
  await expectSettingsConnectionStatus(page, 'Vercel Deployment Evidence', 'Available')
  await expectSettingsConnectionStatus(page, 'Vercel Deployment Evidence', '1 Dispatch target')
  await expectSettingsConnectionStatus(page, 'Vercel Deployment Evidence', 'Deployment writes locked: false')

  await clickAtlasNav(page, 'Dispatch')
  const vercelPanel = page.getByLabel('Vercel deployment evidence')
  await expect(vercelPanel).toContainText('Atlas by Tenra Vercel production')
  await expect(vercelPanel).toContainText('READY / production / main / b38c67b')
  await expect(vercelPanel).toContainText('READY / preview / feature/atlas-preview / c41f7ad')
  await expect(vercelPanel).toContainText('Production deployment is stale')
  await expect(vercelPanel).toContainText('writeControlsEnabled: false')
  await expect(vercelPanel).toContainText('deploy/promote/rollback locked')
  await expect(page.getByRole('button', { name: /^Deploy$/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Promote$/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Rollback$/ })).toHaveCount(0)

  await clickAtlasNav(page, 'Board')
  await page.getByLabel('Search projects').fill('Atlas by Tenra')
  await page.locator('.project-card').filter({ hasText: 'Atlas by Tenra' }).click()
  const projectDetail = page.locator('.project-detail')
  await expect(projectDetail).toContainText('Project Command Summary')
  await expect(projectDetail).toContainText('READY / production / main / b38c67b')
  await expect(projectDetail).toContainText('Deployment signals')

  await clickAtlasNav(page, 'Review')
  await page.getByRole('button', { name: 'Full queue' }).click()
  const reviewQueue = page.getByLabel('Operator review queue')
  const vercelReviewItem = reviewQueue
    .locator('.review-item')
    .filter({ hasText: 'Atlas by Tenra: Production deployment is stale' })
  await expect(vercelReviewItem).toContainText('Latest production deployment is')
  await vercelReviewItem.getByRole('button', { name: 'Review' }).click()
  await expect(vercelReviewItem).toContainText(
    'Vercel deployment evidence is advisory and needs human review',
  )
})
