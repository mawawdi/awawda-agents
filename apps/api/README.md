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
- `GET /v1/ready` — readiness contract including ERP adapter health (Hashavshevet skeleton reports `degraded`)

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

## ERP integration boundary (T07)

- Application modules consume ERP via the `ERP_GATEWAY` abstraction token (`apps/api/src/erp/erp.gateway.ts`).
- `HashavshevetAdapter` is wired as a retry/backoff-ready skeleton for the primary handoff path.
- `BMaxXmlAdapter` is wired as XML fallback stub for order handoff when primary ERP delivery fails.
- Internal ERP failures use stable `ERP_*` error codes from `apps/api/src/erp/erp.errors.ts`.
