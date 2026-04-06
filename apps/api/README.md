# api

NestJS + Fastify backend entrypoint for the Meatland Agent platform.

## Environment

Copy `.env.example` to `.env` and set all required values before running workspace checks.

## Scripts

- `pnpm --filter @meatland/api dev` — run API locally (default `0.0.0.0:3000`)
- `pnpm --filter @meatland/api test` — run API tests
- `pnpm --filter @meatland/api build` — compile TypeScript to `dist/`

## Operational routes

- `GET /v1/health` — liveness contract
- `GET /v1/ready` — readiness contract including ERP adapter health (Hashavshevet skeleton reports `degraded`)
- `POST /v1/agent/auth/login` — agent login with Argon2 verification + JWT shift token
- `GET /v1/agent/customers` — assigned customer dashboard data for authenticated agents only
- `GET /v1/agent/catalog` — ERP-backed catalog snapshot with short-lived cache metadata + cache headers

## Auth environment variables

- `JWT_SECRET` (required): signing key for agent JWT access tokens
- `JWT_SHIFT_TOKEN_TTL` (optional): shift token TTL (`8h` default, supports `s|m|h|d`)
- `JWT_ISSUER` (optional): JWT issuer claim (`meatland-api` default)

## Catalog environment variables

- `CATALOG_CACHE_TTL_SECONDS` (optional): API catalog cache max-age in seconds (`300` default)

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

## ERP integration boundary (T07)

- Application modules consume ERP via the `ERP_GATEWAY` abstraction token (`apps/api/src/erp/erp.gateway.ts`).
- `HashavshevetAdapter` is wired as a retry/backoff-ready skeleton for the primary handoff path.
- `BMaxXmlAdapter` is wired as XML fallback stub for order handoff when primary ERP delivery fails.
- Internal ERP failures use stable `ERP_*` error codes from `apps/api/src/erp/erp.errors.ts`.
