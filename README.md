# JAMARQ Atlas

JAMARQ Atlas is a local-first operator dashboard for mapping open work across client systems, software suites, experiments, business infrastructure, and outlier repositories.

Atlas is not a replacement for GitHub, deployment dashboards, or human judgment. GitHub can show what happened. Atlas keeps the operational interpretation separate: status, next action, blockers, risk, deferred work, decisions, and verification state.

Atlas Dispatch extends that model for deployment readiness. Atlas maps work. Dispatch tracks whether a project can be safely shipped. Humans decide what ships.

## Current Reality

This is a working local-first MVP, not a placeholder. It runs as a React/Vite app, stores manual workspace state in browser local storage, and keeps GitHub access behind the local Vite server so tokens stay out of browser code.

The dashboard currently supports:

- Board-level review of sections, project groups, and projects.
- Project detail pages for status, next action, blockers, deferred work, not-doing items, notes, decisions, and last verification.
- Timeline evidence ledger derived from Workspace, Dispatch, Writing, Sync, and existing activity events.
- GitHub Intake for discovering repositories, reviewing placement suggestions, binding them to Atlas projects, and creating explicit Inbox records from unbound repos.
- Optional read-only GitHub panels for bound repository activity.
- GitHub health and deploy-delta summaries for latest commits, PRs, issues, workflow/check status, releases, deployments, and permission gaps.
- Planning Center for manual objectives, milestones, work sessions, and planning notes.
- Verification Center for cadence-based manual review queues and verification audit notes.
- Atlas Dispatch for deployment target posture, readiness notes, read-only preflight evidence, health check signals, rollback posture, and deployment history.
- cPanel deploy runbooks for the current five-site deploy queue, including artifacts, preserve paths, and verification checks.
- Dispatch Queue Command Center for the ordered cPanel workflow, local artifact inspection, read-only evidence sweeps, session launch/resume, and readiness report creation.
- Dispatch evidence archive for persisted host-preflight and runbook verification check history.
- Guided Dispatch deploy sessions for manual cPanel upload evidence, step notes, and explicit human-confirmed deployment records.
- Read-only Dispatch host boundary checks for optional server-side TCP, local-mirror, and SFTP inspection evidence without exposing credentials or attempting writes.
- Dispatch write automation gate showing future required safeguards while keeping execution locked.
- Dispatch automation readiness for runbook notes, confirmations, checklist posture, artifact expectations, backup requirements, rollback requirements, and no-op dry-run planning.
- AI Writing Workbench for local draft packets, review notes, client updates, release notes, weekly summaries, and Codex handoffs. AI does not decide status, priority, risk, roadmap, verification, or deployment readiness.
- Reports for assembling local Markdown update packets from approved Writing drafts and operational context.
- Deployment report packets for readiness, post-deploy verification, client site updates, and internal deploy handoffs.
- Data Center for local JSON backups, Markdown inventory reports, restore previews, and typed-confirmation restore.
- Settings & Connections Center for local workspace labels, calibration checks, and integration-readiness status without storing secrets.
- Manual local Sync snapshots and optional Supabase hosted snapshot push/pull.

No hosted production URL is configured yet. Run the app locally until a deployment target is intentionally added.

## What This Repo Contains

- React dashboard and project detail surfaces.
- Local seed data for the initial Atlas sections and Dispatch targets.
- Separate local storage hooks for workspace state and Dispatch state.
- Optional GitHub REST integration through `/api/github`.
- Repository binding/import helpers that persist repo links only.
- Separate Planning storage for human-authored objectives, milestones, work sessions, and notes.
- Verification cadence helpers and manual verification audit events.
- Dispatch domain models, readiness evaluation, read-only preflight evidence, host evidence, runbook verification evidence, health checks, and safe no-op runner phases.
- Optional read-only host boundary API under `/api/dispatch/host-status` and `/api/dispatch/host-preflight`.
- Dispatch automation readiness helpers and no-op dry-run planning.
- Dispatch deploy session helpers for manual session steps, evidence capture, and typed-confirmation deployment records.
- Separate local writing draft storage, writing templates, context snapshots, and provider stubs.
- Separate Reports storage for local packet Markdown, source summaries, and report-only audit events.
- Versioned local backup/export helpers for Workspace, Dispatch, Writing, Planning, Reports, Settings, and Sync data.
- Local settings storage for device/operator labels and connection-readiness surfaces.
- Local sync snapshot storage and optional Supabase hosted sync bridge.
- Unit and Playwright smoke tests for the main operator flows.

## Timeline

Timeline is a derived evidence ledger. It shows existing Atlas evidence in one place without creating a new source of truth.

Current Timeline sources:

- Workspace activity.
- Manual verification events.
- Dispatch deployment records, preflight runs, host evidence, and runbook verification evidence.
- Writing review/audit events.
- Local and loaded remote Sync snapshots.
- Hosted Sync push/pull timestamps.
- GitHub activity already present in Atlas activity records.

Timeline rows can be filtered by project, section, source, type, date range, and search. Project detail pages include a compact timeline for the selected project. Timeline does not change status, verification, readiness, Writing state, GitHub bindings, Sync state, or any operational decision.

## Calibration

Settings includes Calibration Checks for unresolved placeholders across Workspace and Dispatch. It flags placeholder hosts, paths, domains, health URLs, backup notes, rollback notes, missing repo bindings, and verification gaps.

Calibration can edit non-secret Dispatch target fields, but it rejects credential-shaped values. Store credential references only as labels; never store passwords, tokens, API keys, or private keys in Atlas browser state.

## Planning Center

Planning Center stores lightweight human-authored planning records under `jamarq-atlas.planning.v1`.

Current planning record types:

- Objectives
- Milestones
- Work sessions
- Planning notes

Planning records link to Atlas projects and can be filtered by section, kind, manual planning status, and search. Project detail pages include a compact Planning panel for the selected project.

Planning is manual-only. GitHub, Dispatch, Verification, Writing, and AI provider signals do not create or update Planning records automatically. Planning records do not change Atlas project status, risk, next action, verification, Dispatch readiness, GitHub bindings, or Writing review state.

## Tech Stack

- React + TypeScript for the dashboard and detail surfaces.
- Vite for the local app and local `/api/github`, `/api/dispatch`, and `/api/sync` boundaries.
- Local storage for manual workspace edits and separate Dispatch state.
- Local storage for Settings and manual Sync snapshots.
- Server-side environment variables for GitHub tokens, optional Supabase sync credentials, and optional OpenAI provider credentials.
- Optional server-side `ATLAS_HOST_PREFLIGHT_CONFIG` for read-only TCP/local-mirror/SFTP host boundary checks with credential reference labels only.
- JAMARQ Digital brand system: JAMARQ Black `#0D0D0F`, Accent Cyan `#09A6D6`, steel/slate/mist neutrals, Montserrat headings, Inter body.

## Quick Start

```sh
npm install
cp .env.example .env
npm run dev
```

Checks:

```sh
npm run lint
npm run build
npm run test:unit
npm run test:e2e
```

The app runs without GitHub credentials. Repo panels show a clear missing-token state instead of failing the dashboard.

## GitHub Connection

GitHub data is fetched through the local Vite server. The token is never placed in browser code.

```sh
GITHUB_TOKEN=ghp_your_read_only_token GITHUB_REPOS=jmars319/JAMARQ-Atlas npm run dev
```

Supported env vars:

- `GITHUB_TOKEN` or `GH_TOKEN`: read-only GitHub token.
- `GITHUB_REPOS`: comma-separated configured repositories.
- `GITHUB_OWNER`: optional owner fallback for repo names that omit `owner/`.

The UI fetches the latest 20 records by default and uses pagination for more history. Full commit history does not need to be permanently stored locally.

Supported GitHub resources:

- Repository overview
- Repository inventory from configured repos and viewer-accessible repos
- Commits
- Pull requests
- Issues
- Workflow runs
- Workflow definitions
- Releases
- Deployments
- Check runs
- Branches
- Tags

Each resource reports its own permission or availability problem. If a token can read commits but not Actions, the commits tab still works and the Actions tab reports the permission gap.

GitHub Intake supports two read-only inventory sources:

- Configured repos from `GITHUB_REPOS`.
- Viewer repos from the authenticated token when `/user/repos` is available.

Atlas stores only the resulting project repository bindings or explicitly created Inbox projects. It does not mirror full GitHub history into local storage.

GitHub Intake also derives placement suggestions for unbound repositories. Suggestions use deterministic local matching against repo names/descriptions, project names/summaries/notes, known portfolio keywords, and existing section/group labels. A suggestion is not stored as truth and does not bind or import anything until a human clicks a bind or Inbox action.

The GitHub tab also includes a selected-repo deep dive for overview, commits, PRs, issues, workflow runs, workflows, checks, releases, deployments, branches, and tags. Each resource is fetched live through the local API and reports permission gaps in place.

The older `npm run ingest:github` snapshot command remains available for raw cache experiments, but the app now uses `/api/github` for interactive read-only views.

## Hosted Sync

Hosted sync is optional and Supabase-backed. It stores manual remote snapshots, not live merged state.

```sh
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your_server_side_service_role_key \
ATLAS_SYNC_WORKSPACE_ID=jamarq-atlas-local \
npm run dev
```

The browser can push, list, preview, and restore remote snapshots through `/api/sync`. The service role key remains server-side. Atlas still runs normally when these values are missing.

Settings compares selected remote snapshots with current local stores by fingerprint, counts, created date, and device label before restore. Remote snapshot lists are capped at the latest 50 and can be deleted one at a time after explicit confirmation. There is still no automatic merge or background sync.

## Atlas Dispatch

Dispatch tracks deployment posture without executing deployments. Dispatch data is stored separately from Atlas workspace state under `jamarq-atlas.dispatch.v1`.

Current Dispatch data:

- Deployment targets and environments.
- Host type and placeholder host/path configuration.
- Public URL and health check URLs.
- Read-only preflight runs and check evidence.
- Read-only host evidence history.
- Runbook verification evidence history.
- Deployment notes, blockers, and target notes.
- Last deployed and last verified dates.
- Deployment records and health check results.
- Manual deploy sessions, step evidence, and session audit events.
- Rollback reference and database backup reference.
- Backup-required and destructive-confirmation-required flags.
- Advisory readiness blockers and warnings.
- Automation readiness runbook notes, checklist items, confirmations, artifact expectations, backup requirements, rollback requirements, and dry-run notes.

Dispatch Preflight collects short local evidence snapshots for human review:

- Target configuration checks.
- Read-only health URL probes through `/api/dispatch/health`.
- Backup and rollback posture checks.
- Optional GitHub commit, workflow, release, deployment, and check-run snippets when a repo is bound and token permissions allow.
- Scoped warnings for missing tokens, private repos, permission gaps, rate limits, or unavailable resources.

Preflight runs are stored under Dispatch state as evidence history only. They do not create deployment records, update Atlas project status, update Dispatch target status, mark readiness, stamp verification, or decide what should ship.

Dispatch also persists host evidence from `/api/dispatch/host-preflight` and runbook verification evidence from cPanel checks such as `/`, `/api/health`, `/api/.env`, and `/api/logs/app.log`. Missing host configuration is stored as a scoped evidence result, not an app failure. Protected paths are expected to return `403` or `404`.

The optional Host Inspector can use server-side `ATLAS_HOST_PREFLIGHT_CONFIG` entries for TCP, local-mirror, or `sftp-readonly` probes. SFTP mode uses env-var references such as `passwordEnvVar`, `privateKeyPathEnvVar`, and `passphraseEnvVar`; secret values are never stored in browser state or returned to the client. SFTP checks only connect, `stat` configured paths, and count top-level directory entries. Atlas does not read file contents, recursively list production folders, upload, delete, chmod, rename, run shell commands, or call cPanel write APIs.

The Dispatch Queue Command Center derives one ordered row per current cPanel runbook. It summarizes artifact inspection, latest preflight, latest host evidence, latest runbook verification evidence, deploy-session state, and manual deployment records. It can run read-only evidence checks and create local readiness report packets, but it does not persist a separate queue store or make shipping decisions.

Deploy Sessions sit between runbooks and deployment records. A session guides a human through preflight review, artifact inspection, preserve/create path checks, backup readiness, an outside-Atlas upload note, verification checks, operator notes, and wrap-up. Atlas does not perform the upload. Recording the final deployment requires typing `RECORD MANUAL DEPLOYMENT`, and the resulting record states that Atlas did not deploy, upload, overwrite, back up, restore, roll back, SSH/SFTP write, cPanel write, or touch databases.

Active deploy sessions can explicitly attach the latest host or verification evidence to session notes. Attachment only updates the selected session evidence text. It does not mark anything deployed, ready, stable, or verified.

Seed targets exist for:

- Midway Music Hall production, GoDaddy/cPanel.
- Midway Mobile Storage production, GoDaddy/cPanel.
- Thunder Road production, GoDaddy/cPanel.
- Surplus Containers production, GoDaddy/cPanel.
- JAMARQ website production.
- Tenra public site production.

Placeholder values are clearly marked and must be confirmed before any future automation work.

Dispatch intentionally does not automate:

- Live deployment.
- SSH/SFTP writes or shell commands.
- cPanel or GoDaddy writes.
- Production file overwrite.
- Production database import, restore, or overwrite.
- Rollback execution.
- phpMyAdmin automation.

Future deployment runner phases are stubbed:

1. Preflight
2. Backup
3. Package
4. Upload
5. Release
6. Verify
7. Rollback

Every runner phase currently returns a structured no-op result. No network write, file overwrite, database operation, or deployment command is executed.

Dispatch also includes an automation readiness layer. It stores per-target runbook notes, required confirmations, checklist items, artifact expectations, backup requirements, rollback requirements, and dry-run notes. The dry-run planner returns advisory no-op phase output only; it does not execute SSH, SFTP, cPanel, GoDaddy, file, database, release, rollback, or deployment commands.

## Verification Center

Verification Center turns each project's human-authored `lastVerified` date into a review queue. It is meant to answer what needs a manual look, not what should be prioritized.

Project cadences:

- Weekly
- Biweekly
- Monthly
- Quarterly
- Ad hoc

Existing and seed projects default to monthly. Ad hoc projects remain visible but are never considered overdue.

Manual verification can:

- Update `lastVerified` to today.
- Add a manual verification activity event.
- Store an optional verification note in the project activity trail.

Manual verification cannot:

- Change project status.
- Mark a project stable.
- Change current risk, priority, roadmap, GitHub bindings, or Dispatch readiness.

## AI Writing Workbench

Writing turns Atlas project context into reviewable local draft packets. Atlas still works without AI credentials; when `OPENAI_API_KEY` is configured, the local server can request draft-only OpenAI suggestions through `/api/writing`.

First-class templates:

- Client update
- Release notes
- Weekly change summary
- Codex handoff

Each draft stores:

- Editable draft text.
- The prompt packet sent to the optional provider.
- A short context snapshot from Atlas manual fields, activity, verification, Dispatch posture, and optional GitHub snippets.
- Optional provider suggestion text.
- Review status, review notes, Writing-only audit events, and timestamps.

Writing state is stored separately under `jamarq-atlas.writing.v1`. Drafts reference projects by `projectId` and do not mutate workspace state.

Provider suggestions are not applied automatically. `Create draft packet` creates the local scaffold and prompt packet. `Generate provider suggestion` stores an OpenAI suggestion on the draft. `Apply suggestion to draft` is a separate human action that replaces the editable draft text.

Optional OpenAI env vars:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`, default `gpt-5`

OpenAI credentials remain server-side. The browser stores only the selected draft's prompt/context snapshot and the returned suggestion.

Writing review lifecycle:

- Draft
- Reviewed
- Approved
- Exported
- Archived

Review and export actions append audit events inside Writing storage only. They do not add Atlas project activity events.

Local export actions:

- Copy draft text.
- Copy prompt packet.
- Download a Markdown packet.

Markdown packets include draft text, project/template metadata, review/export status, context warnings, source context summary, guardrails, review audit, and an optional prompt-packet appendix. Exporting Markdown is local/browser-only and does not prove that a client update was sent, a release was published, work was shipped, or verification was completed.

## Reports

Reports assembles local Markdown packets from approved/exported Writing drafts and Atlas context.

Supported packet types:

- Client update packet
- Internal weekly packet
- Release packet
- Project handoff packet
- Deployment readiness packet
- Post-deploy verification packet
- Client site update packet
- Internal deploy handoff packet

Report packets can include project manual status, verification state, Dispatch posture, cPanel runbooks, stored host evidence, runbook verification evidence, deploy-session notes, manual deployment record references, Planning records, repository bindings, and GitHub warnings captured inside selected Writing drafts. Reports are stored separately under `jamarq-atlas.reports.v1`.

Report actions are local-only:

- Copy Markdown.
- Download Markdown.
- Archive a packet locally.

Reports do not send email, publish to Docs/Notion/Slack, write to GitHub, deploy, verify, or change Workspace, Dispatch, Planning, Verification, Writing, Settings, or Sync state.

## Data Center

Data Center protects local Atlas state before hosted persistence exists.

It can export:

- A machine-restorable JSON backup.
- A human-readable Markdown inventory report.
- A compact clipboard summary.

The JSON backup is a versioned envelope:

- `kind: "jamarq-atlas-backup"`
- `schemaVersion: 3`
- `exportedAt`
- `appName`
- `stores.workspace`
- `stores.dispatch`
- `stores.writing`
- `stores.planning`
- `stores.reports`
- `stores.settings`
- `stores.sync`

Backups include Atlas Workspace, Dispatch, Writing, Planning, Reports, Settings, and Sync stores only. They exclude GitHub tokens, environment variables, browser secrets, unknown local storage keys, build output, dependency caches, and live GitHub history beyond saved repo bindings and captured Writing context snapshots. Schema v1/v2 backups remain importable and receive default missing stores during restore preview.

Restore is preview-first and full-replace. Atlas validates the JSON, normalizes compatible older store shapes, shows current vs incoming counts, then requires the exact typed confirmation `RESTORE ATLAS` before replacing local Workspace, Dispatch, Writing, Planning, Reports, Settings, and Sync state. Restore does not merge records and remains separate from Reset seed.

## Settings & Connections

Settings stores local workspace identity only:

- Device label
- Operator label
- Local-only notes
- Settings schema version
- Last updated timestamp

Settings also shows connection-readiness cards for GitHub, Dispatch, Writing, Data Center, and Supabase hosted sync. It does not store GitHub tokens, AI keys, deployment credentials, Supabase keys, environment variables, or browser secrets. Connection cards are status/readiness surfaces only; they do not trigger automation.

## Sync Snapshots

Sync supports local manual snapshots and optional Supabase hosted snapshots inside Settings. Hosted sync is still manual: no background sync, no merge, no accounts, and no conflict resolution are enabled.

Current Sync behavior:

- Create manual snapshots.
- Preview snapshot restore counts.
- Restore Workspace, Dispatch, Writing, Planning, and Reports after typing `RESTORE ATLAS`.
- Delete snapshots after explicit confirmation.
- Check Supabase hosted sync status through the local `/api/sync/status` route.
- Push the current Workspace, Dispatch, Writing, Planning, and Reports stores as a remote snapshot when Supabase env vars are configured.
- Load remote snapshot metadata.
- Preview and restore a remote snapshot after typing `RESTORE ATLAS`.
- Compare remote snapshots against current local stores by fingerprint and counts.
- Delete one remote snapshot after explicit confirmation.

Snapshots store Workspace, Dispatch, Writing, Planning, and Reports only. They do not store Settings, Sync, secrets, unknown localStorage keys, or full live GitHub history.

Optional Supabase env vars:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ATLAS_SYNC_WORKSPACE_ID`

The Supabase service role key is read server-side only by the local Vite middleware. It is never bundled into browser code or stored in local storage.

## Documentation

Start here:

- `docs/SYSTEM_OVERVIEW.md`

Focused references:

- `docs/GITHUB_INTEGRATION.md`
- `docs/TIMELINE.md`
- `docs/PLANNING.md`
- `docs/REPORTS.md`
- `docs/DISPATCH.md`
- `docs/AI_WRITING.md`
- `docs/DATA_PORTABILITY.md`
- `docs/SETTINGS.md`
- `docs/SYNC.md`
- `docs/SUPABASE_SYNC.md`

## Architecture

Atlas separates manual intent from raw activity.

- `src/domain/atlas.ts` defines workspace, section, group, project, manual state, repository links, and activity events.
- `src/domain/dispatch.ts` defines Dispatch targets, statuses, records, readiness, health checks, and runner results.
- `src/domain/writing.ts` defines Writing templates, drafts, context snapshots, provider results, and local workbench state.
- `src/domain/dataPortability.ts` defines backup envelopes, validation results, summaries, and restore previews.
- `src/domain/planning.ts` defines manual Planning records and planning statuses.
- `src/domain/reports.ts` defines report packet types, packet state, and report audit events.
- `src/domain/settings.ts` defines local settings and connection-readiness cards.
- `src/domain/sync.ts` defines local sync snapshots, provider status, and restore previews.
- `src/hooks/useLocalSettings.ts` persists local Settings state under `jamarq-atlas.settings.v1`.
- `src/hooks/useLocalSync.ts` persists local Sync state under `jamarq-atlas.sync.v1`.
- `src/hooks/useLocalDispatch.ts` persists Dispatch state separately under `jamarq-atlas.dispatch.v1`.
- `src/hooks/useLocalPlanning.ts` persists Planning state separately under `jamarq-atlas.planning.v1`.
- `src/hooks/useLocalReports.ts` persists Reports state separately under `jamarq-atlas.reports.v1`.
- `src/hooks/useLocalWriting.ts` persists Writing state separately under `jamarq-atlas.writing.v1`.
- `src/components/DispatchDashboard.tsx` renders deployment readiness cards across projects.
- `src/components/DispatchPanel.tsx` renders project-level Dispatch target details and editable manual fields.
- `server/githubApi.ts` normalizes GitHub REST responses and maps permission/rate-limit/not-found errors.
- `server/dispatchApi.ts` provides read-only Dispatch health probing for preflight checks.
- `server/syncApi.ts` provides optional Supabase hosted snapshot push/pull routes.
- `src/components/Dashboard.tsx` renders the compact status board.
- `src/components/GitHubIntakeDashboard.tsx` renders repository discovery, binding, and explicit Inbox import.
- `src/components/PlanningCenter.tsx` renders manual planning creation, filters, and editable planning cards.
- `src/components/PlanningPanel.tsx` renders compact project-level planning context.
- `src/components/ReportsCenter.tsx` renders local report packet assembly, editing, copy, export, and audit history.
- `src/components/VerificationCenter.tsx` renders cadence-based verification queues and due-state filters.
- `src/components/WritingWorkbench.tsx` renders local writing draft creation, editing, review state, and draft history.
- `src/components/DataCenter.tsx` renders local backup export, import validation, restore preview, and typed restore.
- `src/components/SettingsCenter.tsx` renders local workspace identity and integration-readiness status.
- `src/components/ProjectDetail.tsx` renders manual operational fields, GitHub activity, mock/manual activity, verification, and Writing launchers.
- `src/components/RepoActivityPanel.tsx` renders GitHub tabs, pagination, resource errors, and advisory signals.
- `src/services/repoBinding.ts` binds, unbinds, dedupes, and explicitly creates Inbox projects from GitHub repositories.
- `src/services/repoSuggestions.ts` derives advisory placement suggestions for unbound GitHub repositories without mutating Workspace or GitHub data.
- `src/services/planning.ts` normalizes Planning storage and applies manual planning record changes.
- `src/services/reports.ts` builds report packet Markdown, normalizes Reports storage, and records report-only audit events.
- `src/services/verification.ts` evaluates verification due state, normalizes cadence defaults, and records manual verification events.
- `src/services/dispatchReadiness.ts` evaluates Dispatch readiness as advisory output only.
- `src/services/dispatchPreflight.ts` assembles read-only preflight evidence without mutating status or readiness.
- `src/services/dispatchEvidence.ts` normalizes and stores host/runbook verification evidence histories.
- `src/services/dispatchHealthChecks.ts` calls the local read-only Dispatch health API.
- `src/services/dispatchRunner.ts` contains safety-stub runner phases for future automation.
- `src/services/automationSignals.ts` generates non-decision signals such as failed workflows, commits since verification, stale PRs, and permission gaps.
- `src/services/aiWritingAssistant.ts` creates Writing context snapshots, prompt packets, and local template drafts.
- `src/services/writingProvider.ts` calls the local Writing provider API and normalizes suggestions/errors.
- `server/writingApi.ts` provides the optional server-side OpenAI draft-only route.
- `src/services/dataPortability.ts` builds backup bundles, Markdown reports, restore previews, and backup validation.
- `src/services/settings.ts` normalizes local Settings state and static connection-readiness cards.
- `src/services/syncSnapshots.ts` builds local snapshots, fingerprints stores, previews snapshot restore, and exposes sync provider stubs.
- `src/services/hostedSync.ts` calls the local hosted sync API and normalizes scoped provider errors.

## Guardrails

Manual fields are the source of truth:

- Status
- Next action
- Last meaningful change
- Last verified
- Current risk
- Blockers
- Deferred items
- Explicitly not doing
- Notes
- Decisions

GitHub activity is advisory:

- Commits do not change status.
- Failed workflows do not change risk.
- Stale PRs do not change priority.
- Permission errors do not block manual tracking.
- Binding a repository does not change manual status.
- Creating an Inbox project from a repo starts in Inbox for human triage.

Writing activity is advisory:

- Drafts do not change Atlas status.
- Drafts do not change risk, blockers, next action, verification, Dispatch readiness, or GitHub bindings.
- Prompt packets and template drafts are local review artifacts.
- Provider suggestions are stored separately until explicitly applied.
- Approved/exported states are Writing review states only.
- Markdown export is local/browser-only and does not send, publish, deploy, or verify anything.
- Optional GitHub snippets are included as context only and are not mirrored as full history.
- OpenAI requests are optional, server-side only, and draft-only.

Planning activity is manual:

- Planning records are created and edited only by explicit user action.
- Planning status is separate from Atlas project status.
- Planning does not update risk, blockers, next action, verification, Dispatch readiness, GitHub bindings, or Writing drafts.
- External signals may provide context elsewhere, but they do not make planning decisions.

Reports are local/manual:

- Report packets are assembled only by explicit action.
- Report export does not mean anything was sent, published, deployed, shipped, or verified.
- Reports do not mutate Workspace, Dispatch, Planning, Verification, Writing, GitHub bindings, Settings, or Sync state.
- External publishing integrations are not implemented.

Verification activity is advisory/manual:

- Cadence queues do not change status.
- Overdue verification does not change risk.
- Marking verified does not mark a project stable.
- GitHub and Dispatch signals do not verify a project automatically.

Dispatch activity is advisory:

- Readiness does not change Atlas status.
- Preflight evidence does not change Atlas or Dispatch status.
- Host and runbook verification evidence does not mean Atlas deployed, verified, uploaded, or changed production.
- Automation readiness and dry-run plans do not change Atlas or Dispatch status.
- Health checks do not mark a project stable.
- Backup warnings do not change priority.
- Deployment records do not decide what should ship.

Dispatch safety rules:

- Production database imports/restores require explicit typed confirmation.
- Production file overwrites require a verified backup first.
- phpMyAdmin should not be automated directly.
- Future cPanel/GoDaddy support should prefer SSH/SFTP, `mysqldump`/`mysql`, and cPanel API where appropriate.
- Current SFTP support is inspection-only: `stat`, top-level directory metadata, and connection/auth evidence.
- No destructive operation exists in the current implementation.

Data portability is local/manual:

- Backups do not read or store credentials.
- Restore replaces local Atlas stores only after preview and typed confirmation.
- Restore does not merge records, write to GitHub, sync to hosted storage, or change source-of-truth rules.

Settings is local/manual:

- Settings does not store tokens, keys, credentials, or env vars.
- Connection status does not change Atlas project state.
- Future provider configuration must keep secrets outside browser local storage.

Sync is manual:

- Snapshots are created only by explicit action.
- Snapshot restore is preview-first and full-replace for Workspace, Dispatch, Writing, Planning, and Reports.
- Hosted push/pull is optional and snapshot-based; it never runs automatically.
- Supabase credentials stay server-side.
- Sync does not merge records or change Atlas source-of-truth rules.

## Statuses

- Inbox
- Planned
- Active
- Waiting
- Verification
- Stable
- Deferred
- Not Doing
- Archived

## Roadmap

1. Add richer Dispatch closeout analytics after the current read-only queue evidence is used in live deploy sessions.
2. Expand Dispatch preflight with authenticated host-specific read-only checks before any write-capable deployment work.
