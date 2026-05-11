# AI Writing Workbench

Writing Workbench turns Atlas context into reviewable local draft packets. It is an assistance layer, not a decision layer.

## Current Scope

Writing currently supports four templates:

- Client update
- Release notes
- Weekly change summary
- Codex handoff

Each draft includes:

- Editable draft text.
- Prompt packet.
- Context snapshot.
- Draft review status.
- Draft notes.
- Writing-only review audit events.
- Created and updated timestamps.
- Optional provider suggestion text and metadata.

The generated draft text is a local template scaffold. It is clearly marked as not AI generated.

When `OPENAI_API_KEY` is configured, Writing can request a draft-only OpenAI suggestion. The suggestion is stored separately on the draft and does not overwrite editable draft text until a human explicitly chooses `Apply suggestion to draft`.

## Storage Boundary

Writing state is separate from Atlas workspace and Dispatch state.

- Workspace storage key: `jamarq-atlas.workspace.v1`
- Dispatch storage key: `jamarq-atlas.dispatch.v1`
- Writing storage key: `jamarq-atlas.writing.v1`

Drafts reference Atlas projects by `projectId`. Creating, editing, reviewing, or archiving a draft does not mutate project manual state.

## Review Lifecycle

Draft statuses:

- Draft
- Reviewed
- Approved
- Exported
- Archived

Review events are stored on the draft in Writing storage only.

Supported audit event types:

- Created
- Reviewed
- Approved
- Copied
- Prompt copied
- Provider suggestion
- Suggestion applied
- Markdown exported
- Archived

These events do not append Atlas project activity and do not imply that anything was sent, published, deployed, shipped, or verified.

## Context Rules

Draft packets may include:

- Human-authored operational fields.
- Atlas activity events.
- Verification cadence and due state.
- Dispatch target and readiness posture.
- Optional GitHub repository overview and recent commit snippets.

GitHub context is optional. Missing tokens, insufficient permissions, private repositories, and API errors are stored as draft context warnings. These states do not break the Writing Workbench or any other Atlas surface.

Writing storage does not mirror full GitHub history. Only the selected draft's short context snapshot is stored.

## Copy and Export

Writing supports local export actions:

- Copy draft text.
- Copy prompt packet.
- Download Markdown packet.

Markdown packets include:

- Editable draft text.
- Project and template metadata.
- Review/export status.
- Context warnings.
- Captured source context summary.
- Guardrails.
- Review audit.
- Optional prompt packet appendix.

Markdown download is local/browser-only. Atlas does not send email, publish documents, post to external services, deploy code, or mark verification complete.

## Provider Boundary

`src/services/writingProvider.ts` calls the local Writing provider boundary. `server/writingApi.ts` reads OpenAI credentials server-side and uses the Responses API for draft-only suggestions.

Current behavior:

- No OpenAI key is required for local draft packets.
- Missing `OPENAI_API_KEY` returns a scoped `not-configured` state.
- Configured OpenAI requests are made only through `/api/writing/generate`.
- Provider output is stored as a suggestion, not as the draft body.
- Applying a suggestion is explicit and audited.

Environment:

```sh
OPENAI_API_KEY=
OPENAI_MODEL=gpt-5
```

OpenAI keys stay out of browser local storage and bundled client code.

## Guardrails

Writing must not:

- Decide or change Atlas status.
- Decide or change priority, risk, roadmap, blockers, or next action.
- Mark verification complete.
- Change Dispatch readiness.
- Change GitHub bindings.
- Decide what should be deployed or shipped.

Writing may:

- Draft client-facing updates.
- Draft release notes.
- Summarize weekly changes.
- Rewrite notes into cleaner operational language.
- Generate Codex handoff summaries.

All Writing output remains draft text until a human reviews and edits it.
