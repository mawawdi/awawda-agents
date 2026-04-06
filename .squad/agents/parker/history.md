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
- T07 introduced an `ERP_GATEWAY` abstraction with injectable Hashavshevet + B-MAX adapters, stable ERP error codes, and fallback order handoff behavior used by API modules.
