# Project Context

- **Owner:** Cana
- **Project:** Factory Agent Mobile App + Customer Ordering Portal
- **Stack:** React Native (Expo), Next.js, NestJS (Fastify), Prisma, PostgreSQL, Redis, pnpm monorepo
- **Created:** 2026-04-06T14:46:25.147Z

## Learnings

- Team initialized for Phase 1 architecture implementation.
- 2026-04-06: Delivered scoped Issue #7 revision from clean main on `dallas/issue-7-scoped-revision`, preserving only T07 ERP gateway abstraction/adapters and passing `pnpm lint`, `pnpm test`, and `pnpm build`.
- 2026-04-06: Owned revision for issue #6 with strict T06 scope only (`apps/api/prisma/*`, API Prisma scripts/docs). Added reproducible empty-DB migration verification path and schema parity proof command.
- 2026-04-06: Took ownership of issue #20 revision after rejection; fixed pnpm lockfile governance by unignoring/committing `pnpm-lock.yaml` and adding explicit lockfile presence checks across CI/preview/release workflows for deterministic frozen-lockfile gates.
- 2026-04-06: Took over Issue #19 revision after Bishop rejection of PR #32; added runnable backend auth/token/order critical-path tests, agent+portal UI-state tests, executable Playwright happy/mismatch coverage, and critical-path ownership/triage docs.
