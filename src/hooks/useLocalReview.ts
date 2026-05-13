import { useEffect, useState } from 'react'
import type { ReviewNote, ReviewSession, ReviewState } from '../domain/review'
import {
  addReviewNote,
  addReviewSession,
  emptyReviewStore,
  normalizeReviewState,
} from '../services/review'

const STORAGE_KEY = 'jamarq-atlas.review.v1'

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
    resetReview,
  }
}
