# Atlas Calibration

Calibration Operations is a Settings surface for replacing placeholder operational values with real, non-secret context while tracking progress and audit history.

Calibration has its own browser-local store under `jamarq-atlas.calibration.v1`. It is separate from Settings and Dispatch so calibration progress remains human-authored metadata, not operational truth.

## What It Scans

- Dispatch target hosts, users, paths, public URLs, database names, and health URLs.
- Credential reference labels such as `godaddy-mmh-production`.
- Backup notes and rollback references.
- Future automation rollback requirements.
- Client Systems projects that still need Dispatch targets.
- Projects with no GitHub repository binding.
- Projects missing a manual `lastVerified` date.
- Dispatch targets that have real host/path metadata but no matching server-side Host Inspector config entry.
- Connection-readiness status for GitHub, Supabase, OpenAI Writing, and Host Inspector boundaries.

## What It Can Edit

Calibration can edit selected Dispatch target fields:

- Remote host.
- Remote user.
- Remote frontend/backend paths.
- Public URL.
- Health check URLs.
- Non-secret database name.
- Credential reference label.

Those edits update Dispatch target storage only. They do not change Atlas project status, Dispatch readiness, deployment records, verification stamps, GitHub bindings, Planning, Writing, or Reports.

The Settings UI also supports a guarded bulk edit for visible editable Dispatch calibration rows. The bulk editor only accepts known non-secret target fields and still rejects credential-shaped values.

## Progress And Audit

Each calibration row can be marked:

- `needs-value`
- `entered`
- `verified`
- `deferred`

Rows also support local notes. These marks mean only that a human has tracked calibration progress inside Atlas; they do not prove production access, host reachability, deployment readiness, or verification.

Calibration stores audit events for:

- Field progress changes.
- Field edits.
- Bulk edits.
- Credential-reference changes.
- Import applies.

Audit events are shown in Settings and derived into Timeline. They do not update Workspace status, Dispatch readiness, Verification, Planning, Reports, Writing, GitHub bindings, Settings, or Sync automatically.

## Credential Reference Registry

Calibration includes a non-secret credential reference registry. Allowed examples:

- `godaddy-mmh-production`
- `godaddy-mms-production`
- `cpanel-surplus-production`

Registry records store only:

- Label
- Provider
- Purpose
- Related project IDs
- Related target IDs
- Non-secret notes
- Timestamps

Atlas rejects secret-shaped labels and notes. It must not store passwords, tokens, API keys, private keys, passphrases, raw environment variable names, or credential values. Dispatch targets can select a registered label or manually use a non-secret label; targets with real labels that are not in the registry are flagged for calibration.

## Import And Export

Calibration can export local CSV and JSON templates for:

- Dispatch target fields.
- Repository bindings.
- Credential references.

Import is preview-first. Atlas shows accepted rows, rejected rows, warnings, and before/after changes. Applying an import is an explicit button click; there is no automatic merge.

Supported import row kinds:

- `dispatch-target`
- `repo-binding`
- `credential-reference`

Accepted dispatch-target rows can update non-secret host, user label, frontend/backend path, public URL, health URL, database name, and credential reference fields. Repo-binding rows attach repositories to projects. Credential-reference rows save registry labels.

Secret-shaped values are rejected during preview and are not applied, backed up, synced, or stored.

## Data Quality Rules

Calibration warns on:

- Public and health URLs without `http` or `https`.
- Unparseable repository names or GitHub URLs.
- cPanel backend paths that do not contain `/api`.
- Placeholder domains or values.
- Missing protocols.
- Parent traversal markers such as `..`.
- Database names that look like credential assignments.

Warnings are advisory except secret-shaped values, which block storage.

## Secret Rule

Atlas must not store credentials in browser state. Calibration rejects credential-shaped values such as passwords, tokens, API keys, private keys, and secrets.

If a credential needs to be referenced operationally, use a non-secret label such as `godaddy-mmh-production` in the credential reference registry.

Host Inspector credentials must remain server-side. Calibration may flag that a target needs a matching `ATLAS_HOST_PREFLIGHT_CONFIG` entry, but it does not store SFTP passwords, private key paths, passphrases, or raw environment variables.

## Guardrails

Calibration is not verification and not deployment automation. It may identify unresolved placeholders, but a human must still confirm hosts, paths, backups, rollback posture, and deployment order.

Calibration is included in Data Center backups and Sync snapshots. Settings and Sync metadata remain excluded from Sync snapshots, and credentials remain excluded everywhere.
