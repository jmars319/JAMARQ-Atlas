# JAMARQ Atlas System Overview

Atlas is a local-first operator dashboard for understanding open work across JAMARQ client systems, software suites, experiments, internal infrastructure, and outlier repositories.

## Current Reality

Atlas is a working MVP. It is intentionally simple: React, Vite, TypeScript, local storage, optional read-only GitHub data, and a clear service boundary for future AI writing assistance and deployment automation.

The app has two main surfaces:

- Board: human-authored operational status across sections, groups, and projects.
- GitHub Intake: repository discovery, binding, and explicit Inbox project creation.
- Verification Center: cadence-based manual review queues and verification audit events.
- Dispatch: deployment posture across configured targets.

The important rule is separation. Atlas records manual intent. GitHub and Dispatch provide signals. AI can draft words for review. None of those systems automatically decide status, priority, risk, roadmap, or what should ship.

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
- Deployment runner phase
- Deployment runner result

Dispatch references Atlas projects by `projectId`. It does not mutate Atlas project status.

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

## Validation

Run the full local check set before merging functional changes:

```sh
npm run lint
npm run build
npm run test:unit
npm run test:e2e
```

The app must continue to run without GitHub credentials.
