# Atlas Dispatch

Dispatch tracks deployment readiness, deployment history, target environments, health check posture, rollback posture, and backup requirements for projects managed inside Atlas.

Atlas maps work. Dispatch tracks whether a project can be safely shipped. Humans decide what ships.

## Current Scope

Dispatch currently supports:

- Deployment targets
- Deployment records
- Environment and host metadata
- Public URLs and health check URLs
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

## Data Boundary

Dispatch state is separate from Atlas workspace state.

- Workspace storage key: `jamarq-atlas.workspace.v1`
- Dispatch storage key: `jamarq-atlas.dispatch.v1`

Dispatch records reference Atlas projects by `projectId`. Dispatch readiness must not mutate Atlas project status.

## Service Boundary

Dispatch services live under `src/services`.

- `dispatchStorage.ts`: target, record, and readiness access helpers.
- `dispatchReadiness.ts`: advisory readiness evaluation.
- `dispatchHealthChecks.ts`: read-only health check probing stub.
- `dispatchRunner.ts`: no-op future deployment runner boundary.

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
