# Atlas Desktop App

Atlas runs as a local macOS desktop app through Electron. The Vite browser app remains available as a development and CI harness.

## Daily Desktop Use

```sh
npm run desktop:dev
```

Packaged local build:

```sh
npm run desktop:make
open "out/make/zip/darwin/arm64"
```

The first macOS package is unsigned and local-only. Apple Developer signing and notarization are not configured.

## Local Data

Desktop Atlas stores operational state in SQLite:

```text
~/Library/Application Support/JAMARQ Atlas/atlas.sqlite
```

The SQLite database stores the same Atlas document stores previously kept in browser `localStorage`: Workspace, Dispatch, Writing, Planning, Reports, Review, Calibration, Optimization, Settings, and Sync metadata. Data Center JSON backups and restore previews still use the same backup envelope and exclude secrets.

The Vite browser harness still uses browser `localStorage`. To move existing browser data into the desktop app, export a JSON backup from Data Center in browser mode and restore it in the desktop app after reviewing the restore preview.

## Local Config And Secrets

Desktop Atlas reads optional local config from:

```text
~/Library/Application Support/JAMARQ Atlas/atlas.env
```

During development it also reads the repository `.env`; shell environment values win over both files, and `atlas.env` overrides repo `.env` for non-shell values.

Keep optional credentials in local env/config only. GitHub OAuth tokens are encrypted with Electron `safeStorage`, backed by macOS Keychain when available, and stored in SQLite as encrypted secure items. They are not included in Atlas backup exports.

## GitHub OAuth Callback

Desktop Atlas starts a loopback API server on `127.0.0.1`. By default it tries port `52173`; set `ATLAS_DESKTOP_API_PORT=0` for tests or another port if needed.

For GitHub App sign-in, configure the callback URL to match the desktop API port:

```text
http://127.0.0.1:52173/api/github/auth/callback
```

If the configured port is already in use, Atlas falls back to a random local port. GitHub OAuth then requires the callback to be updated or the port conflict resolved.

## Verification

```sh
npm run lint
npm run build
npm run test:unit
npm run test:e2e
npm run test:desktop
npm run desktop:make
```

`npm run test:desktop` builds the Electron app and runs Playwright Electron smoke tests for launch, core views, SQLite-backed Settings persistence, and missing optional credential states.
