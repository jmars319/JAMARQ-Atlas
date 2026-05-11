# Atlas Sync Foundation

Atlas Sync is currently a local-only snapshot foundation for future hosted persistence.

It does not add accounts, cloud storage, external writes, background sync, or merge behavior.

## Current Scope

Sync supports:

- Manual local snapshots.
- Snapshot inventory.
- Snapshot restore preview.
- Full local snapshot restore after typed confirmation.
- Snapshot deletion after explicit confirmation.
- Provider-ready no-op push/pull results.

Sync state is stored under `jamarq-atlas.sync.v1`.

## Snapshot Contents

Snapshots include normalized copies of:

- Workspace
- Dispatch
- Writing

Snapshots do not include:

- Settings
- Sync state
- GitHub tokens
- AI keys
- Deployment credentials
- Environment variables
- Unknown localStorage keys
- Full live GitHub history

This avoids recursive snapshots and keeps future hosted sync focused on Atlas operational data.

## Restore Behavior

Snapshot restore is preview-first and full-replace for Workspace, Dispatch, and Writing only.

Restore requires the exact typed confirmation `RESTORE ATLAS`.

Snapshot restore does not change Settings, Sync provider configuration, or snapshot inventory.

## Provider Boundary

The current provider is local-only. Future push/pull hooks return structured `not-configured` results and perform no external reads or writes.

Hosted persistence should plug in behind this boundary later, after data portability and local restore behavior remain stable.

## Guardrails

- No automatic sync.
- No merge.
- No GitHub writes.
- No AI provider calls.
- No deployment writes.
- No automatic Atlas status, risk, readiness, verification, binding, or Writing review-state changes.
