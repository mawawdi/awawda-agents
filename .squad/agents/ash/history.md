# Project Context

- **Owner:** Cana
- **Project:** Factory Agent Mobile App + Customer Ordering Portal
- **Stack:** React Native (Expo), Next.js, NestJS (Fastify), Prisma, PostgreSQL, Redis, pnpm monorepo
- **Created:** 2026-04-06T14:46:25.147Z

## Learnings

- Team initialized for Phase 1 architecture implementation.
- Workspace baseline is now `pnpm bootstrap` + `pnpm check`, with enforced env contracts via `scripts/check-env.mjs` for api/portal/mobile to keep local and CI runs deterministic.

---

# Ash decision note — Issue #5 local infra compose

## Context

Issue #5 required a production-grade local runtime dependency stack for PostgreSQL and Redis, with one-command lifecycle control, API env alignment, and safe reset guidance.

## Decision

Standardize local infra operations through root scripts backed by `infra/compose/local.yml`:

- `docker compose -f infra/compose/local.yml up -d`
- `docker compose -f infra/compose/local.yml ps`
- `docker compose -f infra/compose/local.yml down --remove-orphans`
- `docker compose -f infra/compose/local.yml down --volumes --remove-orphans`

Use pinned container images, health checks, persistent named volumes, and first-run PostgreSQL init scripts under `infra/compose/init/`.

## Why this is relevant

This gives the team a deterministic, repeatable dependency bootstrap for API integration work while minimizing local drift and making data reset operations explicit and safe.
