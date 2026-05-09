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

The generated draft text is a local template scaffold. It is clearly marked as not AI generated.

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

`src/services/writingProvider.ts` is a no-op future provider boundary.

Current behavior:

- No OpenAI key is required.
- No external AI request is made.
- Provider results return structured `stub` or `not-configured` states.
- Prompt packets are prepared for a future provider but remain local review artifacts.
- Copy/export workflows use existing local draft text only.

Future provider implementations must return suggestions for human review only.

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
