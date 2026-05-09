import type { WritingProviderResult } from '../domain/writing'

export function getStubWritingProviderResult(): WritingProviderResult {
  return {
    status: 'stub',
    generatedText: null,
    message:
      'Writing provider is not configured. Atlas generated a local template draft and prompt packet only.',
  }
}

export async function requestWritingProviderDraft(): Promise<WritingProviderResult> {
  return {
    status: 'not-configured',
    generatedText: null,
    message:
      'No AI provider request was made. Future providers must return suggestions for human review only.',
  }
}
