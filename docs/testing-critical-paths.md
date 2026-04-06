# Phase 1 critical-path automated test map

## Ownership

- **API critical path tests** (`apps/api/src/**/*.test.ts`): Parker + Lambert (backend + quality)
- **Agent mobile critical path tests** (`apps/agent-mobile/src/__tests__/*.test.ts`): Dallas + Lambert (mobile + quality)
- **Portal critical path specs** (`tests/playwright/*.spec.ts`): Dallas + Lambert (portal flow + quality)
- **Cross-app contract tests** (`packages/shared-types/src/__tests__/*.test.ts`): Ash + Lambert (contract integrity)

## Current suite and intent

### API (`pnpm --filter @meatland/api test`)

- Bootstrap route checks for `/v1/health` and `/v1/ready`
- Health service uptime/status assertions
- Ready service dependency-placeholder assertions

### Agent mobile (`pnpm --filter @meatland/agent-mobile test`)

- Login input validation and auth error mapping
- Auth client login response + failure-path coverage (token lifecycle contract)
- Secure-store token persistence/read/clear behavior

### Customer portal (`pnpm dlx @playwright/test test tests/playwright/portal-critical-paths.spec.ts`)

- Playwright scenario definitions for:
  - magic-link activation happy path
  - order mismatch path
- **Blocked in main right now:** endpoints are pending in dependency tickets (T13/T16/T18), so spec is intentionally skipped with explicit blocker messaging.

## Failure triage steps

1. Reproduce the failing suite only (API/mobile/portal command above).
2. Confirm env prerequisites (`pnpm check:env`) and required API origin for E2E (`PORTAL_E2E_API_ORIGIN`).
3. For contract-shape failures, validate `packages/shared-types/src/v1/contracts.ts` first, then consuming client expectations.
4. For API failures, inspect route/service tests together and check if dependency tickets changed endpoint behavior.
5. For Playwright failures, collect trace output and include failing request/response payload snippets in the issue/PR comment.
