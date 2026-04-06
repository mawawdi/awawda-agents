# Lambert Issue 14 Revision Note

## Context
Issue #14 was rejected on PR #29 due to merge conflict and auth security regression against the merged T08 baseline.

## Decision
Rebuild T14 from current `main` and keep scope to mobile auth shell + reviewer flow evidence:
- Implement Expo auth shell (`apps/agent-mobile`) with login wiring to `POST /v1/agent/auth/login`
- Keep session persistence and logout clear strictly client-side via Expo SecureStore
- Align request/response contracts to current T08 API (`phoneOrEmail`, Argon2/JWT-backed login response shape)
- Provide runnable Playwright auth-flow validation without modifying T08 backend architecture

## Validation
- `pnpm --filter @meatland/agent-mobile lint` ✅
- `pnpm --filter @meatland/agent-mobile test` ✅
- `pnpm --filter @meatland/api lint` ✅
- `JWT_SECRET=test-jwt-secret JWT_SHIFT_TOKEN_TTL=8h pnpm --filter @meatland/api test` ✅
- `pnpm lint` ✅
- `JWT_SECRET=test-jwt-secret JWT_SHIFT_TOKEN_TTL=8h pnpm test` ✅
- `pnpm build` ✅
- `pnpm dlx playwright test tests/playwright/agent-auth-flow.spec.ts` ✅

## Consequences
Issue #14 is now refreshed on top of latest `main` with no SHA-256/in-memory auth fallback and is ready for Bishop re-review.
