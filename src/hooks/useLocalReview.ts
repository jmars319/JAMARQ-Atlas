import type { ReviewNote, ReviewSavedFilter, ReviewSession, ReviewState } from '../domain/review'
import {
  addReviewNote,
  addReviewSession,
  deleteReviewFilter,
  emptyReviewStore,
  normalizeReviewState,
  saveReviewFilter,
} from '../services/review'
import { useLocalStoreState } from './useLocalStore'

export function useLocalReview() {
  const {
    state: review,
    setState: setReview,
    resetState: resetReview,
  } = useLocalStoreState<ReviewState>({
    storeId: 'review',
    fallback: emptyReviewStore,
    normalize: normalizeReviewState,
  })

  function addSession(session: ReviewSession) {
    setReview((current) => addReviewSession(current, session))
  }

  function addNote(note: ReviewNote) {
    setReview((current) => addReviewNote(current, note))
  }

  function saveFilter(filter: ReviewSavedFilter) {
    setReview((current) => saveReviewFilter(current, filter))
  }

  function deleteFilter(filterId: string) {
    setReview((current) => deleteReviewFilter(current, filterId))
  }

  return {
    review,
    setReview,
    addSession,
    addNote,
    saveFilter,
    deleteFilter,
    resetReview,
  }
}
