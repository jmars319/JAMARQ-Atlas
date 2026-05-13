# Atlas Reports

Reports is the local packet builder for human-reviewed Atlas updates. It assembles Markdown from existing Atlas context but does not publish, send, deploy, verify, or change operational state.

## Packet Types

Supported report packet types:

- Client update packet
- Internal weekly packet
- Release packet
- Project handoff packet
- Deployment readiness packet
- Post-deploy verification packet
- Client site update packet
- Internal deploy handoff packet

## Included Context

Report packets can include:

- Approved or exported Writing drafts.
- Project manual status, next action, current risk, and last verified date.
- Verification due state.
- Dispatch target count and warning/blocker posture.
- cPanel runbook summaries, artifact readiness, preserve paths, and verification checks.
- Stored host evidence and runbook verification evidence.
- Deploy-session linked evidence and manual deployment record references.
- Planning records linked to included projects.
- Repository bindings, GitHub health/deploy-delta summary references, and any GitHub context captured inside selected Writing drafts.

Reports do not fetch or store full GitHub history. They use local Atlas data and short already-captured snippets.

## Storage

Reports are stored separately under `jamarq-atlas.reports.v1`.

Stored data includes:

- Packet title, type, status, Markdown body, timestamps, and source summary.
- Included project IDs and Writing draft IDs.
- Context warnings.
- Report-only audit events.

Reports do not mutate Workspace, Dispatch, Writing, Planning, Verification, GitHub bindings, Settings, or Sync stores.

Dispatch evidence in reports is copied from existing local evidence history. Report creation does not run checks, attach evidence to sessions, create deployment records, or mark anything verified.

## Export Behavior

Current export actions are local/browser-only:

- Copy Markdown to clipboard.
- Download Markdown packet.

Exporting a report does not prove that a client update was sent, a release was published, work was shipped, or verification was completed.

Deployment report export also does not prove Atlas deployed anything. Stored host evidence, runbook verification evidence, deploy-session notes, and manual deployment record references remain advisory/operator evidence.

## Guardrails

Reports must not:

- Change Atlas project status.
- Change risk, blockers, next action, roadmap, or verification.
- Change Dispatch readiness or deployment status.
- Change GitHub bindings.
- Change Planning records.
- Change Writing draft review state.
- Send email, publish to Docs/Notion/Slack, or write to GitHub.

Future external publishing integrations should require explicit human confirmation and should record publishing state separately from operational truth.
