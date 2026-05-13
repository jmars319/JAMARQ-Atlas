# JAMARQ Atlas System Overview

Atlas is a local-first operator dashboard for understanding open work across JAMARQ client systems, software suites, experiments, internal infrastructure, and outlier repositories.

## Current Reality

Atlas is a working MVP. It is intentionally simple: React, Vite, TypeScript, local storage, optional read-only GitHub data, and a clear service boundary for future AI writing assistance and deployment automation.

The app has these main surfaces:

- Board: human-authored operational status across sections, groups, and projects.
- Timeline: derived evidence ledger across existing Atlas stores.
- GitHub Intake: repository discovery, binding, and explicit Inbox project creation.
- Review Center: derived operator review queue, manual review sessions, notes, and explicit Planning handoff.
- Planning Center: human-authored objectives, milestones, work sessions, and notes.
- Verification Center: cadence-based manual review queues and verification audit events.
- Dispatch: deployment posture, read-only preflight, host evidence, verification evidence, and manual deploy sessions across configured targets.
- Writing Workbench: local draft packets and reviewable operational writing.
- Reports: local Markdown packet assembly from approved Writing and operational context.
- Data Center: local backup export, restore preview, and typed-confirmation restore.
- Settings & Connections: local workspace identity, calibration checks, and integration-readiness status.
- Sync Snapshots: manual local snapshots and optional Supabase hosted snapshots.

The important rule is separation. Atlas records manual intent. GitHub and Dispatch provide signals. Writing can draft words for review. None of those systems automatically decide status, priority, risk, roadmap, verification, readiness, or what should ship.

## Timeline Model

Timeline is derived from existing stores rather than persisted as its own store. It normalizes Workspace activity, verification activity, Dispatch deployment/preflight/host/verification evidence, Writing audit events, Review sessions/notes, Planning records, Report audit events, Sync snapshots, and loaded remote snapshot metadata into read-only rows.

Timeline supports filtering by project, section, source, type, date range, and search. It does not mutate Workspace, Dispatch, Writing, Review, Sync, Settings, GitHub bindings, verification, readiness, or project status.

## Workspace Model

Workspace data is defined in `src/domain/atlas.ts` and seeded in `src/data/seedWorkspace.ts`.

Primary concepts:

- Workspace
- Section / portfolio
- Project group
- Project / repo / app / website
- Activity feed
- Manual project state
- Repository link

Manual state includes:

- Status
- Verification cadence
- Next action
- Last meaningful change
- Last verified date
- Current risk
- Blockers
- Deferred items
- Explicitly not doing
- Notes
- Decisions

Workspace state persists through `src/hooks/useLocalWorkspace.ts`.

Existing workspace records are normalized on read so older local storage receives a default monthly verification cadence without losing user-authored fields.

## Planning Model

Planning Center is stored separately under `jamarq-atlas.planning.v1`.

Primary concepts:

- Objective
- Milestone
- Work session
- Planning note
- Manual planning status

Planning records reference Atlas projects by `projectId` and may carry section/group IDs for rollups. They are not part of Workspace manual status and do not update Workspace fields.

Manual planning statuses:

- Idea
- Planned
- Active
- Waiting
- Done
- Deferred

Planning is intentionally lightweight. It records what a human has decided to track, not what GitHub, Dispatch, Verification, or AI inferred. External signals do not create, edit, prioritize, complete, defer, or delete Planning records automatically.

## Review Model

Review Center is stored separately under `jamarq-atlas.review.v1`.

Primary concepts:

- Review session
- Review note
- Review cadence/scope
- Review outcome
- Derived review queue item

Review outcomes are:

- Noted
- Needs follow-up
- No action
- Planned

The Review queue is derived and not persisted as operational truth. It combines Verification due state, Dispatch queue/closeout posture, Workspace blockers/risk/stale verification, unbound GitHub repositories and placement suggestions, recent Timeline evidence, due Planning records, pending Writing/Reports work, and Data/Sync attention states.

Review sessions and notes are manual records only. They do not change Workspace manual state, Verification, Dispatch readiness/status, GitHub bindings, Writing drafts, Reports, Settings, or Sync. Creating a Planning note from Review is an explicit action and goes through the Planning helpers.

## Verification Model

Verification Center is derived from manual project state.

Project cadences:

- Weekly
- Biweekly
- Monthly
- Quarterly
- Ad hoc

Derived due states:

- Overdue
- Due
- Upcoming
- Recent
- Ad hoc
- Unverified

Marking a project verified updates `lastVerified` and adds a manual verification activity event. It does not change status, risk, priority, roadmap, GitHub bindings, or Dispatch readiness.

## Dispatch Model

Dispatch data is defined in `src/domain/dispatch.ts` and seeded in `src/data/seedDispatch.ts`.

Dispatch is stored separately from workspace state through `src/hooks/useLocalDispatch.ts` under the `jamarq-atlas.dispatch.v1` local storage key.

Primary concepts:

- Deployment target
- Deployment record
- Dispatch readiness
- Health check result
- Dispatch preflight run
- Dispatch preflight check
- Dispatch automation readiness
- Dispatch automation dry-run plan
- Dispatch write automation gate
- Read-only host connection check
- Dispatch host evidence run
- Dispatch verification evidence run
- Dispatch deploy session
- Dispatch deploy session step/event
- Derived Dispatch queue item
- Derived Dispatch closeout summary
- Deployment runner phase
- Deployment runner result

Dispatch references Atlas projects by `projectId`. It does not mutate Atlas project status.

Dispatch Preflight stores short local evidence snapshots under the Dispatch storage key. It checks target configuration, health URLs, backup and rollback posture, and optional GitHub snippets when repo bindings and token permissions allow. Preflight does not create deployment records, update Atlas status, update Dispatch readiness, stamp verification, or decide what should ship.

The local `/api/dispatch/health` boundary performs timeout-bound read-only `http`/`https` probes without credentials or request bodies. Browser code receives normalized health results, so CORS and network failures are displayed as scoped evidence instead of breaking the app.

The optional `/api/dispatch/host-status` and `/api/dispatch/host-preflight` boundaries prepare for future host checks while staying read-only. Atlas stores only credential reference labels on targets. Server-side `ATLAS_HOST_PREFLIGHT_CONFIG` may enable TCP reachability, read-only local-mirror path evidence, or SFTP read-only inspection. SFTP credentials are referenced through server-side env var names only, and responses do not expose usernames, passwords, private key paths, passphrases, or raw environment values. SFTP inspection uses connect, `stat`, and optional top-level directory counts only; no SSH/SFTP write, shell command, cPanel write, upload, deletion, extraction, recursive listing, file-content read, writable check, backup, restore, or rollback is attempted.

Dispatch stores host evidence and runbook verification evidence as short local histories. Host evidence captures read-only host-preflight results, including missing-config states. Verification evidence captures runbook checks such as `/`, `/api/health`, `/api/.env`, and `/api/logs/app.log`; protected paths are expected to return `403` or `404`. These evidence histories can be attached to deploy-session notes and included in Reports, but they do not create deployment records, stamp verification, or prove Atlas deployed anything.

The Dispatch Queue Command Center derives ordered rows from the current cPanel `DeploymentOrderGroup`. It summarizes artifact inspection, preflight, host evidence, verification evidence, deploy-session state, and manual deployment records without persisting a separate queue store. Queue actions reuse existing read-only evidence services and report packet creation; they do not deploy, decide readiness, or mutate source-of-truth fields.

Dispatch Deploy Sessions are stored under the Dispatch key as manual evidence workflows tied to cPanel runbooks. They guide a human through preflight review, artifact inspection, preserve/create paths, backup readiness, outside-Atlas upload notes, verification checks, operator notes, and wrap-up. Creating a deployment record from a session requires the exact typed confirmation `RECORD MANUAL DEPLOYMENT`, and the record states that Atlas did not perform the deployment. Sessions do not change Atlas status, Dispatch readiness, Verification, Planning, GitHub bindings, Writing, or Reports automatically.

Dispatch Closeout Analytics is derived, not stored. It combines runbook artifact inspection, deploy-session steps, host evidence, runbook verification evidence, manual deployment records, backup/rollback references, and related deployment report packets into advisory states such as `not-started`, `session-active`, `needs-evidence`, `needs-manual-record`, `needs-follow-up`, and `closeout-ready`. These labels are review aids only; they do not deploy, verify, publish, complete, or mutate any source-of-truth store.

Dispatch Automation Readiness is advisory documentation for future automation. It stores per-target runbook notes, required confirmations, checklist items, artifact expectations, backup requirements, rollback requirements, and dry-run notes. The dry-run planner returns no-op phase output only and does not execute deployment commands.

The Dispatch write automation gate is always locked in this phase. It documents future approval gates such as verified backup, artifact checksum, preserve path confirmation, rollback reference, typed confirmation, dry-run pass, and post-deploy verification plan. It does not expose upload, release, rollback, SSH/SFTP write, cPanel write, file overwrite, or database actions.

## GitHub Boundary

GitHub integration is optional and read-only. Browser code calls the local `/api/github` boundary. The local server reads `GITHUB_TOKEN` or `GH_TOKEN` from environment variables.

GitHub resources are shown as operational signals:

- Repository inventory from configured repos
- Repository inventory from viewer-accessible repos
- Repository overview
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

Permission gaps are resource-local. If a token can read commits but cannot read Actions, the commits panel still works and the Actions panel reports the permission gap.

GitHub Intake persists only Atlas decisions: repository bindings and explicitly created Inbox projects. It does not store full commit, PR, workflow, issue, release, deployment, or check history.

The GitHub tab includes a selected-repo deep dive over these same live resources. Deep-dive data is fetched on demand and remains advisory.

GitHub data does not create or update Planning records. Repo history may be useful context for a human planning session, but the current Planning Center remains explicit and manual-only.

## Calibration Model

Calibration lives inside Settings and scans Workspace plus Dispatch for unresolved placeholder values. It surfaces missing or placeholder domains, hosts, paths, repo bindings, health URLs, backup notes, rollback notes, client labels, and verification gaps.

Calibration can edit selected non-secret Dispatch target fields such as host, user, paths, public URL, health check URLs, and database name. It rejects credential-shaped values and never stores GitHub tokens, API keys, passwords, or deployment credentials.

Calibration does not verify access, change status, change readiness, create deployment records, or make decisions. It is a cleanup queue for human-confirmed operational data.

## AI Boundary

AI support is limited to drafting, summarizing, rewriting, and formatting human-reviewable text.

Allowed examples:

- Summarize recent repo activity.
- Draft release notes.
- Draft client update notes.
- Rewrite rough notes into clearer operational language.
- Generate a Codex handoff summary.

AI must not automatically decide:

- Status
- Priority
- Risk
- Roadmap
- Verification
- Deployment readiness
- GitHub bindings
- What should ship

## Writing Model

Writing Workbench is local-first and stored separately from workspace and Dispatch state under `jamarq-atlas.writing.v1`.

Primary concepts:

- Writing template
- Writing draft
- Writing context snapshot
- Writing provider result
- Draft review status
- Writing review event

Supported templates:

- Client update
- Release notes
- Weekly change summary
- Codex handoff

Creating a draft captures a short context snapshot from human-authored project fields, Atlas activity, verification state, Dispatch posture, and optional GitHub snippets. The snapshot is stored with the draft for review. Full GitHub history is not mirrored into writing storage.

Draft lifecycle:

- Draft
- Reviewed
- Approved
- Exported
- Archived

Review, approval, copy, provider suggestion, suggestion application, export, and archive actions append Writing-only audit events under the Writing storage key. They do not append Atlas project activity events.

The provider boundary is optional and server-side. Current drafts are local template scaffolds plus prompt packets. When `OPENAI_API_KEY` is configured, `/api/writing/generate` can request an OpenAI draft suggestion using the selected draft's prompt packet and context snapshot. Provider output is stored as a suggestion until a human explicitly applies it to editable draft text.

OpenAI requests do not mutate project status, risk, blockers, next action, verification, Dispatch readiness, or GitHub bindings. Missing or failing provider credentials become scoped Writing/Settings messages and do not break local draft creation.

Markdown export is local/browser-only. Export packets include draft text, metadata, review status, context warnings, source context summary, guardrails, review audit, and an optional prompt-packet appendix. Export does not imply that anything was sent, published, deployed, shipped, or verified.

## Reports Model

Reports is stored separately under `jamarq-atlas.reports.v1`.

Primary concepts:

- Report packet type
- Report packet
- Report source summary
- Report-only audit event

Supported packet types:

- Client update packet
- Internal weekly packet
- Release packet
- Project handoff packet
- Deployment readiness packet
- Post-deploy verification packet
- Client site update packet
- Internal deploy handoff packet

Reports can assemble Markdown from approved/exported Writing drafts, project manual state, Verification due state, Dispatch posture, cPanel runbooks, Dispatch closeout analytics, stored host evidence, runbook verification evidence, deploy-session evidence, manual deployment record references, Planning records, Review sessions/notes, repository bindings, and GitHub warnings already captured inside selected Writing context snapshots.

Reports do not fetch full GitHub history and do not write externally. Copy and Markdown download are browser-local actions. Exporting a packet does not mean anything was sent, published, deployed, shipped, or verified.

Reports do not mutate Workspace, Dispatch, Planning, Review, Verification, Writing, GitHub bindings, Settings, or Sync state.

## Data Portability Model

Data Center exports and restores Atlas local stores without adding hosted persistence.

The backup envelope contains:

- Workspace store
- Dispatch store
- Writing store
- Planning store
- Reports store
- Review store
- Settings store
- Sync store
- Schema version
- Export timestamp
- Inventory summary

Backups intentionally exclude GitHub tokens, environment variables, credentials, browser secrets, unknown local storage keys, build output, dependency caches, and live GitHub history beyond saved repo bindings and captured Writing context snapshots.

Restore is preview-first and full-replace. Imported backups are validated, normalized through the existing Workspace, Dispatch, Writing, Planning, Reports, Review, Settings, and Sync normalizers, and compared against current local counts before restore. Restore requires the exact typed confirmation `RESTORE ATLAS`.

Data Center does not merge records, write to GitHub, sync to hosted storage, send external data, or change Atlas source-of-truth rules.

## Settings Model

Settings is local-only configuration state under `jamarq-atlas.settings.v1`.

Settings currently stores:

- Device label
- Operator label
- Local-only notes
- Settings schema version
- Last updated timestamp

Settings also displays readiness cards for GitHub, Dispatch, read-only host boundary checks, Writing, Data Center, and Supabase hosted sync. These cards describe whether local boundaries are available, missing, stubbed, or local-only. They do not execute automation or change Atlas data.

Settings must not store GitHub tokens, AI keys, deployment credentials, environment variables, or browser secrets. Future provider configuration should keep secrets in server-side environment variables or a dedicated secure backend, not browser local storage.

## Sync Model

Sync is stored under `jamarq-atlas.sync.v1`.

Current Sync is manual and snapshot-based. It supports:

- Manual local snapshots.
- Snapshot inventory.
- Snapshot restore preview.
- Typed-confirmation snapshot restore.
- Snapshot deletion.
- Optional Supabase hosted snapshot push.
- Optional Supabase hosted snapshot listing and preview.
- Typed-confirmation restore from a remote snapshot.
- Remote/local snapshot comparison by fingerprint, counts, created date, and device label.
- Explicit remote snapshot deletion.

Snapshots contain Workspace, Dispatch, Writing, Planning, Reports, and Review only. They intentionally exclude Settings, Sync, secrets, unknown local storage keys, and full live GitHub history to avoid recursive snapshots and credential leakage.

Snapshot restore replaces Workspace, Dispatch, Writing, Planning, Reports, and Review only. It does not merge records, alter Settings, change Sync provider configuration, or make source-of-truth decisions.

Hosted sync runs through the local `/api/sync` boundary:

- `/api/sync/status`
- `/api/sync/push`
- `/api/sync/remote-snapshots`
- `/api/sync/remote-snapshots/:id`
- `DELETE /api/sync/remote-snapshots/:id`

Supabase credentials are read only by server-side middleware from `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `ATLAS_SYNC_WORKSPACE_ID`. Missing configuration becomes a scoped not-configured state; it does not break Board, Dispatch, GitHub, Verification, Writing, Data Center, or local snapshots.

Remote inventory is limited to the latest 50 snapshots in this phase. Restore previews warn about empty incoming stores, same-fingerprint restores, and count drops. These warnings do not block manual restore when the typed confirmation is present.

## Validation

Run the full local check set before merging functional changes:

```sh
npm run lint
npm run build
npm run test:unit
npm run test:e2e
```

The app must continue to run without GitHub credentials.
