# Phase 1 critical-path automated test map

## Ownership

- **API critical path tests** (`apps/api/src/**/*.test.ts`): Parker + Dallas
- **Agent mobile critical path tests** (`apps/agent-mobile/src/**/*.test.ts`): Dallas
- **Customer portal UI-state tests** (`apps/customer-portal/src/**/*.test.ts`): Dallas
- **Portal E2E scenarios** (`tests/playwright/portal-critical-paths.spec.ts`): Dallas + Bishop validation

## Current suite and intent

### API (`pnpm --filter @awawda/api test`)

- Auth credentials/business rules and token configuration/signing coverage
- Order handoff business-path coverage (valid handoff + ERP error propagation)
- Bootstrap route checks for `/v1/health` and `/v1/ready`

### Agent mobile (`pnpm --filter @awawda/agent-mobile test`)

- Critical auth shell UI states: bootstrapping, restore failure, login success, logout reset

### Customer portal UI (`pnpm --filter @awawda/customer-portal test`)

- Submit-button lock during in-flight requests only
- 409 mismatch state with line-level guidance
- Success overlay rendering (order ref, totals, line items) with repeat-order continuation (`הזמנה נוספת`)

### Portal scenarios (`pnpm exec playwright test tests/playwright/portal-critical-paths.spec.ts`)

- Happy path: link activation + successful order submit with idempotency replay consistency
- Mismatch path: `409 PRICE_MISMATCH` with line-level remediation feedback

## Failure triage steps

1. Reproduce only the failing suite first (API/mobile/portal UI/Playwright command above).
2. For API failures, inspect `auth` and `orders` tests together and confirm contract assumptions in `packages/shared-types/src/v1/contracts.ts`.
3. For portal mismatch failures, compare expected mismatch line payloads against backend response payload fields.
4. For Playwright failures, rerun with trace and attach request/response payload evidence in the issue or PR comment.
