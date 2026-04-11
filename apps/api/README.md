# api

NestJS + Fastify backend entrypoint for the Meatland Agent platform.

## Environment

Copy `.env.example` to `.env` and set all required values before running workspace checks.

## Scripts

- `pnpm --filter @meatland/api dev` — run API locally (default `0.0.0.0:3000`)
- `pnpm --filter @meatland/api test` — run API tests
- `pnpm --filter @meatland/api build` — compile TypeScript to `dist/`
- `pnpm --filter @meatland/api prisma:migrate:deploy` — run migrations in deploy environments

## Operational routes

- `GET /v1/health` — liveness contract
- `GET /v1/ready` — readiness contract with Postgres/Redis/ERP probes; returns `503` when required dependencies fail configured threshold
- `POST /v1/agent/auth/login` — agent login with Argon2 verification + JWT shift token
- `GET /v1/agent/customers` — assigned customer dashboard data for authenticated agents only
- `GET /v1/agent/customers/:customerId/approved-items` — assigned-agent allowlist reads for a specific customer
- `POST /v1/agent/customers/:customerId/approved-items` — assigned-agent allowlist mutation with duplicate-safe semantics + audit log
- `GET /v1/agent/catalog` — ERP-backed catalog snapshot with short-lived cache metadata + cache headers
- `POST /v1/agent/customers/:customerId/magic-links` — issue secure customer magic links with hash-only token persistence
- `POST /v1/customer/session/logout` — authenticated customer-session close to invalidate active ordering session
- `POST /v1/customer/orders` — idempotent order submit; returns actionable `503 CUSTOMER_ORDER_ERP_UNAVAILABLE` on ERP outages

## Auth environment variables

- `JWT_SECRET` (required): signing key for agent JWT access tokens
- `JWT_SHIFT_TOKEN_TTL` (optional): shift token TTL (`8h` default, supports `s|m|h|d`)
- `JWT_ISSUER` (optional): JWT issuer claim (`meatland-api` default)
- `CORS_ALLOWED_ORIGINS` (optional): comma-separated allowed origins for browser clients (defaults include `localhost:8080` and `localhost:8081`)
- `API_BODY_LIMIT_BYTES` (optional): request body limit in bytes (`1048576` default)

## Customer session activation guardrail env variables

- `CUSTOMER_SESSION_ACTIVATION_RATE_LIMIT_BURST` (optional): max activation attempts per client IP in a single window (`5` default)
- `CUSTOMER_SESSION_ACTIVATION_RATE_LIMIT_WINDOW_SECONDS` (optional): rolling window length for activation rate limiting (`60` default)

## Catalog environment variables

- `CATALOG_CACHE_TTL_SECONDS` (optional): API catalog cache max-age in seconds (`300` default)

## Hashavshevet pull environment variables

- `HASH_ENV` (optional): `testing` or `production` (`testing` default)
- `HASH_TEST_API_URL` / `HASH_TEST_API_KEY` (optional): testing endpoint credentials
- `HASH_PROD_API_URL` / `HASH_PROD_API_KEY` (optional): production endpoint credentials
- `HASH_API_URL` / `HASH_API_KEY` (optional): explicit override for current environment
- `HASH_REQUEST_TIMEOUT_MS` (optional): outbound Hashavshevet timeout in ms (`8000` default)
- `HASH_HEALTH_PATH` (optional): health endpoint path (`/health` default)
- `HASH_ASSIGNED_CUSTOMERS_PATH` (optional): assigned-customer path template (`/agents/{agentId}/customers` default)
- `HASH_CATALOG_PATH` (optional): catalog path (`/catalog/items` default)
- `HASH_RECENT_ITEMS_PATH` (optional): recent-items path template (`/customers/{customerId}/recent-items` default)
- `HASH_PRICING_PATH` (optional): pricing path template (`/customers/{customerId}/pricing` default)

## Hashavshevet H-Connect environment variables

- `HASH_HCONNECT_ENABLED` (optional): enables plugin-envelope mode for `ws.wizground.com` (`false` default)
- `HASH_HCONNECT_ENDPOINT_URL` (optional): H-Connect API URL (`https://ws.wizground.com/api` default)
- `HASH_HCONNECT_STATION` / `HASH_HCONNECT_COMPANY` / `HASH_HCONNECT_NET_PASSPORT_ID` (required when enabled): station/company/provider identity
- `HASH_HCONNECT_SIGNATURE_TOKEN` (required when enabled): token used to build request signatures
- `HASH_HCONNECT_REPORT_ASSIGNED_CUSTOMERS` / `HASH_HCONNECT_REPORT_CATALOG` / `HASH_HCONNECT_REPORT_RECENT_ITEMS` / `HASH_HCONNECT_REPORT_PRICING` (optional): encrypted report definitions for read flows
- `HASH_HCONNECT_REPORT_*_PARAMS_JSON` (optional): raw JSON templates for `params_data`; supports `${agentId}` and `${customerId}` placeholders
- `HASH_HCONNECT_HANDOFF_PLUGIN` (optional): import plugin for order handoff (`imovein` currently implemented)
- `HASH_HCONNECT_HANDOFF_DOCUMENT_ID` (optional): `imovein` document id (`30` default)
- `HASH_HCONNECT_HANDOFF_ACCOUNT_KEY` (optional): fixed account key override for handoff payloads

Quick switch:

```bash
pnpm api:dev:test
pnpm api:dev:prod
```

Deploy with explicit Hash mode from repo root:

```bash
pnpm deploy:up:test
pnpm deploy:up:prod
```

## Readiness environment variables

- `READY_PROBE_TIMEOUT_MS` (optional): per-dependency probe timeout in milliseconds (`1500` default)
- `READY_DEGRADED_LATENCY_MS` (optional): probe latency threshold above which successful checks become `degraded` (`400` default)
- `READY_REQUIRED_MIN_STATUS` (optional): minimum required status for required dependencies (`degraded` default, set `up` for strict fail-on-degraded gates)

## Magic link environment variables

- `MAGIC_LINK_BASE_URL` (optional): absolute customer portal activation URL (`https://portal.meatland.local/activate` default)
- `MAGIC_LINK_TTL_SECONDS` (optional): issued magic-link TTL in seconds (`86400` default)

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

`apps/api/.env.example` points to this stack (`localhost:5432` and `localhost:6379`).
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
