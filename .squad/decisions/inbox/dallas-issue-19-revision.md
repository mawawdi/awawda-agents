# Dallas Issue 19 Revision Decision Note

## Context
Issue #19 was rejected in Bishop review on PR #32 because backend auth/token/order business-rule depth was incomplete and portal Playwright scenarios were skipped.

## Decision
Deliver runnable critical-path coverage without dependency-gated skips:
- add backend auth token-config/signing tests and order handoff-path tests in API
- add frontend critical UI-state tests for agent-mobile auth shell and customer-portal submit/mismatch/success states
- add executable Playwright portal happy and mismatch scenarios with deterministic idempotency behavior
- document ownership and triage commands in `docs/testing-critical-paths.md`

## Validation
- `pnpm lint` ✅
- `JWT_SECRET=test-jwt-secret JWT_SHIFT_TOKEN_TTL=8h pnpm test` ✅
- `pnpm build` ✅
- `pnpm exec playwright test tests/playwright/portal-critical-paths.spec.ts` ✅
- 2026-04-06 conflict refresh validation on PR #36 head `cd61bc5`:
  - `pnpm --filter @meatland/api test -- src/auth/auth.config.test.ts src/auth/shift-token-signer.test.ts src/orders/orders.service.test.ts` ✅
  - `pnpm --filter @meatland/agent-mobile test -- src/auth-shell-state.test.ts` ✅
  - `pnpm --filter @meatland/customer-portal test -- src/order-submit-state.test.ts` ✅
  - `pnpm --filter @meatland/api lint` ✅
  - `pnpm --filter @meatland/customer-portal lint` ✅
  - `pnpm exec playwright test tests/playwright/portal-critical-paths.spec.ts --list` ✅

## Consequences
Issue #19 acceptance criteria are now covered by runnable automation with no blocker skips, ready for Bishop re-review.
