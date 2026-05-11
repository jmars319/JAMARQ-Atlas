# JAMARQ Atlas System Overview

Atlas is a local-first operator dashboard for understanding open work across JAMARQ client systems, software suites, experiments, internal infrastructure, and outlier repositories.

## Current Reality

Atlas is a working MVP. It is intentionally simple: React, Vite, TypeScript, local storage, optional read-only GitHub data, and a clear service boundary for future AI writing assistance and deployment automation.

The app has these main surfaces:

- Board: human-authored operational status across sections, groups, and projects.
- GitHub Intake: repository discovery, binding, and explicit Inbox project creation.
- Verification Center: cadence-based manual review queues and verification audit events.
- Dispatch: deployment posture and read-only preflight evidence across configured targets.
- Writing Workbench: local draft packets and reviewable operational writing.
- Data Center: local backup export, restore preview, and typed-confirmation restore.
- Settings & Connections: local workspace identity and integration-readiness status.
- Sync Snapshots: manual local snapshots for future hosted persistence.

The important rule is separation. Atlas records manual intent. GitHub and Dispatch provide signals. Writing can draft words for review. None of those systems automatically decide status, priority, risk, roadmap, verification, readiness, or what should ship.

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
- Deployment runner phase
- Deployment runner result

Dispatch references Atlas projects by `projectId`. It does not mutate Atlas project status.

Dispatch Preflight stores short local evidence snapshots under the Dispatch storage key. It checks target configuration, health URLs, backup and rollback posture, and optional GitHub snippets when repo bindings and token permissions allow. Preflight does not create deployment records, update Atlas status, update Dispatch readiness, stamp verification, or decide what should ship.

The local `/api/dispatch/health` boundary performs timeout-bound read-only `http`/`https` probes without credentials or request bodies. Browser code receives normalized health results, so CORS and network failures are displayed as scoped evidence instead of breaking the app.

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

Permission gaps are resource-local. If a token can read commits but cannot read Actions, the commits panel still works and the Actions panel reports the permission gap.

GitHub Intake persists only Atlas decisions: repository bindings and explicitly created Inbox projects. It does not store full commit, PR, workflow, issue, release, deployment, or check history.

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
- Deployment readiness
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

Review, approval, copy, export, and archive actions append Writing-only audit events under the Writing storage key. They do not append Atlas project activity events.

The provider boundary is stubbed. Current drafts are local template scaffolds plus prompt packets. No external AI request is made, and drafts do not mutate project status, risk, blockers, next action, verification, Dispatch readiness, or GitHub bindings.

Markdown export is local/browser-only. Export packets include draft text, metadata, review status, context warnings, source context summary, guardrails, review audit, and an optional prompt-packet appendix. Export does not imply that anything was sent, published, deployed, shipped, or verified.

## Data Portability Model

Data Center exports and restores Atlas local stores without adding hosted persistence.

The backup envelope contains:

- Workspace store
- Dispatch store
- Writing store
- Settings store
- Sync store
- Schema version
- Export timestamp
- Inventory summary

Backups intentionally exclude GitHub tokens, environment variables, credentials, browser secrets, unknown local storage keys, build output, dependency caches, and live GitHub history beyond saved repo bindings and captured Writing context snapshots.

Restore is preview-first and full-replace. Imported backups are validated, normalized through the existing Workspace, Dispatch, Writing, Settings, and Sync normalizers, and compared against current local counts before restore. Restore requires the exact typed confirmation `RESTORE ATLAS`.

Data Center does not merge records, write to GitHub, sync to hosted storage, send external data, or change Atlas source-of-truth rules.

## Settings Model

Settings is local-only configuration state under `jamarq-atlas.settings.v1`.

Settings currently stores:

- Device label
- Operator label
- Local-only notes
- Settings schema version
- Last updated timestamp

Settings also displays readiness cards for GitHub, Dispatch, Writing, Data Center, and future Sync. These cards describe whether local boundaries are available, missing, stubbed, or local-only. They do not execute automation or change Atlas data.

Settings must not store GitHub tokens, AI keys, deployment credentials, environment variables, or browser secrets. Future provider configuration should keep secrets in server-side environment variables or a dedicated secure backend, not browser local storage.

## Sync Model

Sync is stored under `jamarq-atlas.sync.v1`.

Current Sync is local-only and manual. It supports:

- Manual local snapshots.
- Snapshot inventory.
- Snapshot restore preview.
- Typed-confirmation snapshot restore.
- Snapshot deletion.
- Provider-ready push/pull stubs that return `not-configured`.

Snapshots contain Workspace, Dispatch, and Writing only. They intentionally exclude Settings, Sync, secrets, unknown local storage keys, and full live GitHub history to avoid recursive snapshots and credential leakage.

Snapshot restore replaces Workspace, Dispatch, and Writing only. It does not merge records, alter Settings, change Sync provider configuration, or make source-of-truth decisions.

## Validation

Run the full local check set before merging functional changes:

```sh
npm run lint
npm run build
npm run test:unit
npm run test:e2e
```

The app must continue to run without GitHub credentials.
