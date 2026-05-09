export interface GithubIngestionContract {
  cacheFile: string
  command: string
  environment: string[]
  responsibilities: string[]
}

export interface GithubSnapshotRepository {
  id: number
  name: string
  fullName: string
  private: boolean
  htmlUrl: string
  defaultBranch: string
  updatedAt: string
  pushedAt: string | null
  commits: unknown[]
  pullRequests: unknown[]
  issues: unknown[]
  releases: unknown[]
  workflowRuns: unknown[]
}

export interface GithubSnapshot {
  generatedAt: string | null
  source: 'github' | 'none'
  repositories: GithubSnapshotRepository[]
}

export const githubIngestionContract: GithubIngestionContract = {
  cacheFile: 'src/data/github/github-snapshot.json',
  command: 'npm run ingest:github',
  environment: ['GITHUB_TOKEN or GH_TOKEN', 'GITHUB_OWNER', 'GITHUB_REPOS'],
  responsibilities: [
    'Fetch raw repository activity only.',
    'Write a local cache that can be reviewed or mapped into Atlas projects.',
    'Never overwrite manual status, next action, current risk, blockers, or decisions.',
  ],
}
