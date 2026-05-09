import { useEffect, useState } from 'react'
import type { WritingDraft, WritingWorkbenchState } from '../domain/writing'
import { emptyWritingState } from '../domain/writing'
import {
  archiveWritingDraft,
  markWritingDraftReviewed,
  updateWritingDraftNotes,
  updateWritingDraftText,
} from '../services/aiWritingAssistant'

const STORAGE_KEY = 'jamarq-atlas.writing.v1'

function normalizeWritingState(value: unknown): WritingWorkbenchState {
  const candidate = typeof value === 'object' && value !== null ? value as WritingWorkbenchState : null

  if (!candidate || !Array.isArray(candidate.drafts)) {
    return { ...emptyWritingState }
  }

  return {
    drafts: candidate.drafts.filter((draft) => draft && typeof draft.id === 'string'),
  }
}

function readWriting(): WritingWorkbenchState {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)

    if (!stored) {
      return { ...emptyWritingState }
    }

    return normalizeWritingState(JSON.parse(stored))
  } catch {
    return { ...emptyWritingState }
  }
}

export function useLocalWriting() {
  const [writing, setWriting] = useState<WritingWorkbenchState>(() => readWriting())

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(writing))
  }, [writing])

  function addDraft(draft: WritingDraft) {
    setWriting((current) => ({
      ...current,
      drafts: [draft, ...current.drafts.filter((candidate) => candidate.id !== draft.id)],
    }))
  }

  function updateDraftText(draftId: string, draftText: string) {
    setWriting((current) => ({
      ...current,
      drafts: updateWritingDraftText(current.drafts, draftId, draftText),
    }))
  }

  function updateDraftNotes(draftId: string, notes: string) {
    setWriting((current) => ({
      ...current,
      drafts: updateWritingDraftNotes(current.drafts, draftId, notes),
    }))
  }

  function markReviewed(draftId: string) {
    setWriting((current) => ({
      ...current,
      drafts: markWritingDraftReviewed(current.drafts, draftId),
    }))
  }

  function archiveDraft(draftId: string) {
    setWriting((current) => ({
      ...current,
      drafts: archiveWritingDraft(current.drafts, draftId),
    }))
  }

  function resetWriting() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyWritingState))
    setWriting({ ...emptyWritingState })
  }

  return {
    writing,
    setWriting,
    addDraft,
    updateDraftText,
    updateDraftNotes,
    markReviewed,
    archiveDraft,
    resetWriting,
  }
}
