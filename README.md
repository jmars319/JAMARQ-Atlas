# JAMARQ Atlas

JAMARQ Atlas is a local-first operator dashboard for mapping open work across client systems, software suites, experiments, business infrastructure, and outlier repositories.

Atlas is not a replacement for GitHub, deployment dashboards, or human judgment. GitHub can show what happened. Atlas keeps the operational interpretation separate: status, next action, blockers, risk, deferred work, decisions, and verification state.

Atlas Dispatch extends that model for deployment readiness. Atlas maps work. Dispatch tracks whether a project can be safely shipped. Humans decide what ships.

## Current Reality

This is a working local-first MVP, not a placeholder. It runs as a React/Vite app, stores manual workspace state in browser local storage, and keeps GitHub access behind the local Vite server so tokens stay out of browser code.

The dashboard currently supports:

- Board-level review of sections, project groups, and projects.
- Project detail pages for status, next action, blockers, deferred work, not-doing items, notes, decisions, and last verification.
- GitHub Intake for discovering repositories, binding them to Atlas projects, and creating explicit Inbox records from unbound repos.
- Optional read-only GitHub panels for bound repository activity.
- Verification Center for cadence-based manual review queues and verification audit notes.
- Atlas Dispatch for deployment target posture, readiness notes, health check signals, rollback posture, and deployment history.
- AI Writing Workbench for local draft packets, review notes, client updates, release notes, weekly summaries, and Codex handoffs. AI does not decide status, priority, risk, roadmap, verification, or deployment readiness.

No hosted production URL is configured yet. Run the app locally until a deployment target is intentionally added.

## What This Repo Contains

- React dashboard and project detail surfaces.
- Local seed data for the initial Atlas sections and Dispatch targets.
- Separate local storage hooks for workspace state and Dispatch state.
- Optional GitHub REST integration through `/api/github`.
- Repository binding/import helpers that persist repo links only.
- Verification cadence helpers and manual verification audit events.
- Dispatch domain models, readiness evaluation, health-check stubs, and safe no-op runner phases.
- Separate local writing draft storage, writing templates, context snapshots, and provider stubs.
- Unit and Playwright smoke tests for the main operator flows.

## Tech Stack

- React + TypeScript for the dashboard and detail surfaces.
- Vite for the local app and local `/api/github` boundary.
- Local storage for manual workspace edits and separate Dispatch state.
- Server-side environment variables for GitHub tokens.
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

Each resource reports its own permission or availability problem. If a token can read commits but not Actions, the commits tab still works and the Actions tab reports the permission gap.

GitHub Intake supports two read-only inventory sources:

- Configured repos from `GITHUB_REPOS`.
- Viewer repos from the authenticated token when `/user/repos` is available.

Atlas stores only the resulting project repository bindings or explicitly created Inbox projects. It does not mirror full GitHub history into local storage.

The older `npm run ingest:github` snapshot command remains available for raw cache experiments, but the app now uses `/api/github` for interactive read-only views.

## Atlas Dispatch

Dispatch tracks deployment posture without executing deployments. Dispatch data is stored separately from Atlas workspace state under `jamarq-atlas.dispatch.v1`.

Current Dispatch data:

- Deployment targets and environments.
- Host type and placeholder host/path configuration.
- Public URL and health check URLs.
- Deployment notes, blockers, and target notes.
- Last deployed and last verified dates.
- Deployment records and health check results.
- Rollback reference and database backup reference.
- Backup-required and destructive-confirmation-required flags.
- Advisory readiness blockers and warnings.

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
- SSH/SFTP.
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

Writing turns Atlas project context into reviewable local draft packets. It is currently stub-first: no OpenAI key, provider call, or external AI request is required.

First-class templates:

- Client update
- Release notes
- Weekly change summary
- Codex handoff

Each draft stores:

- Editable draft text.
- The prompt packet that could be sent to a future provider.
- A short context snapshot from Atlas manual fields, activity, verification, Dispatch posture, and optional GitHub snippets.
- Review status, review notes, and timestamps.

Writing state is stored separately under `jamarq-atlas.writing.v1`. Drafts reference projects by `projectId` and do not mutate workspace state.

The provider boundary is intentionally a no-op stub. It returns structured not-configured/stub results so a real provider can be added later without changing the human-review workflow.

## Documentation

Start here:

- `docs/SYSTEM_OVERVIEW.md`

Focused references:

- `docs/GITHUB_INTEGRATION.md`
- `docs/DISPATCH.md`
- `docs/AI_WRITING.md`

## Architecture

Atlas separates manual intent from raw activity.

- `src/domain/atlas.ts` defines workspace, section, group, project, manual state, repository links, and activity events.
- `src/domain/dispatch.ts` defines Dispatch targets, statuses, records, readiness, health checks, and runner results.
- `src/domain/writing.ts` defines Writing templates, drafts, context snapshots, provider results, and local workbench state.
- `src/hooks/useLocalDispatch.ts` persists Dispatch state separately under `jamarq-atlas.dispatch.v1`.
- `src/hooks/useLocalWriting.ts` persists Writing state separately under `jamarq-atlas.writing.v1`.
- `src/components/DispatchDashboard.tsx` renders deployment readiness cards across projects.
- `src/components/DispatchPanel.tsx` renders project-level Dispatch target details and editable manual fields.
- `server/githubApi.ts` normalizes GitHub REST responses and maps permission/rate-limit/not-found errors.
- `src/components/Dashboard.tsx` renders the compact status board.
- `src/components/GitHubIntakeDashboard.tsx` renders repository discovery, binding, and explicit Inbox import.
- `src/components/VerificationCenter.tsx` renders cadence-based verification queues and due-state filters.
- `src/components/WritingWorkbench.tsx` renders local writing draft creation, editing, review state, and draft history.
- `src/components/ProjectDetail.tsx` renders manual operational fields, GitHub activity, mock/manual activity, verification, and Writing launchers.
- `src/components/RepoActivityPanel.tsx` renders GitHub tabs, pagination, resource errors, and advisory signals.
- `src/services/repoBinding.ts` binds, unbinds, dedupes, and explicitly creates Inbox projects from GitHub repositories.
- `src/services/verification.ts` evaluates verification due state, normalizes cadence defaults, and records manual verification events.
- `src/services/dispatchReadiness.ts` evaluates Dispatch readiness as advisory output only.
- `src/services/dispatchHealthChecks.ts` contains a read-only health check probing stub.
- `src/services/dispatchRunner.ts` contains safety-stub runner phases for future automation.
- `src/services/automationSignals.ts` generates non-decision signals such as failed workflows, commits since verification, stale PRs, and permission gaps.
- `src/services/aiWritingAssistant.ts` creates Writing context snapshots, prompt packets, and local template drafts.
- `src/services/writingProvider.ts` contains the no-op future AI provider boundary.

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
- Optional GitHub snippets are included as context only and are not mirrored as full history.
- The provider boundary is stubbed; no external AI request is made in this implementation.

Verification activity is advisory/manual:

- Cadence queues do not change status.
- Overdue verification does not change risk.
- Marking verified does not mark a project stable.
- GitHub and Dispatch signals do not verify a project automatically.

Dispatch activity is advisory:

- Readiness does not change Atlas status.
- Health checks do not mark a project stable.
- Backup warnings do not change priority.
- Deployment records do not decide what should ship.

Dispatch safety rules:

- Production database imports/restores require explicit typed confirmation.
- Production file overwrites require a verified backup first.
- phpMyAdmin should not be automated directly.
- Future cPanel/GoDaddy support should prefer SSH/SFTP, `mysqldump`/`mysql`, and cPanel API where appropriate.
- No destructive operation exists in the current implementation.

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

1. Add hosted persistence only after the manual model is stable.
2. Add a real AI writing provider behind the current stub boundary.
3. Add export/copy workflows for approved writing drafts.
4. Expand GitHub Intake with optional repo grouping suggestions for human review.
5. Replace Dispatch runner stubs with safe preflight-only checks before any write-capable deployment work.
