import { History } from 'lucide-react'
import {
  DISPATCH_EVIDENCE_HISTORY_LIMIT,
  type DispatchEvidenceComparison,
} from '../services/dispatchEvidence'
import { evidenceHistoryLabel } from './DispatchPanelParts.helpers'

export function EvidenceHistoryDisplayControl({
  targetName,
  limit,
  onLimitChange,
}: {
  targetName: string
  limit: number
  onLimitChange: (limit: number) => void
}) {
  return (
    <div className="dispatch-preflight-actions">
      <label className="repo-selector">
        <History size={15} />
        <span className="sr-only">Evidence history display</span>
        <select
          aria-label={`${targetName} evidence history display`}
          value={limit}
          onChange={(event) => onLimitChange(Number(event.target.value))}
        >
          <option value={5}>Latest 5 evidence runs</option>
          <option value={10}>Latest 10 evidence runs</option>
          <option value={DISPATCH_EVIDENCE_HISTORY_LIMIT}>All retained evidence</option>
        </select>
      </label>
      <span>Showing {evidenceHistoryLabel(limit)}. Atlas keeps the newest retained evidence only.</span>
    </div>
  )
}

export function EvidenceComparisonSummary({
  label,
  comparison,
}: {
  label: string
  comparison: DispatchEvidenceComparison
}) {
  return (
    <div className="dispatch-evidence-comparison" aria-label={`${label} evidence comparison`}>
      <strong>{comparison.summary}</strong>
      {comparison.baselineId ? (
        <span>
          Compared {comparison.currentId ?? 'latest evidence'} against {comparison.baselineId}.
        </span>
      ) : (
        <span>Capture at least two evidence runs to compare changes.</span>
      )}
      {comparison.changes.some((change) => change.kind !== 'unchanged') ? (
        <ul className="dispatch-list">
          {comparison.changes
            .filter((change) => change.kind !== 'unchanged')
            .slice(0, 4)
            .map((change) => (
              <li key={change.id}>
                {change.label}: {change.kind} from {change.before} to {change.after}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  )
}
