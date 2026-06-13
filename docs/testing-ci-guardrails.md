# Testing And CI Guardrails

- Test IDs use lowercase kebab-case, for example `github-repo-card`.
- E2E-created local records should use an obvious fixture prefix and register cleanup in `finally`.
- Playwright `.first()` is allowed only with a nearby `selector-intentional-first` comment explaining why a business selector is not available.
- Browser tests use the local Vite base URL. A direct production URL in browser navigation needs a `production-url-intentional` comment.
- Smoke routes are listed in `tests/smoke-routes.json`.
- Playwright reports, traces, screenshots, videos, and blob reports are ignored artifacts.
- Accessibility checks should use the shared local baseline helper and fail on `critical` and `serious` automated findings.
