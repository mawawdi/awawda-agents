# Ripley Issue 14 Cycle 3 Decision Note

## Context
Issue #14 was rejected twice because reviewer validation could not verify end-to-end auth flow: API login route dependency was unavailable and Playwright evidence for sign-in/session restore/logout was missing.

## Decision
Deliver a tightly scoped T14 revision that keeps prior mobile auth shell implementation and adds only readiness-enabling backend and reviewer harness changes:
- Implement `POST /v1/agent/auth/login`, `GET /v1/agent/auth/session`, and `POST /v1/agent/auth/logout` in `apps/api`.
- Add runnable Playwright baseline in `tests/playwright/agent-auth-flow.spec.ts` with `playwright.config.ts` so `pnpm dlx playwright test` validates sign-in, persisted session restore simulation, and logout clear.

## Rationale
This resolves the exact rejection gates without introducing unrelated domain scope. Reviewer can now execute one deterministic Playwright flow against a real API process and confirm all required auth lifecycle checkpoints.

## Consequences
Future auth hardening can replace in-memory session handling with persistent backing while keeping route contracts and reviewer baseline flow intact.
