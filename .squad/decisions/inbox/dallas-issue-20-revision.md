# Dallas Issue 20 Revision Decision Note

## Context
Issue #20 revision was assigned after Bishop rejected PR #31 due to frozen-lockfile gate failure from missing committed `pnpm-lock.yaml`.

## Decision
Treat the lockfile as a required, committed release input:
- remove `pnpm-lock.yaml` from `.gitignore`
- commit the root `pnpm-lock.yaml`
- add explicit workflow checks that fail fast when lockfile is missing or untracked before `pnpm install --frozen-lockfile`

## Rationale
`--frozen-lockfile` is only production-grade when CI always receives the exact lockfile used to resolve dependencies. Failing early with a dedicated check makes root cause obvious and keeps reproducibility auditable.

## Consequences
Any dependency mutation must update and commit `pnpm-lock.yaml`; CI/preview/release gates now enforce this consistently.
