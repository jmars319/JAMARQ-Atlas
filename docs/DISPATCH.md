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
- Expected deploy artifacts
- Preserve/create-on-server path checklists
- Read-only preflight evidence history
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

These runbooks capture artifact filenames, upload targets, preserve paths, and post-upload checks. They do not upload, extract, delete, overwrite, or create deployment records.

## Data Boundary

Dispatch state is separate from Atlas workspace state.

- Workspace storage key: `jamarq-atlas.workspace.v1`
- Dispatch storage key: `jamarq-atlas.dispatch.v1`

Dispatch records reference Atlas projects by `projectId`. Dispatch readiness must not mutate Atlas project status.

Preflight runs are stored in the same Dispatch storage document as short evidence snapshots. They contain target IDs, timestamps, check results, scoped GitHub snippets, warnings, and errors. They do not store deployment artifacts or full GitHub history.

## Service Boundary

Dispatch services live under `src/services`.

- `dispatchStorage.ts`: target, record, and readiness access helpers.
- `dispatchReadiness.ts`: advisory readiness evaluation.
- `dispatchPreflight.ts`: read-only preflight run assembly.
- `dispatchHealthChecks.ts`: read-only local health probe client.
- `dispatchRunner.ts`: no-op future deployment runner boundary.
- `dispatchAutomation.ts`: advisory automation readiness and no-op dry-run planning.

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

## Preflight Evidence

Dispatch Preflight is a read-only review aid. A preflight run can check:

- Public URL presence.
- Placeholder host, user, and path values.
- Health check URL response through `/api/dispatch/health`.
- Backup-required targets that are not manually marked backup-ready.
- Rollback reference availability from the latest deployment record.
- Latest bound GitHub commit, workflow run, release, deployment, and check-run snippets when permissions allow.

Health probing is local-server-side to avoid browser CORS limits. It supports only `http` and `https`, sends no credentials or request body, uses a timeout-bound `HEAD` request with safe `GET` fallback, and converts network failures into check results instead of app errors.

GitHub permission gaps are scoped to the affected check. Missing tokens, private repos, rate limits, and insufficient permissions produce warnings without breaking Dispatch, Atlas status editing, Verification, Writing, or GitHub Intake.

Preflight must not:

- Update Atlas project status.
- Update Dispatch target status or readiness.
- Create deployment records.
- Mark a project verified.
- Decide whether a project should ship.

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
