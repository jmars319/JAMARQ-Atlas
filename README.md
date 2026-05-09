# JAMARQ Atlas

JAMARQ Atlas is a local-first operator dashboard for organizing open work across client websites, software suites, experiments, business infrastructure, and outlier repositories.

Atlas is not a replacement for GitHub, deployment dashboards, or human judgment. GitHub can show what happened. Atlas keeps the manual operational interpretation separate: status, next action, blockers, risk, deferred work, decisions, and verification state.

## Stack

- React + TypeScript for the dashboard and detail surfaces.
- Vite for the local app and local `/api/github` boundary.
- Local storage for manual workspace edits.
- Server-side environment variables for GitHub tokens.
- JAMARQ Digital brand system: JAMARQ Black `#0D0D0F`, Accent Cyan `#09A6D6`, steel/slate/mist neutrals, Montserrat headings, Inter body.

## Run Locally

```sh
npm install
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
GITHUB_TOKEN=ghp_your_token GITHUB_REPOS=jmars319/JAMARQ-Atlas npm run dev
```

Supported env vars:

- `GITHUB_TOKEN` or `GH_TOKEN`: read-only GitHub token.
- `GITHUB_REPOS`: comma-separated configured repositories.
- `GITHUB_OWNER`: optional owner fallback for repo names that omit `owner/`.

The UI fetches the latest 20 records by default and uses pagination for more history. Full commit history does not need to be permanently stored locally.

Supported GitHub resources:

- Repository overview
- Commits
- Pull requests
- Issues
- Workflow runs
- Workflow definitions
- Releases
- Deployments
- Check runs

Each resource reports its own permission or availability problem. If a token can read commits but not Actions, the commits tab still works and the Actions tab reports the permission gap.

The older `npm run ingest:github` snapshot command remains available for raw cache experiments, but the app now uses `/api/github` for interactive read-only views.

## Architecture

Atlas separates manual intent from raw activity.

- `src/domain/atlas.ts` defines workspace, section, group, project, manual state, repository links, and activity events.
- `server/githubApi.ts` normalizes GitHub REST responses and maps permission/rate-limit/not-found errors.
- `src/components/Dashboard.tsx` renders the compact status board.
- `src/components/ProjectDetail.tsx` renders manual operational fields, GitHub activity, mock/manual activity, verification, and AI writing prompts.
- `src/components/RepoActivityPanel.tsx` renders GitHub tabs, pagination, resource errors, and advisory signals.
- `src/services/automationSignals.ts` generates non-decision signals such as failed workflows, commits since verification, stale PRs, and permission gaps.
- `src/services/aiWritingAssistant.ts` creates reviewable writing prompts only.

## Operational Rules

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
- AI output is draft text only.

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

## Next Steps

1. Add a repo binding/import screen so configured GitHub repos can be attached to Atlas projects from the UI.
2. Add hosted persistence only after the manual model is stable.
3. Add a real AI writing provider behind the current prompt boundary.
4. Add client update and release note templates.
5. Add verification cadence views by section and status.
