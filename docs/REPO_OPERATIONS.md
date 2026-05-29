# Repo Operations

Atlas Repos is the safe command center for repository and workflow interpretation.

## Sources

- The central registry remains the repo universe source of truth.
- Repo Operations Snapshot v1 imports registry-derived repo metadata into Atlas.
- Existing GitHub and local Git APIs supply activity, local clone, and workflow evidence when configured.
- Repo workflow runs store local command status, timestamps, exit codes, redacted output excerpts, and Planning links.
- Planning records are the local evidence trail for repo follow-up.

## Guardrails

Atlas Repos can run only allowlisted local workflow commands:

- `git fetch --prune`
- `git pull --ff-only`, only when the clone is clean, has an upstream, and the operator types `PULL owner/repo`
- repo-owned verification/build commands imported from the Repo Operations Snapshot, limited to safe `npm`, `pnpm`, `mise exec --`, `cargo`, `composer`, and `git diff --check` forms

Atlas does not commit, push, branch, reset, checkout, stash, delete files, force push, run arbitrary shell commands, mutate registries, or edit lifecycle metadata from this surface.

## Operator Flow

1. Load the default snapshot from `agentic-instructions/docs/repo-operations-atlas.json`, or import a Repo Operations Snapshot v1 JSON file manually.
2. Review registry, local Git, GitHub, and verification lanes.
3. Run allowlisted fetch, fast-forward pull, or verification commands where the local clone is configured.
4. Filter for dirty clones, behind upstream, missing local clones, missing GitHub binding, missing verification commands, failed runs, stale verification, never-run verification, and missing Planning follow-up.
5. Create a Planning note or work session for failed or stale repo follow-up when a bound Atlas project exists.
