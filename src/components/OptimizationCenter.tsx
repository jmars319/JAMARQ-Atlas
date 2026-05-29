import { Download, FileJson, Lightbulb, NotebookPen, Search } from 'lucide-react'
import { useMemo, useState, type ChangeEvent } from 'react'
import type { ProjectRecord } from '../domain/atlas'
import type {
  AtlasOptimizationState,
  OptimizationAssessment,
  OptimizationPriorityBucket,
  OptimizationRecommendation,
  OptimizationSnapshot,
} from '../domain/optimization'
import type { PlanningSourceLink } from '../domain/planning'
import {
  bucketLabel,
  categoryLabel,
  createOptimizationRecommendationSourceLink,
  createOptimizationPlanningNote,
  getOptimizationSnapshotKind,
  groupAssessmentsByBucket,
  parseOptimizationSnapshotJson,
  sortAssessmentsByScore,
  snapshotKindLabel,
  type OptimizationSnapshotKind,
} from '../services/optimization'

type BucketFilter = OptimizationPriorityBucket | 'all'

interface OptimizationCenterProps {
  optimization: AtlasOptimizationState
  projectRecords: ProjectRecord[]
  onImportSnapshot: (snapshot: OptimizationSnapshot) => void
  onSelectProject: (projectId: string) => void
  onCreatePlanningNote: (
    projectId: string,
    title: string,
    detail: string,
    sourceLinks?: PlanningSourceLink[],
  ) => void
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function selectedSnapshot(optimization: AtlasOptimizationState) {
  return (
    optimization.snapshots.find((snapshot) => snapshot.id === optimization.selectedSnapshotId) ??
    optimization.snapshots[0] ??
    null
  )
}

function assessmentMatchesQuery(assessment: OptimizationAssessment, query: string) {
  const normalized = query.trim().toLowerCase()

  if (!normalized) {
    return true
  }

  return [
    assessment.repoId,
    assessment.repoName,
    assessment.deployModel,
    assessment.scoreRationale,
    assessment.criticalPath,
    assessment.releaseVersioning,
    assessment.observabilityRecovery,
    assessment.uxProductAudit,
    assessment.consolidationRetirement,
    assessment.reusablePatterns,
  ]
    .join(' ')
    .toLowerCase()
    .includes(normalized)
}

function AssessmentCard({
  assessment,
  projectRecord,
  onSelectProject,
}: {
  assessment: OptimizationAssessment
  projectRecord: ProjectRecord | undefined
  onSelectProject: (projectId: string) => void
}) {
  return (
    <article className="optimization-card">
      <div className="optimization-card-heading">
        <div>
          <span>{bucketLabel(assessment.priorityBucket)}</span>
          <strong>{assessment.repoName}</strong>
          <small>
            {assessment.deployModel} / {assessment.securityGate}
          </small>
        </div>
        <strong className="optimization-score">{assessment.scorecard.total}</strong>
      </div>
      <p>{assessment.scoreRationale}</p>
      <dl className="optimization-score-grid">
        <div>
          <dt>Value</dt>
          <dd>{assessment.scorecard.value}</dd>
        </div>
        <div>
          <dt>Urgency</dt>
          <dd>{assessment.scorecard.urgency}</dd>
        </div>
        <div>
          <dt>Client/prod</dt>
          <dd>{assessment.scorecard.clientProductionImportance}</dd>
        </div>
        <div>
          <dt>Leverage</dt>
          <dd>{assessment.scorecard.strategicLeverage}</dd>
        </div>
        <div>
          <dt>Burden</dt>
          <dd>{assessment.scorecard.maintenanceBurden}</dd>
        </div>
        <div>
          <dt>Readiness</dt>
          <dd>{assessment.scorecard.readinessGap}</dd>
        </div>
        <div>
          <dt>Unblock</dt>
          <dd>{assessment.scorecard.unblockPotential}</dd>
        </div>
      </dl>
      <div className="optimization-detail-grid">
        <div>
          <span>Critical path</span>
          <p>{assessment.criticalPath}</p>
        </div>
        <div>
          <span>Release/readiness</span>
          <p>{assessment.releaseVersioning}</p>
        </div>
        <div>
          <span>Observability/recovery</span>
          <p>{assessment.observabilityRecovery}</p>
        </div>
        <div>
          <span>UX/product</span>
          <p>{assessment.uxProductAudit}</p>
        </div>
      </div>
      <div className="optimization-card-actions">
        {projectRecord ? (
          <button type="button" onClick={() => onSelectProject(projectRecord.project.id)}>
            Open project
          </button>
        ) : (
          <span>No Atlas project mapping</span>
        )}
        <span>{assessment.inspectionStatus}</span>
      </div>
    </article>
  )
}

function RecommendationCard({
  recommendation,
  projectRecord,
  snapshotKind,
  onCreatePlanningNote,
}: {
  recommendation: OptimizationRecommendation
  projectRecord: ProjectRecord | undefined
  snapshotKind: OptimizationSnapshotKind
  onCreatePlanningNote: OptimizationCenterProps['onCreatePlanningNote']
}) {
  const planningNote = createOptimizationPlanningNote(recommendation, snapshotKind)
  const sourceLink = createOptimizationRecommendationSourceLink(recommendation, snapshotKind)

  return (
    <article className="optimization-recommendation-card">
      <span>
        {categoryLabel(recommendation.category)} / {bucketLabel(recommendation.priorityBucket)}
      </span>
      <strong>{recommendation.title}</strong>
      <p>{recommendation.detail}</p>
      <button
        type="button"
        disabled={!projectRecord}
        onClick={() =>
          projectRecord
            ? onCreatePlanningNote(
                projectRecord.project.id,
                planningNote.title,
                planningNote.detail,
                [sourceLink],
              )
            : undefined
        }
      >
        <NotebookPen size={15} />
        Create planning note
      </button>
    </article>
  )
}

export function OptimizationCenter({
  optimization,
  projectRecords,
  onImportSnapshot,
  onSelectProject,
  onCreatePlanningNote,
}: OptimizationCenterProps) {
  const [pendingSnapshot, setPendingSnapshot] = useState<OptimizationSnapshot | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [bucketFilter, setBucketFilter] = useState<BucketFilter>('all')
  const snapshot = selectedSnapshot(optimization)
  const snapshotKind = snapshot ? getOptimizationSnapshotKind(snapshot) : 'portfolio-optimization'
  const recordsByProjectId = useMemo(
    () => new Map(projectRecords.map((record) => [record.project.id, record] as const)),
    [projectRecords],
  )
  const visibleAssessments = snapshot
    ? sortAssessmentsByScore(snapshot.assessments).filter(
        (assessment) =>
          (bucketFilter === 'all' || assessment.priorityBucket === bucketFilter) &&
          assessmentMatchesQuery(assessment, query),
      )
    : []
  const grouped = groupAssessmentsByBucket(visibleAssessments)
  const mappedRecommendations = snapshot?.recommendations ?? []

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setErrors([])
    setMessage('')
    setPendingSnapshot(null)

    if (!file) {
      return
    }

    const result = parseOptimizationSnapshotJson(await file.text())

    if (!result.ok || !result.snapshot) {
      setErrors(result.errors)
      return
    }

    setPendingSnapshot(result.snapshot)
    setMessage(`${snapshotKindLabel(getOptimizationSnapshotKind(result.snapshot))} import preview is ready.`)
  }

  return (
    <section className="optimization-center" aria-label="Portfolio Optimization Center">
      <div className="surface-heading">
        <div>
          <span className="section-label">Registry-led operating review</span>
          <h1>Portfolio Optimization</h1>
          <p>
            Import registry-generated optimization snapshots or owner-confirmed boundary packets,
            review priority buckets, and create explicit Planning notes without mutating project
            status or repo lifecycle.
          </p>
        </div>
      </div>

      <div className="optimization-import-panel">
        <label className="field">
          <span>Import optimization or boundary packet</span>
          <input type="file" accept="application/json" onChange={handleImport} />
        </label>
        {pendingSnapshot ? (
          <div className="optimization-import-preview" aria-label="Optimization import preview">
            <FileJson size={18} />
            <div>
              <strong>{pendingSnapshot.title}</strong>
              <span>
                {snapshotKindLabel(getOptimizationSnapshotKind(pendingSnapshot))} /{' '}
                {pendingSnapshot.assessments.length} assessments /{' '}
                {pendingSnapshot.recommendations.length} recommendations
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                onImportSnapshot(pendingSnapshot)
                setMessage(
                  `${snapshotKindLabel(getOptimizationSnapshotKind(pendingSnapshot))} snapshot stored locally.`,
                )
                setPendingSnapshot(null)
              }}
            >
              Store optimization snapshot
            </button>
          </div>
        ) : null}
        {message ? <p className="form-message success">{message}</p> : null}
        {errors.length > 0 ? (
          <div className="form-message error">
            {errors.map((error) => (
              <p key={error}>{error}</p>
            ))}
          </div>
        ) : null}
      </div>

      {snapshot ? (
        <>
          <div className="optimization-summary-grid" aria-label="Optimization snapshot summary">
            <div>
              <span>Snapshot</span>
              <strong>{snapshot.title}</strong>
            </div>
            <div>
              <span>Packet type</span>
              <strong>{snapshotKindLabel(snapshotKind)}</strong>
            </div>
            <div>
              <span>Repos</span>
              <strong>{snapshot.summary.repoCount}</strong>
            </div>
            <div>
              <span>Deep audits</span>
              <strong>{snapshot.summary.deepAuditCount}</strong>
            </div>
            <div>
              <span>Skipped</span>
              <strong>{snapshot.summary.skippedCount}</strong>
            </div>
            <button
              type="button"
              onClick={() => downloadJson(`${snapshot.id}.json`, snapshot)}
            >
              <Download size={15} />
              Export snapshot
            </button>
          </div>

          {snapshotKind === 'app-boundary-audit' ? (
            <article className="optimization-boundary-callout">
              <div>
                <span className="section-label">Owner-confirmed boundaries</span>
                <strong>Boundary audit packet</strong>
              </div>
              <p>
                Use these recommendations to create Planning notes for confirmed app boundary,
                module, and shared-capability work. Atlas stores the packet locally but does not
                change registry lifecycle, repo status, or consolidation decisions.
              </p>
            </article>
          ) : null}

          <div className="optimization-controls">
            <label className="field">
              <span>Priority bucket</span>
              <select
                value={bucketFilter}
                onChange={(event) => setBucketFilter(event.target.value as BucketFilter)}
              >
                <option value="all">All buckets</option>
                {groupAssessmentsByBucket(snapshot.assessments).map((group) => (
                  <option key={group.bucket} value={group.bucket}>
                    {bucketLabel(group.bucket)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Search optimization snapshot</span>
              <div className="input-with-icon">
                <Search size={15} />
                <input value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
            </label>
          </div>

          <div className="optimization-grid" aria-label="Optimization scorecards">
            {grouped.map((group) =>
              group.assessments.length > 0 ? (
                <section key={group.bucket}>
                  <h2>{bucketLabel(group.bucket)}</h2>
                  {group.assessments.map((assessment) => (
                    <AssessmentCard
                      key={assessment.repoId}
                      assessment={assessment}
                      projectRecord={recordsByProjectId.get(assessment.atlasProjectId)}
                      onSelectProject={onSelectProject}
                    />
                  ))}
                </section>
              ) : null,
            )}
          </div>

          <section className="optimization-recommendations" aria-label="Optimization recommendations">
            <div className="surface-heading">
              <div>
                <span className="section-label">
                  <Lightbulb size={14} /> Advisory follow-ups
                </span>
                <h2>Recommendations</h2>
              </div>
            </div>
            <div className="optimization-recommendation-grid">
              {mappedRecommendations.map((recommendation) => (
                <RecommendationCard
                  key={recommendation.id}
                  recommendation={recommendation}
                  projectRecord={recordsByProjectId.get(recommendation.atlasProjectId)}
                  snapshotKind={snapshotKind}
                  onCreatePlanningNote={onCreatePlanningNote}
                />
              ))}
            </div>
          </section>
        </>
      ) : (
        <div className="empty-state">
          <strong>No optimization or boundary packet imported</strong>
          <span>
            Import the registry-generated optimization JSON packet or the owner-confirmed boundary
            audit packet from agentic-instructions to review scorecards in Atlas.
          </span>
        </div>
      )}
    </section>
  )
}
