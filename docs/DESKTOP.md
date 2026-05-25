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

The first macOS package is ad-hoc signed for local launch and bundle validation only. Apple Developer ID signing and notarization are not configured.

Future Windows and Linux package makers are scaffolded for Forge:

```sh
npm run desktop:make:windows
npm run desktop:make:linux
```

Those targets are configuration-ready, but only macOS packaging is verified from this Mac checkout.

## Local Data

Desktop Atlas stores operational state in SQLite:

```text
~/Library/Application Support/jamarq-atlas/atlas.sqlite
```

The SQLite database stores the same Atlas document stores previously kept in browser `localStorage`: Workspace, Dispatch, Writing, Planning, Reports, Review, Calibration, Optimization, Settings, and Sync metadata. Data Center JSON backups and restore previews still use the same backup envelope and exclude secrets.

The Vite browser harness still uses browser `localStorage`. On first desktop launch, Atlas scans common Chromium profile LevelDB locations for Atlas `jamarq-atlas.*.v1` localStorage stores and imports the fullest valid source into SQLite. It imports only known Atlas operational stores, never cookies, OAuth tokens, unknown localStorage keys, or browser profile secrets, and it does not overwrite existing SQLite rows.

Manual migration remains available through Data Center: export a JSON backup from Data Center in browser mode and restore it in the desktop app after reviewing the restore preview.

## Local Config And Secrets

Desktop Atlas reads optional local config from:

```text
~/Library/Application Support/jamarq-atlas/atlas.env
```

During development it also reads the repository `.env`; shell environment values win over both files, and `atlas.env` overrides repo `.env` for non-shell values. For the packaged local app, copy existing repo `.env` values into `atlas.env` because the package does not read the source checkout.

Keep optional credentials in local env/config only. GitHub OAuth tokens are encrypted with Electron `safeStorage`, backed by macOS Keychain when available, and stored in SQLite as encrypted secure items. They are not included in Atlas backup exports.

## GitHub OAuth Callback

Desktop Atlas starts a loopback API server on `127.0.0.1`. By default it tries port `52173`; set `ATLAS_DESKTOP_API_PORT=0` for tests or another port if needed. If `ATLAS_DESKTOP_API_PORT` is unset and `GITHUB_APP_CALLBACK_URL` is already configured with a loopback callback, Atlas uses that callback port so an existing GitHub App callback such as `http://127.0.0.1:5173/api/github/auth/callback` can continue to work.

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
npm run desktop:verify:bundle
```

`npm run test:desktop` builds the Electron app and runs Playwright Electron smoke tests for launch, core views, SQLite-backed Settings persistence, and missing optional credential states. `npm run verify:desktop` runs the full browser and desktop chain, makes the macOS package, and verifies the ad-hoc signed app bundle with `codesign --verify --deep --strict`.
