# CI/CD pipeline and release gates (Phase 1)

This project uses GitHub Actions to gate merges and releases through deterministic checks and artifact builds.

## Branch and merge flow

- Feature branches open PRs into `dev` / `preview` / `main` / `insider` as needed.
- `squad-ci.yml` runs on PR updates and must pass before merge.
- `squad-promote.yml` is the controlled promotion path:
  - `dev` → `preview`
  - `preview` → `main`
- `squad-preview.yml` validates preview branch release readiness.
- `squad-release.yml` runs on `main` and publishes or updates a GitHub release tag from `package.json` version.

## Required CI quality gates

`Squad CI` enforces:

1. Deterministic dependency install with `pnpm install --frozen-lockfile`
2. Workspace `lint`
3. Workspace `test`
4. Workspace `build`
5. API container build (`infra/docker/api.Dockerfile`)
6. Customer portal container build (`infra/docker/customer-portal.Dockerfile`)

Any failing gate blocks merge.

## Reviewer release gate (mandatory)

For any change that impacts user flow, Bishop (reviewer) must execute Playwright scenario coverage and attach findings before approval.

Minimum reviewer checklist:

- Confirm CI checks are green on the PR.
- Run Playwright flow(s) for impacted user journeys.
- Record pass/fail evidence in PR review.
- Reject PR if behavior diverges from acceptance criteria.
