# Atlas Review Center

Review Center is the operator review surface for Atlas. It pulls together advisory signals from existing stores so a human can decide what deserves attention next.

## Current Scope

Review Center supports:

- Derived daily/weekly review queues.
- Manual review sessions.
- Manual review notes.
- Review outcomes: `noted`, `needs-follow-up`, `no-action`, and `planned`.
- Optional explicit Planning note creation from a review item.
- Project detail review history and quick review notes.

The derived queue is not persisted. Only sessions and notes are stored under `jamarq-atlas.review.v1`.

## Queue Inputs

Review queue items may come from:

- Verification due and overdue projects.
- Dispatch queue warnings, closeout posture, host evidence, verification evidence, and session state.
- Workspace blockers, Waiting status, current risk, and stale `lastVerified` dates.
- Unbound GitHub repositories and deterministic placement suggestions.
- Recent Timeline evidence with warning or danger posture.
- Planning milestones and work sessions due soon.
- Writing drafts needing review, approval, export, or follow-up.
- Reports awaiting review/export or deployment packet follow-up.
- Data and Sync snapshot/backup age attention states.

Each queue item includes source, severity, due state, project or repository context when available, and plain-language reasons.

## Stored Data

Review state stores:

- Review sessions with scope, cadence, selected item IDs, outcome, notes, and timestamps.
- Review notes with optional project ID, source, outcome, note body, and timestamp.

Review state does not store GitHub tokens, host credentials, AI keys, raw server files, deployment artifacts, or full GitHub history.

## Planning Handoff

Review can create a Planning note only when the operator explicitly chooses that action. The Planning note is stored through the Planning service, and the original Review note/session remains review-only context.

Creating a Planning note from Review does not change project status, risk, next action, verification, Dispatch readiness, Writing state, Reports, GitHub bindings, Settings, or Sync.

## Relationship To Other Modules

- Verification says whether a project is due for a manual verification look.
- Timeline shows evidence in chronological order.
- Dispatch closeout summarizes deployment evidence posture.
- Planning stores human-authored objectives, milestones, work sessions, and notes.
- Reports assemble human-reviewed packets.
- Review Center is the cross-module review queue and note-taking layer.

Review Center may explain why an item appears, but it never decides what should be done.

## Backup And Sync

Data Center schema v4 includes Review state in JSON backups and Markdown inventory reports. Older v1/v2/v3 backups normalize missing Review state to an empty store during preview.

Sync snapshots include Workspace, Dispatch, Writing, Planning, Reports, and Review stores only. They continue to exclude Settings, Sync metadata, credentials, unknown localStorage keys, and full live GitHub history.

## Guardrails

Review Center must not:

- Change Atlas project status.
- Change risk, blockers, next action, roadmap, or verification.
- Change Dispatch readiness, target status, deployment records, or closeout state.
- Bind or import GitHub repositories automatically.
- Change Writing draft status or Report packet status.
- Trigger Sync, restore, AI generation, deployment, host writes, notifications, or external publishing.

Review Center may:

- Surface derived review candidates.
- Store manual sessions and notes.
- Create a Planning note after explicit human action.
- Provide context for Timeline, Data Center, Sync snapshots, and Reports.
