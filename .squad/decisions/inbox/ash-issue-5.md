# Ash Issue 5 Decision Note

## Context
Issue #5 requested production-grade local compose runtime dependencies (PostgreSQL + Redis), API env endpoint alignment, and safe local reset instructions.

## Decision
Adopt `infra/compose/local.yml` as the canonical local dependency stack, with root command wrappers:
- `pnpm infra:local:up`
- `pnpm infra:local:ps`
- `pnpm infra:local:down`
- `pnpm infra:local:reset`

Use health checks, named volumes, pinned image versions, and a first-run PostgreSQL init script (`infra/compose/init/01-create-test-db.sql`).

## Rationale
A single standardized local infra contract reduces onboarding friction and avoids environment mismatch between developers during API integration and test execution.

## Consequences
Future API and integration tasks should rely on these scripts/compose assets instead of ad-hoc local service startup commands.
