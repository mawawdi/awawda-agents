# Project Context

- **Owner:** Cana
- **Project:** Factory Agent Mobile App + Customer Ordering Portal
- **Stack:** React Native (Expo), Next.js, NestJS (Fastify), Prisma, PostgreSQL, Redis, pnpm monorepo
- **Created:** 2026-04-06T14:46:25.147Z

## Learnings

- Team initialized for Phase 1 architecture implementation.
- PR #48 review approved the orders repository typing hotfix: idempotency reserve/replay/finalize uses parameterized SQL plus strict replay JSON guards in `apps/api/src/orders/orders.repository.ts`, with no unsafe `any` shortcuts and no idempotency behavior regression observed under full lint/test/build verification.
