import { useEffect, useState } from 'react'
import type { ReviewNote, ReviewSavedFilter, ReviewSession, ReviewState } from '../domain/review'
import { ATLAS_STORE_DEFINITIONS_BY_ID } from '../domain/storeRegistry'
import {
  addReviewNote,
  addReviewSession,
  deleteReviewFilter,
  emptyReviewStore,
  normalizeReviewState,
  saveReviewFilter,
} from '../services/review'

const STORAGE_KEY = ATLAS_STORE_DEFINITIONS_BY_ID.review.localStorageKey

function readReview(): ReviewState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)

    if (!stored) {
      return emptyReviewStore()
    }

    return normalizeReviewState(JSON.parse(stored))
  } catch {
    return emptyReviewStore()
  }
}

export function useLocalReview() {
  const [review, setReview] = useState<ReviewState>(() => readReview())

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(review))
  }, [review])

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

  function resetReview() {
    const freshReview = emptyReviewStore()
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(freshReview))
    setReview(freshReview)
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
