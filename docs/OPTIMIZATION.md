# Atlas Optimize

Optimize is the local portfolio optimization review surface for JAMARQ Atlas.

It imports registry-generated JSON packets from `agentic-instructions`, stores them locally under `jamarq-atlas.optimization.v1`, and lets the operator review scorecards, priority buckets, critical paths, readiness gaps, consolidation suggestions, reusable patterns, and recommendations.

## Source Of Truth Boundary

Optimize is advisory only.

- `agentic-instructions/docs/repository-registry.json` remains the source of truth for repo lifecycle, deploy model, automation, and security-gate metadata.
- `agentic-instructions/docs/portfolio-optimization-atlas.json` is an optimization snapshot import packet, not a registry replacement.
- Atlas stores imported packets for local review and backup/sync portability.
- Atlas does not decide priority, retire repos, consolidate repos, ship releases, deploy, change Dispatch readiness, change GitHub bindings, or mutate registry state from optimization data.

## Current Workflow

1. Generate or refresh the optimization packet in `agentic-instructions`.
2. Open Atlas and select Optimize.
3. Import the packet JSON.
4. Preview assessment and recommendation counts.
5. Store the snapshot locally.
6. Filter by bucket or search terms.
7. Export the snapshot when needed.
8. Create Planning notes only for recommendations the operator explicitly chooses to track.

## Local Store

Optimization state is stored under `jamarq-atlas.optimization.v1`.

The store contains:

- Schema version.
- Imported optimization snapshots.
- Selected snapshot ID.
- Last updated timestamp.

Snapshots contain:

- Repo-level scorecards.
- Priority buckets.
- Critical path notes.
- Release/readiness notes.
- Observability/recovery gaps.
- UX/product audit notes.
- Consolidation/retirement suggestions.
- Reusable pattern opportunities.
- Advisory recommendations.

The store must not contain credentials, tokens, env vars, registry write state, GitHub write state, deploy state, or production secrets.

## Backup And Sync

Optimization is included in:

- Data Center JSON backups.
- Data Center Markdown inventory reports.
- Manual local Sync snapshots.
- Optional Supabase hosted snapshots.

Restore is preview-first and full-replace with the rest of Atlas data. Restoring Optimization state does not change Workspace status, Planning decisions, Dispatch readiness, GitHub bindings, deployments, or registry lifecycle.

## Planning Notes

Recommendations can create Planning notes for mapped Atlas projects. This is explicit user action.

Creating a Planning note:

- Adds a normal Planning note with a source link to the recommendation.
- Opens the mapped project in Planning.
- Does not change the project status.
- Does not mark a recommendation accepted, completed, or verified.
- Does not change the imported optimization snapshot.

Planning can later promote that note into an objective or work session. Promotion is still manual and keeps links back to both the original note and recommendation.

## Guardrails

Optimize must not:

- Mutate `agentic-instructions`.
- Write to GitHub.
- Deploy anything.
- Merge Dependabot PRs.
- Run cleanup.
- Change registry lifecycle or security-gate fields.
- Archive, delete, consolidate, or retire repositories.
- Treat a score as an automatic priority decision.

Scores are planning context. Humans make the operating decision.
