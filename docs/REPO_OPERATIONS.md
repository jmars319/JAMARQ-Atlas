# Repo Operations

Atlas Repos is the read-only command center for repository and workflow interpretation.

## Sources

- The central registry remains the repo universe source of truth.
- Repo Operations Snapshot v1 imports registry-derived repo metadata into Atlas.
- Existing GitHub and local Git APIs supply activity, local clone, and workflow evidence when configured.
- Planning records are the local evidence trail for repo follow-up.

## Guardrails

Atlas does not run Git commands from Repos. It does not commit, push, branch, reset, install dependencies, run tests, run builds, mutate registries, or edit lifecycle metadata from this surface.

Repos may display command strings such as `npm run build` or `pnpm run verify:handoffs`, but those are operator guidance only.

## Operator Flow

1. Import `agentic-instructions/docs/repo-operations-atlas.json`.
2. Review registry, local Git, GitHub, and verification lanes.
3. Filter for dirty clones, behind upstream, missing local clones, missing GitHub binding, missing verification commands, and missing Planning follow-up.
4. Create a Planning note or work session for repo follow-up when a bound Atlas project exists.
5. Resolve work outside Atlas, then refresh GitHub/local evidence or import a refreshed snapshot.
