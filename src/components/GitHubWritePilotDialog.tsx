import { AlertTriangle, CheckCircle2, Lock, Send, X } from 'lucide-react'
import type { FormEvent } from 'react'
import { useEffect, useMemo, useState } from 'react'
import type {
  GithubWritePilotCapability,
  GithubWritePilotDraft,
  GithubWritePilotResult,
} from '../services/githubWritePilot'
import {
  fetchGithubWritePilotCapability,
  githubWritePilotConfirmationPhrase,
  submitGithubWritePilotDraft,
  validateGithubWritePilotDraft,
} from '../services/githubWritePilot'

interface GitHubWritePilotDialogProps {
  draft: GithubWritePilotDraft | null
  onClose: () => void
  onSuccess: (result: GithubWritePilotResult, draft: GithubWritePilotDraft) => void
}

export function GitHubWritePilotDialog({
  draft,
  onClose,
  onSuccess,
}: GitHubWritePilotDialogProps) {
  if (!draft) {
    return null
  }

  return (
    <GitHubWritePilotDialogContent
      key={`${draft.kind}-${draft.owner}/${draft.repo}-${draft.issueNumber ?? 'new'}-${draft.sourceIntentId ?? draft.sourceDetailId ?? 'manual'}`}
      draft={draft}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  )
}

function GitHubWritePilotDialogContent({
  draft,
  onClose,
  onSuccess,
}: {
  draft: GithubWritePilotDraft
  onClose: () => void
  onSuccess: (result: GithubWritePilotResult, draft: GithubWritePilotDraft) => void
}) {
  const [title, setTitle] = useState(() => draft.title)
  const [body, setBody] = useState(() => draft.body)
  const [confirmation, setConfirmation] = useState('')
  const [capability, setCapability] = useState<GithubWritePilotCapability | null>(null)
  const [capabilityError, setCapabilityError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<GithubWritePilotResult | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    void fetchGithubWritePilotCapability(draft.owner, draft.repo, controller.signal)
      .then(setCapability)
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setCapabilityError(
            error instanceof Error ? error.message : 'Unable to load GitHub write capability.',
          )
        }
      })

    return () => controller.abort()
  }, [draft])

  const workingDraft = useMemo<GithubWritePilotDraft>(
    () => ({ ...draft, title, body }),
    [body, draft, title],
  )
  const expectedConfirmation = githubWritePilotConfirmationPhrase(workingDraft)
  const validationErrors = validateGithubWritePilotDraft(workingDraft)
  const confirmationMatches = confirmation === expectedConfirmation
  const canSubmit =
    !result &&
    !submitting &&
    Boolean(capability?.issueCommentPilotEnabled) &&
    validationErrors.length === 0 &&
    confirmationMatches

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canSubmit) {
      return
    }

    setSubmitting(true)
    setSubmitError('')

    try {
      const response = await submitGithubWritePilotDraft(workingDraft, confirmation)
      setResult(response)
      onSuccess(response, workingDraft)
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'GitHub write pilot failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="github-write-dialog-backdrop" role="presentation">
      <section
        className="github-write-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-write-dialog-title"
      >
        <div className="resource-panel-header">
          <div>
            <strong id="github-write-dialog-title">
              {draft.kind === 'create-issue' ? 'Draft GitHub Issue' : 'Draft GitHub Comment'}
            </strong>
            <span>{draft.owner}/{draft.repo}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close GitHub write pilot">
            <X size={15} />
            Close
          </button>
        </div>

        <div className="github-write-lock">
          <Lock size={16} />
          <div>
            <strong>Issue/comment pilot only</strong>
            <span>
              Broad writeControlsEnabled remains false. Atlas will not edit labels, assignees,
              issues, PRs, workflows, commits, branches, local Git, or deployments.
            </span>
          </div>
        </div>

        {capability?.blockers.length ? (
          <div className="github-error">
            <AlertTriangle size={16} />
            <div>
              <strong>Write pilot unavailable</strong>
              <span>{capability.blockers.join(' ')}</span>
            </div>
          </div>
        ) : null}

        {capabilityError ? (
          <div className="github-error">
            <AlertTriangle size={16} />
            <div>
              <strong>Capability check failed</strong>
              <span>{capabilityError}</span>
            </div>
          </div>
        ) : null}

        {submitError ? (
          <div className="github-error">
            <AlertTriangle size={16} />
            <div>
              <strong>GitHub write failed</strong>
              <span>{submitError}</span>
            </div>
          </div>
        ) : null}

        {result ? (
          <div className="github-write-success">
            <CheckCircle2 size={16} />
            <div>
              <strong>{result.message}</strong>
              <a href={result.htmlUrl} target="_blank" rel="noreferrer">
                {result.htmlUrl}
              </a>
            </div>
          </div>
        ) : null}

        <form className="github-write-form" onSubmit={handleSubmit}>
          {draft.kind === 'create-issue' ? (
            <label>
              <span>Issue title</span>
              <input
                value={title}
                maxLength={256}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
          ) : (
            <div className="github-write-target">
              <span>Target</span>
              <strong>{draft.owner}/{draft.repo}#{draft.issueNumber}</strong>
            </div>
          )}

          <label>
            <span>{draft.kind === 'create-issue' ? 'Issue body' : 'Comment body'}</span>
            <textarea
              value={body}
              rows={12}
              maxLength={6000}
              onChange={(event) => setBody(event.target.value)}
            />
          </label>

          <div className="resource-meta">
            <span>{body.length}/6000 body characters</span>
            <span>{capability?.authMode ?? 'checking'} auth</span>
            <span>writeControlsEnabled: false</span>
          </div>

          {validationErrors.length > 0 ? (
            <ul className="github-write-errors">
              {validationErrors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}

          <label>
            <span>Confirmation phrase</span>
            <input
              value={confirmation}
              placeholder={expectedConfirmation}
              onChange={(event) => setConfirmation(event.target.value)}
            />
          </label>

          <div className="github-write-confirmation">
            <span>Required</span>
            <strong>{expectedConfirmation}</strong>
          </div>

          <div className="github-write-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="primary-action" disabled={!canSubmit}>
              <Send size={15} />
              {submitting ? 'Sending' : draft.kind === 'create-issue' ? 'Create issue' : 'Post comment'}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
