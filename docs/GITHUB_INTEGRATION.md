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

GitHub Intake also includes a repo deep-dive panel so an operator can inspect one selected repository without opening every project detail panel.

## Supported Resources

Atlas can request:

- Repository inventory from configured repos.
- Repository inventory from viewer-accessible repos.
- Repository overview
- Commits
- Pull requests
- Issues
- Workflow runs
- Workflow definitions
- Releases
- Deployments
- Check runs
- Branches
- Tags

The UI loads the most recent records first and supports pagination where available. Full commit history does not need to be permanently stored in local state.

## GitHub Intake

GitHub Intake is the repository discovery and binding surface.

It reads from two sources:

- `source=configured`: repositories listed in `GITHUB_REPOS`.
- `source=viewer`: repositories available to the authenticated token through GitHub's viewer repository endpoint.

Intake actions are local Atlas actions only:

- Bind a repo to an existing Atlas project.
- Unbind a repo from a project.
- Create an explicit Inbox project from an unbound repo.
- Open the repository on GitHub.

The deep-dive panel can show overview, commits, PRs, issues, workflow runs, workflows, checks, releases, deployments, branches, and tags for the selected repository. Each resource reports its own missing-token, permission, private repo, rate-limit, or unavailable state.

Created Inbox projects are placed under `Outliers / One-off tools` with `kind: "repo"` and `status: "Inbox"`. The imported repository description may seed the summary, but GitHub does not set status, priority, risk, roadmap, or Dispatch readiness.

Atlas persists only repository bindings and explicitly created project records. Commits, pull requests, issues, workflows, releases, deployments, and checks remain live read-only views fetched on demand.

## Repo Health Summaries

Atlas derives read-only repo health cards from the existing GitHub API boundary:

- Latest commit.
- Commits since the project was last verified.
- Commits since the latest Dispatch deployment record.
- Open PR count.
- Open issue count.
- Latest workflow/check result.
- Latest release or deployment signal.
- Scoped permission gaps.

These summaries use the latest loaded GitHub pages and are advisory only. They do not change Atlas project status, Dispatch readiness, Verification, Planning, Writing, Reports, or GitHub bindings.

Project detail pages show a compact deploy-delta summary for the first bound repository. Reports reference the availability of these summaries but do not persist full GitHub history.

## Permission Behavior

GitHub permissions are handled per resource.

Examples:

- Missing token: the GitHub panel shows a missing-token state.
- Viewer inventory unavailable: the GitHub Intake viewer source reports the issue while configured repo handling remains scoped to its own source.
- Insufficient Actions permission: workflow tabs show a permission message.
- Repository not found or unavailable: the affected repo panel reports the issue.
- Rate limit: the affected resource reports the rate-limit state.

These states do not break Atlas, Dispatch, or manual project tracking.

## Operational Rules

- GitHub commits do not change Atlas status.
- Pull requests do not change priority.
- Failed workflows do not change current risk.
- Releases do not mark a project stable.
- Repo binding does not change project status.
- Repo import creates Inbox work only after an explicit human action.
- Permission gaps do not block manual tracking.

GitHub activity may inform a human review. It does not make operational decisions.
