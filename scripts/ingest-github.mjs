import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
const owner = process.env.GITHUB_OWNER
const explicitRepos = (process.env.GITHUB_REPOS || '')
  .split(',')
  .map((repo) => repo.trim())
  .filter(Boolean)

const outputPath = resolve('src/data/github/github-snapshot.json')
const apiBase = 'https://api.github.com'

if (!token) {
  console.log('No GITHUB_TOKEN or GH_TOKEN found. GitHub ingestion skipped.')
  process.exit(0)
}

async function github(path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'jamarq-atlas-local-ingest',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`${response.status} ${response.statusText}: ${body}`)
  }

  return response.json()
}

async function safeGithub(path, fallback = []) {
  try {
    return await github(path)
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      path,
      fallback,
    }
  }
}

function repoPath(repo) {
  return encodeURIComponent(repo.full_name).replace('%2F', '/')
}

async function listRepositories() {
  if (explicitRepos.length > 0) {
    return Promise.all(
      explicitRepos.map((repo) => {
        const fullName = repo.includes('/') ? repo : `${owner}/${repo}`
        return github(`/repos/${fullName}`)
      }),
    )
  }

  if (owner) {
    return github(`/users/${owner}/repos?sort=updated&per_page=100`)
  }

  return github('/user/repos?affiliation=owner,collaborator,organization_member&sort=updated&per_page=100')
}

function compactCommit(commit) {
  return {
    sha: commit.sha,
    message: commit.commit?.message ?? '',
    author: commit.commit?.author?.name ?? commit.author?.login ?? null,
    date: commit.commit?.author?.date ?? null,
    htmlUrl: commit.html_url,
  }
}

function compactPullRequest(pullRequest) {
  return {
    id: pullRequest.id,
    number: pullRequest.number,
    state: pullRequest.state,
    title: pullRequest.title,
    user: pullRequest.user?.login ?? null,
    updatedAt: pullRequest.updated_at,
    htmlUrl: pullRequest.html_url,
  }
}

function compactIssue(issue) {
  return {
    id: issue.id,
    number: issue.number,
    state: issue.state,
    title: issue.title,
    user: issue.user?.login ?? null,
    updatedAt: issue.updated_at,
    htmlUrl: issue.html_url,
  }
}

function compactRelease(release) {
  return {
    id: release.id,
    name: release.name,
    tagName: release.tag_name,
    draft: release.draft,
    prerelease: release.prerelease,
    publishedAt: release.published_at,
    htmlUrl: release.html_url,
  }
}

function compactWorkflowRun(run) {
  return {
    id: run.id,
    name: run.name,
    status: run.status,
    conclusion: run.conclusion,
    branch: run.head_branch,
    event: run.event,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    htmlUrl: run.html_url,
  }
}

async function ingestRepository(repo) {
  const path = repoPath(repo)
  const [commits, pullRequests, issues, releases, workflowRuns] = await Promise.all([
    safeGithub(`/repos/${path}/commits?per_page=10`),
    safeGithub(`/repos/${path}/pulls?state=all&sort=updated&direction=desc&per_page=10`),
    safeGithub(`/repos/${path}/issues?state=all&sort=updated&direction=desc&per_page=10`),
    safeGithub(`/repos/${path}/releases?per_page=10`),
    safeGithub(`/repos/${path}/actions/runs?per_page=10`),
  ])

  return {
    id: repo.id,
    name: repo.name,
    fullName: repo.full_name,
    private: repo.private,
    htmlUrl: repo.html_url,
    defaultBranch: repo.default_branch,
    updatedAt: repo.updated_at,
    pushedAt: repo.pushed_at,
    commits: Array.isArray(commits) ? commits.map(compactCommit) : commits,
    pullRequests: Array.isArray(pullRequests)
      ? pullRequests.map(compactPullRequest)
      : pullRequests,
    issues: Array.isArray(issues)
      ? issues.filter((issue) => !issue.pull_request).map(compactIssue)
      : issues,
    releases: Array.isArray(releases) ? releases.map(compactRelease) : releases,
    workflowRuns: Array.isArray(workflowRuns.workflow_runs)
      ? workflowRuns.workflow_runs.map(compactWorkflowRun)
      : workflowRuns,
  }
}

const repositories = await listRepositories()
const snapshot = {
  generatedAt: new Date().toISOString(),
  source: 'github',
  repositories: await Promise.all(repositories.map(ingestRepository)),
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`)

console.log(`Wrote ${snapshot.repositories.length} repositories to ${outputPath}`)
