# api

NestJS + Fastify backend entrypoint for the Meatland Agent platform.

## Environment

Copy `.env.example` to `.env` and set all required values before running workspace checks.

## Scripts

- `pnpm --filter @meatland/api dev` — run API locally (default `0.0.0.0:3000`)
- `pnpm --filter @meatland/api test` — run API tests
- `pnpm --filter @meatland/api build` — compile TypeScript to `dist/`
- `pnpm --filter @meatland/api prisma:generate` — generate Prisma client
- `pnpm --filter @meatland/api prisma:migrate:dev -- --name <migration-name>` — create/apply migration in local dev DB
- `pnpm --filter @meatland/api prisma:migrate:deploy` — apply committed migrations

## Operational routes

- `GET /v1/health` — liveness contract
- `GET /v1/ready` — readiness placeholder contract for dependencies

## Module boundaries

Phase-1 domain scaffolds are in place and isolated by module:

- `auth`
- `customers`
- `catalog`
- `links`
- `sessions`
- `orders`
- `erp`

## Local infra dependencies (PostgreSQL + Redis)

From repo root, start local runtime dependencies:

```bash
pnpm infra:local:up
```

`apps/api/.env.example` already points to this stack (`localhost:5432` and `localhost:6379`).
Use `pnpm infra:local:ps` to verify health before running API flows.


## Prisma domain schema (T06)

- Schema: `apps/api/prisma/schema.prisma`
- Initial migration: `apps/api/prisma/migrations/20260406214000_init_phase1_domain_schema/migration.sql`
- Domain coverage: `agents`, `assignments`, `approved_items`, `magic_links`, `sessions`, `orders`, `order_lines`, `idempotency_keys`, `audit_logs`

### Empty-database migration verification (reproducible)

Run from repository root:

```bash
docker compose -f infra/compose/local.yml up -d postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/meatland?schema=public pnpm --filter @meatland/api prisma:migrate:deploy
```

If Docker is unavailable, reviewers can still reproduce schema parity from an empty DB model with:

```bash
pnpm --filter @meatland/api exec prisma migrate diff --from-empty --to-schema-datamodel apps/api/prisma/schema.prisma --script
```

Expected parity with committed migration: only explicit `CREATE EXTENSION IF NOT EXISTS "pgcrypto"` remains manual in migration SQL.
