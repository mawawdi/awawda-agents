# Project Context

- **Owner:** Cana
- **Project:** Factory Agent Mobile App + Customer Ordering Portal
- **Stack:** React Native (Expo), Next.js, NestJS (Fastify), Prisma, PostgreSQL, Redis, pnpm monorepo
- **Created:** 2026-04-06T14:46:25.147Z

## Learnings

- Team initialized for Phase 1 architecture implementation.
- 2026-04-06: Owned revision for issue #6 with strict T06 scope only (`apps/api/prisma/*`, API Prisma scripts/docs). Added reproducible empty-DB migration verification path and schema parity proof command.
- 2026-04-06: Took ownership of issue #20 revision after rejection; fixed pnpm lockfile governance by unignoring/committing `pnpm-lock.yaml` and adding explicit lockfile presence checks across CI/preview/release workflows for deterministic frozen-lockfile gates.
