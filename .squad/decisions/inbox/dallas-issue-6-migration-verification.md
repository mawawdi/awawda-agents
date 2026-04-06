# Dallas Decision — T06 migration verification path

## Context
Issue #6 was rejected because migration apply was not credibly verified and prior PR included out-of-scope changes.

## Decision
For T06 revision, keep changes strictly in API Prisma schema/migration and document a reproducible empty-database verification path:
1) `docker compose -f infra/compose/local.yml up -d postgres`
2) `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/meatland?schema=public pnpm --filter @meatland/api prisma:migrate:deploy`
3) Fallback proof when Docker is unavailable: `prisma migrate diff --from-empty --to-schema-datamodel ... --script` and compare with committed migration (only manual `pgcrypto` extension line differs).

## Consequence
Reviewer has both a direct apply command for empty DB and an explicit reproducible parity proof path when runtime infra is unavailable.
