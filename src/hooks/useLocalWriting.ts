import type { WritingDraft, WritingWorkbenchState } from '../domain/writing'
import { emptyWritingState } from '../domain/writing'
import {
  applyWritingProviderSuggestion,
  approveWritingDraft,
  archiveWritingDraft,
  markWritingDraftReviewed,
  markWritingDraftExported,
  normalizeWritingState,
  recordWritingProviderSuggestion,
  recordWritingDraftCopied,
  updateWritingDraftNotes,
  updateWritingDraftText,
} from '../services/aiWritingAssistant'
import type { WritingProviderResult } from '../domain/writing'
import { useLocalStoreState } from './useLocalStore'

function emptyWritingStore() {
  return { ...emptyWritingState }
}

export function useLocalWriting() {
  const {
    state: writing,
    setState: setWriting,
    resetState: resetWriting,
  } = useLocalStoreState<WritingWorkbenchState>({
    storeId: 'writing',
    fallback: emptyWritingStore,
    normalize: normalizeWritingState,
  })

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

  function recordProviderSuggestion(draftId: string, providerResult: WritingProviderResult) {
    setWriting((current) => ({
      ...current,
      drafts: recordWritingProviderSuggestion(current.drafts, draftId, providerResult),
    }))
  }

  function applyProviderSuggestion(draftId: string) {
    setWriting((current) => ({
      ...current,
      drafts: applyWritingProviderSuggestion(current.drafts, draftId),
    }))
  }

  function markReviewed(draftId: string) {
    setWriting((current) => ({
      ...current,
      drafts: markWritingDraftReviewed(current.drafts, draftId),
    }))
  }

  function approveDraft(draftId: string) {
    setWriting((current) => ({
      ...current,
      drafts: approveWritingDraft(current.drafts, draftId),
    }))
  }

  function recordCopied(draftId: string, type: 'copied' | 'prompt-copied') {
    setWriting((current) => ({
      ...current,
      drafts: recordWritingDraftCopied(current.drafts, draftId, type),
    }))
  }

  function markExported(draftId: string) {
    setWriting((current) => ({
      ...current,
      drafts: markWritingDraftExported(current.drafts, draftId),
    }))
  }

  function archiveDraft(draftId: string) {
    setWriting((current) => ({
      ...current,
      drafts: archiveWritingDraft(current.drafts, draftId),
    }))
  }

  return {
    writing,
    setWriting,
    addDraft,
    updateDraftText,
    updateDraftNotes,
    recordProviderSuggestion,
    applyProviderSuggestion,
    markReviewed,
    approveDraft,
    recordCopied,
    markExported,
    archiveDraft,
    resetWriting,
  }
}
