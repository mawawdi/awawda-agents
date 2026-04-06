# Project Context

- **Owner:** Cana
- **Project:** Factory Agent Mobile App + Customer Ordering Portal
- **Stack:** React Native (Expo), Next.js, NestJS (Fastify), Prisma, PostgreSQL, Redis, pnpm monorepo
- **Created:** 2026-04-06T14:46:25.147Z

## Learnings

- Team initialized for Phase 1 architecture implementation.
- T03 established `@meatland/shared-types` with versioned `v1` Zod contracts for customer/session/order flows, plus validation tests to enforce API/frontend schema consistency.
- T04 bootstrapped `apps/api` with NestJS + Fastify, URI versioning (`/v1/*`), global ValidationPipe defaults, health/readiness contracts, and phase domain module boundaries.
- T06 added Prisma v6 to `apps/api`, delivered a Phase 1 operational schema + initial SQL migration for `agents`, `assignments`, `approved_items`, `magic_links`, `sessions`, `orders`, `order_lines`, `idempotency_keys`, and `audit_logs`.
- T08 implemented agent login at `POST /v1/agent/auth/login` with Argon2 password verification, JWT shift token issuance, stable auth errors, and AuthService success/failure unit coverage.
- T09 delivered agent-only read APIs: `GET /v1/agent/customers` now enforces assignment scoping with dashboard metadata, and `GET /v1/agent/catalog` now reads from ERP gateway with short-lived cache metadata + HTTP cache headers; integration tests cover auth rejection and happy paths.
- T10 implemented assigned-customer approved-items APIs: `GET/POST /v1/agent/customers/:customerId/approved-items` now enforce assignment authorization, POST is duplicate-safe with `created` semantics, add-item writes `audit_logs` (`approved_item.added`), and integration tests cover happy path, duplicate behavior, and forbidden boundaries.
- T10 follow-up: rebased `parker/issue-10-approved-items` onto latest `main`, resolved shared contracts conflict by retaining both magic-link and approved-items response interfaces, and re-ran API lint + approved-items integration tests (8/8 passing).
- T12 implemented customer portal entry APIs: `POST /v1/customer/sessions/activate` now exchanges hashed magic-link tokens for customer session JWTs, persists lifecycle transitions (`issued -> activated` / `expired`) with audit log writes, and returns initial portal payloads (`approvedItems`, `recentItems`, `pricing`, `priceListVersion`).
- T12 added `GET /v1/customer/portal-data` guarded by customer session JWT validation plus persistent expiry transitions on elapsed sessions, with explicit invalid/expired error codes and integration + repository/service coverage for happy, invalid, expired, and lifecycle paths.
- T12 PR #40 conflict refresh: rebased `parker/issue-12-session-activation` onto latest `main` (no semantic drift in activation/portal lifecycle code), regenerated Prisma client, and revalidated API quality gates (`pnpm --filter @meatland/api lint`, `test` 41/41, `build`) before merge retry.
- T13 delivered `POST /v1/customer/orders` with customer-session auth + idempotency-key enforcement, ERP revalidation against approved/recent + live pricing snapshots, persisted order line snapshots, deterministic replay for duplicate keys, and success consume flow that closes sessions + consumes magic links; API tests now cover happy, mismatch 409 line details, and idempotent replay.
- Issue #17 stabilization revision: carried forward runtime `/m/:token -> /order` browser-flow implementation from rejected PR #45 onto latest `main`, replaced transient activation-heading assertion with deterministic API+redirect synchronization in Playwright, and validated stability via repeated `pnpm test:portal-e2e` runs (5 consecutive green) plus portal lint/unit suites.
