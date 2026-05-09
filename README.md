# JAMARQ Atlas

JAMARQ Atlas is a local-first operator dashboard for organizing open work across client websites, software suites, experiments, business infrastructure, and outlier repositories.

The first version is intentionally simple: a React/Vite app with a typed seed workspace, editable manual operational fields persisted in local storage, mock activity, and clear service boundaries for future GitHub and AI writing assistance.

## Stack

- React + TypeScript for a modular app shell.
- Vite for a small local development loop.
- Local storage for the MVP persistence layer.
- A Node GitHub ingestion script for optional read-only activity snapshots.
- No backend, database, auth, or hosted AI dependency in the first pass.

This fits the MVP because Atlas needs a durable data shape and useful operator surface before it needs shared accounts or automation.

## Run Locally

```sh
npm install
npm run dev
```

Build and lint:

```sh
npm run build
npm run lint
```

Optional GitHub ingestion:

```sh
GITHUB_TOKEN=ghp_your_token GITHUB_OWNER=jmars319 npm run ingest:github
```

To restrict ingestion to explicit repositories:

```sh
GITHUB_TOKEN=ghp_your_token GITHUB_REPOS=jmars319/JAMARQ-Atlas,jmars319/another-repo npm run ingest:github
```

The script writes a raw snapshot to `src/data/github/github-snapshot.json`. The app does not require this file to contain live data.

## Architecture

Atlas separates operational interpretation from raw activity.

- `src/domain/atlas.ts` defines the core model: workspace, section, project group, project, status, manual operational state, repository links, and activity events.
- `src/data/seedWorkspace.ts` contains the local seed workspace with Client Systems, VaexCore, Tenra, JAMARQ, and Outliers.
- `src/hooks/useLocalWorkspace.ts` persists edited manual state to local storage.
- `src/components/Dashboard.tsx` renders the portfolio dashboard, filters, section groups, and project rows.
- `src/components/ProjectDetail.tsx` renders the project detail view and editable operational header.
- `src/components/ActivityFeed.tsx` renders raw activity without interpreting it as priority or status.
- `src/services/githubIntegration.ts` documents the GitHub ingestion contract used by `scripts/ingest-github.mjs`.
- `src/services/aiWritingAssistant.ts` creates reviewable writing prompts only.

## Operational Model

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

Raw activity is separate:

- Commits
- Pull requests
- Issues
- Releases
- Workflow runs
- Deployments
- Manual notes and decisions

GitHub and deployment tools can explain what happened. Atlas records what that means operationally only when a human writes or edits that interpretation.

## Statuses

Atlas currently supports:

- Inbox
- Planned
- Active
- Waiting
- Verification
- Stable
- Deferred
- Not Doing
- Archived

## AI Guardrails

AI is limited to writing assistance. The current MVP only generates prompt drafts for future AI use.

Allowed AI-supported actions:

- Summarize recent repo activity.
- Draft release notes.
- Draft client update notes.
- Summarize what changed recently.
- Rewrite rough notes into clean operational language.
- Generate a Codex handoff summary.

Not allowed:

- Deciding status.
- Deciding priority.
- Deciding risk.
- Deciding roadmap.
- Deciding what should be done.
- Automatically changing manual operational fields.

## GitHub Integration Boundary

`scripts/ingest-github.mjs` can fetch:

- Repositories
- Recent commits
- Pull requests
- Issues
- Releases
- Workflow runs

The ingestion output is raw cached data. It should later be mapped into project activity through a deliberate import layer, not used to overwrite manual status.

## Next Steps

1. Map GitHub snapshot entries into project activity by repository binding.
2. Add a controlled import review screen before activity becomes visible in a project.
3. Add export/import for the local workspace JSON.
4. Add hosted persistence only after the manual model is stable.
5. Add a real AI writing provider behind the existing prompt boundary.
6. Add client update and release note templates.
7. Add verification cadence views by section and status.
