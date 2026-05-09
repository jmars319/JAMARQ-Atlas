# GitHub Integration

Atlas treats GitHub as an activity source, not a decision system.

GitHub can answer what happened. Atlas records what that activity means operationally after human review.

## Configuration

Copy the example environment file and add a read-only token if GitHub panels should load live data:

```sh
cp .env.example .env
```

Supported variables:

- `GITHUB_TOKEN`: preferred GitHub token variable.
- `GH_TOKEN`: fallback token variable.
- `GITHUB_REPOS`: comma-separated `owner/repo` values available to the app.
- `GITHUB_OWNER`: optional fallback owner for repo names without an owner prefix.

The app still runs when these variables are absent.

## Service Boundary

Browser code does not receive GitHub tokens. Requests go through the local Vite API boundary in `server/githubApi.ts`.

The UI consumes normalized resources through `src/components/RepoActivityPanel.tsx` and `src/hooks/useGithubResource.ts`.

## Supported Resources

Atlas can request:

- Repository overview
- Commits
- Pull requests
- Issues
- Workflow runs
- Workflow definitions
- Releases
- Deployments
- Check runs

The UI loads the most recent records first and supports pagination where available. Full commit history does not need to be permanently stored in local state.

## Permission Behavior

GitHub permissions are handled per resource.

Examples:

- Missing token: the GitHub panel shows a missing-token state.
- Insufficient Actions permission: workflow tabs show a permission message.
- Repository not found or unavailable: the affected repo panel reports the issue.
- Rate limit: the affected resource reports the rate-limit state.

These states do not break Atlas, Dispatch, or manual project tracking.

## Operational Rules

- GitHub commits do not change Atlas status.
- Pull requests do not change priority.
- Failed workflows do not change current risk.
- Releases do not mark a project stable.
- Permission gaps do not block manual tracking.

GitHub activity may inform a human review. It does not make operational decisions.
