# Atlas Data Portability

Data Center is the local-first backup and restore surface for JAMARQ Atlas.

It exists to protect browser-local Atlas data before hosted persistence is introduced.

## Current Scope

Data Center supports:

- JSON backup download.
- Markdown inventory report download.
- Compact backup summary copy.
- Local store diagnostics with schema versions, counts, repair hints, and reset cautions.
- JSON backup import.
- Restore preview with current vs incoming counts and count-diff rows.
- Full local restore after typed confirmation.
- Backup schema v1/v2/v3/v4/v5 import compatibility.

It does not support:

- Hosted sync upload/download from Data Center.
- User accounts.
- GitHub writes.
- Automatic commits.
- External storage uploads.
- Secret or credential backup.
- Record merging.

## Backup Format

Atlas backups are versioned JSON envelopes.

Required fields:

- `kind: "jamarq-atlas-backup"`
- `schemaVersion: 5`
- `exportedAt`
- `appName`
- `stores.workspace`
- `stores.dispatch`
- `stores.writing`
- `stores.planning`
- `stores.reports`
- `stores.review`
- `stores.calibration`
- `stores.settings`
- `stores.sync`

The backup includes only Atlas-owned stores:

- Workspace: sections, groups, projects, manual fields, repo bindings, and activity events.
- Dispatch: targets, records, readiness, preflight evidence, host evidence, verification evidence, runbooks, and deploy sessions.
- Writing: drafts, context snapshots, provider result metadata, review status, notes, and Writing-only audit events.
- Planning: objectives, milestones, work sessions, and planning notes.
- Reports: report packets, source summaries, context warnings, Markdown, and report-only audit events.
- Review: human review sessions, notes, outcomes, and timestamps.
- Calibration: field progress, non-secret credential references, and calibration audit events.
- Settings: local device/operator labels and local-only notes.
- Sync: local snapshot metadata and manual snapshots.

Schema v1/v2/v3/v4 backups that contain only earlier store sets remain importable. Atlas normalizes missing Planning, Reports, Review, Calibration, Settings, and Sync stores to safe local defaults during restore preview.

## Store Diagnostics

Data Center shows local diagnostics before restore:

- Store schema version or normalization boundary.
- Current record counts.
- Warnings for empty or incomplete stores.
- Provider error and missing-label notes when available.
- Repair hints that keep Reset seed separate from backup/restore.

Diagnostics are informational. They do not repair, reset, migrate, merge, or mutate Atlas state by themselves.

## Excluded Data

Backups intentionally exclude:

- GitHub tokens.
- Environment variables.
- Browser secrets.
- Unknown local storage keys.
- Build output.
- Dependency caches.
- Live GitHub history beyond saved repo bindings and captured Writing context snapshots.

## Restore Behavior

Restore is preview-first and full-replace.

The import flow:

1. Read a local JSON file.
2. Validate the backup envelope.
3. Normalize compatible older store shapes.
4. Show current local counts beside incoming backup counts.
5. Show count diffs for projects, repo bindings, Dispatch evidence, Writing drafts, Planning records, Reports, Review sessions, Calibration progress, credential references, and Sync snapshots.
6. Require the exact typed confirmation `RESTORE ATLAS`.
7. Replace Workspace, Dispatch, Writing, Planning, Reports, Review, Calibration, Settings, and Sync stores together.

Restore does not merge records. Reset seed remains a separate action.

## Guardrails

Data Center must not:

- Change Atlas status by itself.
- Decide priority, risk, roadmap, readiness, verification, or what ships.
- Write to GitHub.
- Store credentials.
- Upload backups to external services.
- Treat export as proof that anything was sent, deployed, published, shipped, or verified.

Data Center may:

- Create a local restorable JSON file.
- Create a local Markdown inventory report.
- Validate and preview a backup.
- Replace local Atlas stores after explicit typed human confirmation.

## Hosted Persistence Relationship

Supabase hosted sync lives in Settings, not Data Center. It uses the same normalized Workspace, Dispatch, Writing, Planning, Reports, Review, and Calibration store boundaries and keeps restore preview plus typed confirmation. Data Center remains the browser-local JSON/Markdown portability surface.

Future hosted persistence should keep these store boundaries, schema versioning, validation, restore preview, and source-of-truth rules.
