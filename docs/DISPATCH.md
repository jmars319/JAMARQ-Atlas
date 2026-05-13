# Atlas Dispatch

Dispatch tracks deployment readiness, deployment history, target environments, health check posture, rollback posture, and backup requirements for projects managed inside Atlas.

Atlas maps work. Dispatch tracks whether a project can be safely shipped. Humans decide what ships.

## Current Scope

Dispatch currently supports:

- Deployment targets
- Deployment records
- Environment and host metadata
- Public URLs and health check URLs
- cPanel deploy runbooks
- Dispatch Queue Command Center
- Guided manual deploy sessions
- Expected deploy artifacts
- Preserve/create-on-server path checklists
- Read-only preflight evidence history
- Read-only host boundary status checks
- Read-only host evidence archive
- Runbook verification evidence archive
- Automation readiness runbook notes and checklist posture
- Last deployed and last verified dates
- Readiness blockers and warnings
- Rollback references
- Database backup references
- Editable target notes, deployment notes, blockers, and paths

Seed targets exist for:

- Midway Music Hall production, GoDaddy/cPanel
- Midway Mobile Storage production, GoDaddy/cPanel
- Thunder Road production, GoDaddy/cPanel
- Surplus Containers production, GoDaddy/cPanel
- JAMARQ website production
- Tenra public site production

Placeholder hosts and paths are marked as placeholders and must be confirmed before future automation work.

Seed cPanel runbooks exist for the current five-site queue:

1. Midway Mobile Storage
2. Midway Music Hall
3. Surplus Containers
4. Thunder Road
5. Bow Wow

These runbooks capture artifact filenames, upload targets, preserve paths, and post-upload checks. They do not upload, extract, delete, overwrite, or create deployment records by themselves.

Artifact inspection is browser-local. Selecting a zip reads metadata from the local file, computes a checksum when the browser supports it, lists top-level ZIP entries, and flags wrong filenames, absolute paths, `..` traversal, or missing frontend/backend/placeholder indicators. Atlas stores only inspection metadata on the local runbook artifact; it does not upload the file.

## Data Boundary

Dispatch state is separate from Atlas workspace state.

- Workspace storage key: `jamarq-atlas.workspace.v1`
- Dispatch storage key: `jamarq-atlas.dispatch.v1`

Dispatch records reference Atlas projects by `projectId`. Dispatch readiness must not mutate Atlas project status.

Preflight runs are stored in the same Dispatch storage document as short evidence snapshots. They contain target IDs, timestamps, check results, scoped GitHub snippets, warnings, and errors. They do not store deployment artifacts or full GitHub history.

Host evidence and runbook verification evidence are stored in the Dispatch document as short history lists. They contain project/target/runbook references, timestamps, normalized check statuses, warnings, and human-readable summaries. They do not store credentials, response bodies, server files, artifacts, database data, logs, or secrets.

Deploy sessions are also stored in the Dispatch document. They contain session IDs, runbook and target references, step states, human notes, evidence text, session events, and optional links to manually created deployment records. They do not store credentials or server files.

## Service Boundary

Dispatch services live under `src/services`.

- `dispatchStorage.ts`: target, record, and readiness access helpers.
- `dispatchReadiness.ts`: advisory readiness evaluation.
- `dispatchPreflight.ts`: read-only preflight run assembly.
- `dispatchHealthChecks.ts`: read-only local health probe client.
- `dispatchRunner.ts`: no-op future deployment runner boundary.
- `dispatchAutomation.ts`: advisory automation readiness and no-op dry-run planning.
- `dispatchEvidence.ts`: normalized host and runbook verification evidence history.
- `deploySessions.ts`: manual deploy-session creation, step updates, typed-confirmation deployment record creation, and storage normalization.
- `hostConnection.ts`: browser client for server-side read-only host boundary status/preflight.

## cPanel Runbooks

Runbooks are local Dispatch data. They track:

- `DeploymentArtifact`: expected zip filename, role, source repo/project, target path, checksum placeholder, inspection timestamp, warnings, and notes.
- `DeploymentPreservePath`: server paths that must be preserved or created before upload.
- `DeploymentVerificationCheck`: read-only `HEAD`/`GET` checks with expected statuses.
- `DeploymentRunbook`: per-site artifact, preserve-path, verification, and manual deploy notes.
- `DeploymentOrderGroup`: ordered deployment queue for related runbooks.

Current artifact expectations:

- Bow Wow: `deploy-placeholder.zip` only while placeholder is intended.
- MMH, MMS, Surplus Containers, TRBG: `frontend-deploy.zip` to site root and `backend-deploy.zip` to `/api`.

Current preserve/create notes:

- MMH: preserve `/api/.env` and uploads.
- MMS: create `/api/.env` from current config values and preserve `/api/config.php` for one transition deploy.
- Surplus Containers: preserve `/api/.env`, logs, and runtime data.
- TRBG: preserve `/api/.env`, `/api/uploads`, `/api/incoming`, logs/runtime data; backend artifact includes `vendor/`, so Composer is not run on the server.

The most important cPanel rule remains: never replace the whole `/api` folder without preserving server-only files first.

## Queue Command Center

The Queue Command Center is a derived Dispatch view for the current cPanel order:

1. MMS
2. MMH
3. Surplus Containers
4. TRBG
5. Bow Wow

It does not create a new persisted queue store. Each row is derived from existing runbooks, targets, artifact metadata, preflight runs, host evidence, verification evidence, deploy sessions, and deployment records.

Queue rows can:

- Inspect expected ZIP artifacts locally and save checksum/warning metadata back to the runbook artifact.
- Run read-only Dispatch preflight.
- Run read-only Host Inspector checks.
- Run read-only runbook verification checks.
- Run a read-only evidence sweep across the current queue.
- Start or resume a manual deploy session.
- Create a local deployment-readiness report packet.
- Open the project detail panel for full editing.

Queue states such as `needs-artifacts`, `needs-evidence`, `session-active`, `ready-for-manual-upload`, and `recorded` are advisory summaries only. They do not change Atlas project status, Dispatch target status, readiness, verification, Planning, GitHub bindings, Writing, Reports, Settings, or Sync automatically.

## Deploy Sessions

Deploy Sessions convert a cPanel runbook into a guided manual workflow. The first version is scoped to the current five-site queue:

1. MMS
2. MMH
3. Surplus Containers
4. TRBG
5. Bow Wow

Session steps are manual:

- Read-only preflight reviewed.
- Artifact inspection reviewed.
- Preserve/create paths reviewed.
- Backup readiness confirmed.
- Outside-Atlas upload completed.
- Post-upload verification reviewed.
- Operator notes captured.
- Post-deploy wrap-up reviewed.

Each step can be `pending`, `in-progress`, `confirmed`, `skipped`, or `blocked`, and each step supports human notes and evidence text. These fields are evidence for an operator, not proof that Atlas performed any action.

When host or runbook verification evidence has been captured, the active session can explicitly attach the latest evidence IDs and summaries to the relevant session steps. Attachment updates only the selected session notes/evidence fields. It does not change target status, readiness, verification, or deployment records.

After review, a human can create one manual `DeploymentRecord` from a session. This requires typing `RECORD MANUAL DEPLOYMENT`. The record defaults to `verification` status and includes safety notes stating that Atlas did not upload, extract, delete, overwrite, back up, restore, roll back, SSH/SFTP write, cPanel write, or touch production databases.

Deploy Sessions must not:

- Change Atlas project status.
- Change Dispatch target status or readiness.
- Mark verification.
- Create Planning, Writing, GitHub, Reports, or Sync changes automatically.
- Perform upload, deployment, backup, restore, rollback, SSH/SFTP, cPanel, GoDaddy, file, or database operations.

Session evidence differs from deployment records: a session is an operator checklist and notes trail; a deployment record is a human-confirmed summary that something was done outside Atlas.

## Evidence Archive

Dispatch now keeps three related but separate evidence trails:

- Preflight evidence: advisory target configuration, health, backup/rollback, and optional GitHub signal snapshots.
- Host evidence: read-only `/api/dispatch/host-preflight` results, including missing-config states, host reachability, and optional read-only mirror path checks.
- Runbook verification evidence: read-only checks from cPanel runbooks, such as `/`, `/api/health`, `/api/.env`, and `/api/logs/app.log`.

Evidence archive entries are local Dispatch records. They can be displayed on dashboard cards, reviewed on project Dispatch panels, attached to deploy-session notes, and included in report packets.

Evidence archive entries are not deployment records. They do not prove Atlas uploaded files, changed production, verified a site automatically, or made a shipping decision.

## Preflight Evidence

Dispatch Preflight is a read-only review aid. A preflight run can check:

- Public URL presence.
- Placeholder host, user, and path values.
- Health check URL response through `/api/dispatch/health`.
- Backup-required targets that are not manually marked backup-ready.
- Rollback reference availability from the latest deployment record.
- Latest bound GitHub commit, workflow run, release, deployment, and check-run snippets when permissions allow.

Health probing is local-server-side to avoid browser CORS limits. It supports only `http` and `https`, sends no credentials or request body, uses a timeout-bound `HEAD` request with safe `GET` fallback, and converts network failures into check results instead of app errors.

Runbook verification checks can also probe the current public URL and protected paths such as `/api/.env` and `/api/logs/app.log`. Protected paths are expected to return `403` or `404`; those statuses are considered successful evidence for the protection check even though the underlying health probe classifies them as warnings.

Runbook verification results are persisted as verification evidence history after a check run completes or returns a scoped failure. The stored history contains statuses and messages only, not response bodies.

GitHub permission gaps are scoped to the affected check. Missing tokens, private repos, rate limits, and insufficient permissions produce warnings without breaking Dispatch, Atlas status editing, Verification, Writing, or GitHub Intake.

Preflight must not:

- Update Atlas project status.
- Update Dispatch target status or readiness.
- Create deployment records.
- Mark a project verified.
- Decide whether a project should ship.

## Read-Only Host Boundary

The host boundary prepares Atlas for future cPanel/SFTP checks without adding write-capable deployment automation.

Server-side routes:

- `GET /api/dispatch/host-status`
- `GET /api/dispatch/host-preflight`

Configuration is optional and server-side only through `ATLAS_HOST_PREFLIGHT_CONFIG`. Atlas stores only non-secret credential reference labels on deployment targets, such as `godaddy-mmh-production`. Passwords, tokens, private keys, passphrases, and API keys must not be stored in browser local storage or returned through the API.

Supported probe modes:

- `tcp`: checks host/port reachability only.
- `local-mirror`: checks configured paths against a server-side read-only mirror directory.
- `sftp-readonly`: connects over SFTP and performs read-only `stat` plus optional top-level directory metadata checks.

SFTP config must reference secrets through environment variable names, never inline values:

```json
[
  {
    "targetId": "midway-music-hall-production",
    "credentialRef": "godaddy-mmh-production",
    "probeMode": "sftp-readonly",
    "host": "example.com",
    "port": 22,
    "username": "cpanel_user",
    "passwordEnvVar": "MMH_SFTP_PASSWORD"
  }
]
```

Private-key auth can use `privateKeyPathEnvVar` and optional `passphraseEnvVar`. Status responses may show target ID, host, port, credential reference, probe mode, and auth method. They must not return usernames, passwords, private key paths, passphrases, or raw env var values.

When configured, the boundary can collect read-only evidence for:

- Host TCP reachability.
- Target root existence through an optional read-only local mirror.
- `/api` existence through an optional read-only local mirror.
- Preserve-path existence through an optional read-only local mirror.
- SFTP read-only auth/connect evidence when env-var referenced credentials are available.
- SFTP read-only `stat` checks for root, `/api`, and preserve paths.
- Optional SFTP top-level directory counts only, with no file content and no recursive listing.

When not configured, Dispatch shows a scoped missing-config state. Path checks are skipped unless a read-only mirror or SFTP read-only probe is configured. Atlas does not attempt SSH/SFTP writes, shell commands, cPanel writes, writable checks, uploads, deletes, extraction, backups, restores, or rollbacks.

Host preflight results are persisted as host evidence history after each run, including missing-config results. This makes closeout/reporting possible without treating missing credentials as an application failure.

## Runner Phases

Future deployment automation is shaped around these phases:

1. Preflight
2. Backup
3. Package
4. Upload
5. Release
6. Verify
7. Rollback

Every phase currently returns a structured no-op result. No deployment command is executed.

## Write Automation Gate

Write-capable deployment automation is locked. Dispatch may show evidence for future approval, but it does not expose execution actions.

Required future gates before uploads, releases, rollbacks, cPanel writes, SSH/SFTP writes, file overwrites, or database operations can be considered:

1. Verified backup.
2. Artifact checksum.
3. Preserve path confirmation.
4. Rollback reference.
5. Typed confirmation.
6. Dry-run pass.
7. Post-deploy verification plan.

The current UI shows these gates as evidence requirements only. The gate status remains `locked`, and `canExecuteWriteAutomation` returns `false`. The existing runner phases remain no-op safety stubs.

## Automation Readiness

Automation readiness prepares Dispatch for future safe deployment workflows without enabling deployment automation.

Per-target readiness records include:

- Runbook notes.
- Required confirmations.
- Checklist items.
- Artifact expectations.
- Backup requirements.
- Rollback requirements.
- Dry-run notes.

The no-op dry-run planner maps the existing future runner phases into an advisory plan. It can report incomplete documentation and confirmation gaps, but every phase remains `not-implemented` or `blocked`. It does not run SSH, SFTP, cPanel, GoDaddy, file overwrite, database, release, rollback, or deployment commands.

Automation readiness must not:

- Change Atlas project status.
- Change Dispatch target status or readiness.
- Create deployment records.
- Stamp verification.
- Decide whether anything should ship.

## Safety Rules

Dispatch must not:

- Decide what should be deployed.
- Auto-change Atlas project status.
- Auto-mark work as ready.
- Overwrite production files.
- Overwrite production databases.
- Run destructive operations without explicit human confirmation.

Future destructive operations require additional safeguards:

- Production database imports/restores require explicit typed confirmation.
- Production file overwrites require a verified backup first.
- phpMyAdmin should not be automated directly.
- Future cPanel/GoDaddy support should prefer SSH/SFTP, `mysqldump`/`mysql`, and cPanel API where appropriate.

No destructive operation exists in this implementation.
