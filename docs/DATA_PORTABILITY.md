# Atlas Data Portability

Data Center is the local-first backup and restore surface for JAMARQ Atlas.

It exists to protect browser-local Atlas data before hosted persistence is introduced.

## Current Scope

Data Center supports:

- JSON backup download.
- Markdown inventory report download.
- Compact backup summary copy.
- JSON backup import.
- Restore preview.
- Full local restore after typed confirmation.

It does not support:

- Hosted sync.
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
- `schemaVersion: 1`
- `exportedAt`
- `appName`
- `stores.workspace`
- `stores.dispatch`
- `stores.writing`

The backup includes only Atlas-owned stores:

- Workspace: sections, groups, projects, manual fields, repo bindings, and activity events.
- Dispatch: targets, records, readiness, and preflight evidence.
- Writing: drafts, context snapshots, provider result metadata, review status, notes, and Writing-only audit events.

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
5. Require the exact typed confirmation `RESTORE ATLAS`.
6. Replace Workspace, Dispatch, and Writing stores together.

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

## Future Hosted Persistence

Hosted persistence should build on this backup model instead of bypassing it. A future backend should preserve the same store boundaries, schema versioning, validation, restore preview, and source-of-truth rules.
