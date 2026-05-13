# Atlas Settings

Settings is the local configuration and connection-readiness surface for Atlas.

It stores only local identity metadata:

- Device label
- Operator label
- Local-only notes
- Settings schema version
- Last updated timestamp

Settings data is stored in browser local storage under `jamarq-atlas.settings.v1`.

## Connection Cards

Settings currently reports readiness for:

- GitHub local API
- Dispatch health and preflight boundary
- Read-only host boundary
- Writing provider boundary
- Data Center backup/restore
- Supabase hosted sync provider and manual snapshots

Connection cards are read-only status surfaces. They do not trigger GitHub writes, deployments, AI generation, backup restores, hosted sync, or project-state changes.

The Writing card reads `/api/writing/status`. Missing `OPENAI_API_KEY` is shown as a scoped missing state, while local draft packets remain available.

The host boundary card reads `/api/dispatch/host-status`. Missing `ATLAS_HOST_PREFLIGHT_CONFIG` is shown as a scoped missing state. If configured, Atlas can run read-only host reachability and local-mirror path evidence from Dispatch while storing only credential reference labels in browser state.

## Sync Snapshots

Settings also hosts manual Sync snapshot controls.

Snapshots capture normalized Workspace, Dispatch, Writing, Planning, and Reports stores only. They do not include Settings, Sync, GitHub tokens, AI keys, deployment credentials, environment variables, unknown localStorage keys, or live GitHub history.

Current snapshot actions:

- Create a manual local snapshot.
- Preview a snapshot restore.
- Restore Workspace, Dispatch, Writing, Planning, and Reports after typing `RESTORE ATLAS`.
- Delete a local snapshot after explicit confirmation.
- Check hosted sync status.
- Push a manual remote snapshot when Supabase env vars are configured.
- Load remote snapshot metadata.
- Preview and restore a remote snapshot after typing `RESTORE ATLAS`.

Hosted sync is snapshot-based only. It does not run automatically, merge records, resolve conflicts, or change source-of-truth fields.

## Secrets

Settings must not store:

- GitHub tokens
- AI provider keys
- Deployment credentials
- Supabase service role keys
- Environment variables
- Browser secrets

Future provider setup should keep secrets in server-side environment variables or a dedicated secure backend. Browser local storage remains for non-secret Atlas state only.

## Guardrails

- GitHub missing-token states do not break Atlas.
- Missing OpenAI credentials do not block local draft creation.
- Hosted sync remains optional and manual.
- Host boundary checks remain read-only and optional.
- Connection readiness does not change Atlas status, risk, readiness, verification, bindings, or writing review state.
