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
2. Committed root `pnpm-lock.yaml` is required (missing/untracked lockfile fails the gate)
3. Workspace `lint`
4. Workspace `test`
5. Workspace `build`
6. API container build (`infra/docker/api.Dockerfile`)
7. Customer portal container build (`infra/docker/customer-portal.Dockerfile`)

Any failing gate blocks merge.

## Reviewer release gate (mandatory)

For any change that impacts user flow, Bishop (reviewer) must execute Playwright scenario coverage and attach findings before approval.

Minimum reviewer checklist:

- Confirm CI checks are green on the PR.
- Run Playwright flow(s) for impacted user journeys.
- Record pass/fail evidence in PR review.
- Reject PR if behavior diverges from acceptance criteria.

## Mobile store release gates (Agent app)

For App Store / Google Play release candidates, the following gates must be green in addition to CI:

1. `apps/agent-mobile` lint/test/build pass.
2. EAS preview builds pass on both platforms:
   - `pnpm --filter @awawda/agent-mobile eas:build:preview:ios`
   - `pnpm --filter @awawda/agent-mobile eas:build:preview:android`
3. EAS production builds pass on both platforms:
   - `pnpm --filter @awawda/agent-mobile eas:build:production:ios`
   - `pnpm --filter @awawda/agent-mobile eas:build:production:android`
4. Store metadata and legal links are present (privacy policy, support URL, screenshots).
5. Final bundle identifiers / package names are validated against organization-owned store apps.
6. Release sign-off includes a documented go/no-go on `docs/mobile-store-release-readiness.md`.
