# Atlas Supabase Hosted Sync

Supabase Hosted Sync is an optional manual snapshot bridge for Atlas. It makes local Atlas data durable beyond one browser without adding accounts, background sync, merge behavior, or external writes beyond explicit snapshot push.

## Scope

The bridge supports:

- Hosted sync status checks.
- Manual push of the current Workspace, Dispatch, and Writing stores.
- Remote snapshot metadata listing.
- Remote snapshot preview.
- Full local restore after typing `RESTORE ATLAS`.

The bridge does not support:

- Automatic background sync.
- Merge or conflict resolution.
- GitHub writes.
- AI provider calls.
- Deployment writes.
- Status, risk, readiness, verification, binding, or Writing review-state changes.

## Environment

Configure these values in `.env` or `.env.local` when hosted snapshots are needed:

```sh
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ATLAS_SYNC_WORKSPACE_ID=
```

The Supabase service role key is server-side only. It is read by the Vite middleware and must not be committed, bundled into browser code, or stored in local storage.

Atlas runs normally when these values are missing. Settings reports a scoped not-configured state and local snapshots remain available.

## API Routes

Hosted sync uses the local server boundary:

- `GET /api/sync/status`
- `POST /api/sync/push`
- `GET /api/sync/remote-snapshots`
- `GET /api/sync/remote-snapshots/:id`

Push requests send a normalized Atlas snapshot containing only Workspace, Dispatch, and Writing stores. Pull requests return snapshot metadata or one selected snapshot for preview.

## Required Table

Create this table in Supabase:

```sql
create table if not exists public.atlas_sync_snapshots (
  workspace_id text not null,
  snapshot_id text not null,
  device_id text not null,
  device_label text not null,
  label text not null,
  note text not null default '',
  fingerprint text not null,
  summary jsonb not null,
  stores jsonb not null,
  created_at timestamptz not null,
  primary key (workspace_id, snapshot_id)
);

create index if not exists atlas_sync_snapshots_workspace_created_at_idx
  on public.atlas_sync_snapshots (workspace_id, created_at desc);
```

The local middleware uses the service role key, so row-level policies are not required for this single-operator bridge. If this becomes multi-user later, replace service-role access with authenticated user-scoped policies before exposing any hosted write path.

## Stored Data

Remote snapshots store:

- Workspace sections, groups, projects, manual fields, repo bindings, and activity events.
- Dispatch targets, records, readiness entries, and preflight runs.
- Writing drafts, context snapshots, review state, and Writing-only audit events.
- Snapshot metadata, summary counts, device label, fingerprint, and timestamps.

Remote snapshots do not store:

- GitHub tokens.
- Supabase keys.
- AI keys.
- Deployment credentials.
- Environment variables.
- Browser secrets.
- Unknown local storage keys.
- Full live GitHub history.
- Settings or Sync stores.

## Restore

Remote restore is preview-first and full-replace. Atlas loads one remote snapshot, normalizes it through existing Workspace, Dispatch, and Writing normalizers, shows count differences, and requires the exact typed confirmation `RESTORE ATLAS`.

Restore does not merge records, update Settings, change Sync provider configuration, or make operational decisions.
