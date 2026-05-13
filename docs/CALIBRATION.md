# Atlas Calibration

Calibration is a Settings surface for replacing placeholder operational values with real, non-secret context.

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

## Secret Rule

Atlas must not store credentials in browser state. Calibration rejects credential-shaped values such as passwords, tokens, API keys, private keys, and secrets.

If a credential needs to be referenced operationally, use a non-secret label such as `godaddy-mmh-production` in notes or future credential-reference fields.

Host Inspector credentials must remain server-side. Calibration may flag that a target needs a matching `ATLAS_HOST_PREFLIGHT_CONFIG` entry, but it does not store SFTP passwords, private key paths, passphrases, or raw environment variables.

## Guardrails

Calibration is not verification and not deployment automation. It may identify unresolved placeholders, but a human must still confirm hosts, paths, backups, rollback posture, and deployment order.
