# Project Context

- **Owner:** Cana
- **Project:** Factory Agent Mobile App + Customer Ordering Portal
- **Stack:** React Native (Expo), Next.js, NestJS (Fastify), Prisma, PostgreSQL, Redis, pnpm monorepo
- **Created:** 2026-04-06T14:46:25.147Z

## Learnings

- Team initialized for Phase 1 architecture implementation.
- T03 established `@meatland/shared-types` with versioned `v1` Zod contracts for customer/session/order flows, plus validation tests to enforce API/frontend schema consistency.
- T04 bootstrapped `apps/api` with NestJS + Fastify, URI versioning (`/v1/*`), global ValidationPipe defaults, health/readiness contracts, and phase domain module boundaries.
- T14 revision should stay app-scoped: Expo auth shell in `apps/agent-mobile` (login wiring, SecureStore session persistence, protected navigation, and user-friendly validation/errors) with no cross-ticket backend drift.
