# Atlas Sync Foundation

Atlas Sync is a manual snapshot foundation for local and optional hosted persistence.

It does not add accounts, background sync, automatic merge behavior, GitHub writes, or automatic project-state changes.

## Current Scope

Sync supports:

- Manual local snapshots.
- Snapshot inventory.
- Snapshot restore preview.
- Full local snapshot restore after typed confirmation.
- Snapshot deletion after explicit confirmation.
- Optional Supabase remote snapshot push.
- Optional Supabase remote snapshot inventory.
- Optional Supabase remote snapshot preview and typed restore.
- Remote/local snapshot comparison by fingerprint, counts, created date, and device label.
- Remote snapshot deletion after explicit confirmation.
- Latest-50 remote snapshot retention notice.

Sync state is stored under `jamarq-atlas.sync.v1`.

## Snapshot Contents

Snapshots include normalized copies of:

- Workspace
- Dispatch
- Writing
- Planning
- Reports
- Review

Snapshots do not include:

- Settings
- Sync state
- GitHub tokens
- AI keys
- Deployment credentials
- Environment variables
- Unknown localStorage keys
- Full live GitHub history

This avoids recursive snapshots and keeps future hosted sync focused on Atlas operational data.

## Restore Behavior

Snapshot restore is preview-first and full-replace for Workspace, Dispatch, Writing, Planning, Reports, and Review only.

Restore requires the exact typed confirmation `RESTORE ATLAS`.

Snapshot restore does not change Settings, Sync provider configuration, or snapshot inventory.

Restore previews warn when:

- Incoming stores are empty.
- Incoming snapshots have fewer projects, Dispatch targets, Writing drafts, Planning records, Report packets, or Review sessions than current local data.
- Incoming fingerprints match current local stores.
- Remote metadata suggests older snapshots may exist outside the latest loaded set.

## Provider Boundary

The hosted provider is optional. When `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ATLAS_SYNC_WORKSPACE_ID` are missing, Atlas reports a scoped not-configured state and local snapshots keep working.

When configured, the Supabase bridge stores remote snapshot rows through local server routes:

- `/api/sync/status`
- `/api/sync/push`
- `/api/sync/remote-snapshots`
- `/api/sync/remote-snapshots/:id`
- `DELETE /api/sync/remote-snapshots/:id`

The service role key stays server-side. Browser state stores only provider status, remote snapshot metadata, and local restore history.

This is not live sync. Push creates a snapshot. Pull lists snapshots. Restore is preview-first and full-replace after typing `RESTORE ATLAS`.

Remote delete removes one snapshot from the hosted snapshot log after explicit confirmation in Settings. It does not delete local snapshots or change Workspace, Dispatch, Writing, Planning, Reports, or Review stores.

## Guardrails

- No automatic sync.
- No merge.
- No GitHub writes.
- No AI provider calls.
- No deployment writes.
- No automatic Atlas status, risk, readiness, verification, binding, or Writing review-state changes.
- No Supabase credentials in browser local storage.
