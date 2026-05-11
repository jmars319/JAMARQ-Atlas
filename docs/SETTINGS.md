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
- Writing provider boundary
- Data Center backup/restore
- Sync provider and manual local snapshots

Connection cards are read-only status surfaces. They do not trigger GitHub writes, deployments, AI provider calls, backup restores, hosted sync, or project-state changes.

## Sync Snapshots

Settings also hosts manual Sync snapshot controls.

Snapshots capture normalized Workspace, Dispatch, and Writing stores only. They do not include Settings, Sync, GitHub tokens, AI keys, deployment credentials, environment variables, unknown localStorage keys, or live GitHub history.

Current snapshot actions:

- Create a manual local snapshot.
- Preview a snapshot restore.
- Restore Workspace, Dispatch, and Writing after typing `RESTORE ATLAS`.
- Delete a local snapshot after explicit confirmation.

Hosted push/pull remains a stubbed provider boundary. No external sync read or write occurs in this phase.

## Secrets

Settings must not store:

- GitHub tokens
- AI provider keys
- Deployment credentials
- Environment variables
- Browser secrets

Future provider setup should keep secrets in server-side environment variables or a dedicated secure backend. Browser local storage remains for non-secret Atlas state only.

## Guardrails

- GitHub missing-token states do not break Atlas.
- Stubbed Writing status does not block local draft creation.
- Sync remains local-only until a future hosted persistence phase.
- Connection readiness does not change Atlas status, risk, readiness, verification, bindings, or writing review state.
