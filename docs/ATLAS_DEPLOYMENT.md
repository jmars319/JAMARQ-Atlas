# Atlas Deployment Notes

Atlas is currently safest as a local-first desktop operator app. The desktop build is an Electron app that serves the React/Vite UI and local API boundary from `127.0.0.1`, stores Atlas operational data in SQLite, and keeps optional credentials in local config or secure storage. The Vite browser app remains a development and CI harness.

## Build And Validate

Run these checks before publishing an Atlas build:

```sh
npm ci
npm run lint
npm run build
npm run test:unit
npm run test:e2e
npm run test:desktop
npm run desktop:make
```

GitHub Actions runs the same validation on `main` and pull requests through `.github/workflows/ci.yml`.

Recommended local support tools:

- `actionlint` after editing `.github/workflows`.
- `osv-scanner` for advisory checks across dependency manifests and lockfiles.
- `pa11y` and Lighthouse for accessibility and performance checks when UI behavior changes.
- `supabase` for hosted snapshot diagnostics when Sync is configured.

## Local Preview

```sh
npm run build
npm run preview -- --host 127.0.0.1
```

`vite preview` keeps the same local middleware boundary available for optional `/api/github`, `/api/dispatch`, `/api/sync`, and `/api/writing` requests.

## Desktop Package

```sh
npm run desktop:dev
npm run desktop:make
```

The macOS package is local and ad-hoc signed for bundle validation. It is not Developer ID signed or notarized. Desktop Atlas stores operational state at `~/Library/Application Support/jamarq-atlas/atlas.sqlite` and reads optional desktop config from `~/Library/Application Support/jamarq-atlas/atlas.env`. Data Center backups remain JSON exports and do not include encrypted GitHub OAuth tokens or env/config secrets.

## Environment Variables

Atlas runs without optional credentials. Missing configuration should produce scoped UI messages, not app failure.

Optional server-side variables:

- `GITHUB_TOKEN` or `GH_TOKEN`: read-only GitHub token.
- `GITHUB_REPOS`: comma-separated `owner/repo` list.
- `GITHUB_OWNER`: fallback owner for repo names without an owner.
- `SUPABASE_URL`: Supabase project URL for manual hosted snapshots.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only Supabase service role key.
- `ATLAS_SYNC_WORKSPACE_ID`: single-operator hosted snapshot workspace ID.
- `OPENAI_API_KEY`: server-only OpenAI key for draft-only Writing suggestions.
- `OPENAI_MODEL`: optional model name, defaulting to `gpt-5`.
- `ATLAS_HOST_PREFLIGHT_CONFIG`: server-only JSON for read-only host checks.
- `ATLAS_DESKTOP_API_PORT`: optional desktop loopback API port, default `52173`.

Never place GitHub tokens, Supabase service-role keys, OpenAI keys, SFTP passwords, private-key paths, cPanel credentials, or GoDaddy credentials in browser state or committed files.

## Static Hosting

A plain static host can serve the built UI from `dist/`, but optional connector APIs will not work unless a Node/Vite-compatible server also serves the middleware routes. In static-only hosting, Atlas still works for local browser storage, Board, Dispatch records, Review, Planning, Reports, Writing stubs, Data Center, and Settings, but live GitHub, hosted sync, OpenAI generation, and host inspection will show missing/unavailable states.

## Node/Vite-Compatible Hosting

Use a Node-capable host if optional connectors are needed. The server must preserve the Vite middleware in `vite.config.ts` or an equivalent production adapter for:

- `/api/github`
- `/api/dispatch`
- `/api/sync`
- `/api/writing`

Keep environment variables server-side only. Do not expose them through `VITE_*` variables or client bundles.

## Daily Operation

For daily desktop operation:

1. Start Atlas locally with `npm run desktop:dev`.
2. Open Board or Review first to scan human-authored status.
3. Use GitHub, Dispatch, Verification, Timeline, and Sync as advisory signals.
4. Capture manual Review, Planning, Dispatch, Writing, and Report records intentionally.
5. Export a JSON backup or create a Sync snapshot before risky restore testing.

Atlas does not deploy, upload, back up, restore production systems, write to GitHub, send reports, or change status automatically.
