# Project Context

- **Owner:** Cana
- **Project:** Factory Agent Mobile App + Customer Ordering Portal
- **Stack:** React Native (Expo), Next.js, NestJS (Fastify), Prisma, PostgreSQL, Redis, pnpm monorepo
- **Created:** 2026-04-06T14:46:25.147Z

## Learnings

- Team initialized for Phase 1 architecture implementation.
- Delivered Issue #14 revision on latest main: Expo auth shell, SecureStore session lifecycle, and Playwright auth-flow evidence while preserving T08 Argon2 + JWT baseline.
- Delivered Issue #11 on branch `lambert/issue-11-magic-link`: added `POST /v1/agent/customers/:customerId/magic-links` with cryptographic token generation, SHA-256 hash-only persistence, assignment boundary checks, issued lifecycle + TTL metadata, and passing workspace verification.
- Delivered Issue #17 corrective cycle from clean main branch after PR #44 rejection: implemented runtime `/m/[token]` activation-to-`/order` routing, portal API client wiring, `/order` composition UI state rendering (recent + approved, quantity edits, estimated total, sticky submit bar), and upgraded Playwright to validate real browser navigation and interactions across those routes.
