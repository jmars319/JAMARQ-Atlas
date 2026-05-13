import { ClipboardList, NotebookPen } from 'lucide-react'
import { useState } from 'react'
import { formatDateTimeLabel, type ProjectRecord } from '../domain/atlas'
import type { ReviewNote, ReviewOutcome, ReviewState } from '../domain/review'
import { createReviewNote, getReviewForProject } from '../services/review'

interface ReviewPanelProps {
  review: ReviewState
  record: ProjectRecord
  onAddReviewNote: (note: ReviewNote) => void
  onOpenReview: () => void
}

function outcomeLabel(outcome: ReviewOutcome) {
  return outcome
    .split('-')
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

export function ReviewPanel({ review, record, onAddReviewNote, onOpenReview }: ReviewPanelProps) {
  const [noteDraft, setNoteDraft] = useState('')
  const [outcome, setOutcome] = useState<ReviewOutcome>('noted')
  const projectReview = getReviewForProject(review, record.project.id)
  const recentNotes = projectReview.notes.slice(0, 3)
  const recentSessions = projectReview.sessions.slice(0, 3)

  function handleAddNote() {
    if (!noteDraft.trim()) {
      return
    }

    onAddReviewNote(
      createReviewNote({
        projectId: record.project.id,
        source: 'workspace',
        outcome,
        body: noteDraft,
      }),
    )
    setNoteDraft('')
    setOutcome('noted')
  }

  return (
    <div className="review-mini" aria-label="Project review">
      <div className="planning-mini-summary">
        <div>
          <span>Sessions</span>
          <strong>{projectReview.sessions.length}</strong>
        </div>
        <div>
          <span>Notes</span>
          <strong>{projectReview.notes.length}</strong>
        </div>
        <div>
          <span>Follow-ups</span>
          <strong>
            {projectReview.notes.filter((note) => note.outcome === 'needs-follow-up').length}
          </strong>
        </div>
      </div>

      <div className="field-grid">
        <label className="field field-full">
          <span>Project review note</span>
          <textarea
            aria-label="Project review note"
            rows={2}
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Outcome</span>
          <select
            aria-label="Project review outcome"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value as ReviewOutcome)}
          >
            <option value="noted">Noted</option>
            <option value="needs-follow-up">Needs follow-up</option>
            <option value="no-action">No action</option>
            <option value="planned">Planned</option>
          </select>
        </label>
      </div>

      <div className="review-actions">
        <button type="button" disabled={!noteDraft.trim()} onClick={handleAddNote}>
          <NotebookPen size={15} />
          Add review note
        </button>
        <button type="button" onClick={onOpenReview}>
          <ClipboardList size={15} />
          Open Review
        </button>
      </div>

      {recentNotes.length > 0 || recentSessions.length > 0 ? (
        <div className="review-mini-list" aria-label="Project review history">
          {recentNotes.map((note) => (
            <article key={note.id}>
              <span>{formatDateTimeLabel(note.createdAt)}</span>
              <strong>{outcomeLabel(note.outcome)}</strong>
              <p>{note.body}</p>
            </article>
          ))}
          {recentSessions.map((session) => (
            <article key={session.id}>
              <span>{formatDateTimeLabel(session.updatedAt)}</span>
              <strong>{session.title}</strong>
              <p>{session.itemIds.length} review item(s) captured in session.</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-state">No project review notes or sessions yet.</p>
      )}
    </div>
  )
}
