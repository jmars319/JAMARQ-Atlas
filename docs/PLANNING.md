# Atlas Planning Center

Planning Center is the manual planning layer for JAMARQ Atlas. It tracks lightweight objectives, milestones, work sessions, and planning notes linked to Atlas projects.

## What It Stores

Planning data is local-first under `jamarq-atlas.planning.v1`.

Planning records include:

- Project ID, with optional section and group references.
- Planning kind: objective, milestone, work session, or note.
- Manual planning status: idea, planned, active, waiting, done, or deferred.
- Human-authored title and detail.
- Optional target, due, scheduled, or completed dates.
- Optional source links back to Review notes, Dispatch sessions, Report packets, or Timeline events that a human explicitly used as context.
- Created and updated timestamps.

## Source Of Truth

Planning records are human-authored. They do not update:

- Atlas project status.
- Risk, blockers, next action, or roadmap fields.
- Verification cadence or `lastVerified`.
- Dispatch readiness or deployment status.
- GitHub bindings or imported projects.
- Writing draft status or provider suggestions.

GitHub, Dispatch, Verification, and Writing can provide context elsewhere in Atlas, but they cannot create or change Planning records automatically.

## Current UI

The top-level Planning tab provides:

- A create form for planning records.
- Filters by section, kind, planning status, and search text.
- Editable cards for title, status, dates, and detail.
- Counts for objectives, milestones, work sessions, and notes.

Project detail pages include a compact Planning panel with per-project counts and the most recent planning records.

Planning cards show source-link labels when a record was created from Review or another operator surface. These links are context only; they do not synchronize state back to the source module.

## Future Work

Likely next improvements:

- Planning templates for recurring client/site work.
- Optional relationship links between milestones, Writing drafts, and Report packets.
- Better rollups by section and project group.

Any future automation must stay advisory. Planning remains a human decision surface.
