# Atlas Timeline

Timeline is the derived evidence ledger for Atlas.

It combines existing Atlas stores into one read-only view so an operator can see what has happened across the system without creating a new source of truth.

## Current Scope

Timeline derives evidence from:

- Workspace activity events.
- Manual verification activity events.
- Dispatch deployment records.
- Dispatch preflight runs.
- Writing review/audit events.
- Planning objectives, milestones, work sessions, and notes.
- Report packet audit events.
- Local Sync snapshots.
- Loaded remote Sync snapshot metadata.
- Hosted Sync push/pull timestamps.
- GitHub activity already present in Atlas activity records.

Timeline does not persist its own events in this phase. It does not store full GitHub history, mirror remote activity, or create a separate audit database.

## Filters

The Timeline view supports filtering by:

- Project.
- Section.
- Source.
- Event type.
- Date range.
- Search text.

Project detail pages show a compact derived timeline for the selected project.

## Guardrails

Timeline is advisory only. It must not:

- Change Atlas project status.
- Change priority, risk, roadmap, blockers, or next action.
- Mark verification complete.
- Change Dispatch readiness or deployment status.
- Change GitHub bindings.
- Change Writing review state.
- Trigger sync, restore, deploy, AI generation, or external writes.

Timeline may reveal evidence that a human chooses to act on manually.
