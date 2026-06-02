import type { ProjectRecord } from '../../domain/atlas'
import type { DispatchState } from '../../domain/dispatch'
import type { ReviewNote } from '../../domain/review'
import type { GithubRepositorySource, GithubRepositorySummary } from '../../services/githubIntegration'

export type IntakeFilter = 'all' | GithubRepositorySource | 'unbound'

export interface IntakeRepository {
  repository: GithubRepositorySummary
  sources: GithubRepositorySource[]
}

export interface GitHubIntakeDashboardProps {
  projectRecords: ProjectRecord[]
  dispatch: DispatchState
  selectedProjectId: string
  onSelectProject: (projectId: string) => void
  onBindRepository: (projectId: string, repository: GithubRepositorySummary) => void
  onCreateInboxProject: (repository: GithubRepositorySummary) => void
  onAddReviewNote: (note: ReviewNote) => void
}
