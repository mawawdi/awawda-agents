# Dallas Issue 17 Customer Portal Decision Note

## Context
Issue #17 required a production-grade customer ordering experience centered on magic-link activation and mobile-safe order composition after dependencies T03 and T12 were delivered.

## Decision
Implement customer portal flow as deterministic state modules in `apps/customer-portal/src`:
- route bootstrap for `/m/[token]` activation with explicit weak-network hint and retryable error reasons
- `/order` composition model with recent + approved sections and bounded quantity interactions
- cart summary estimation and sticky bottom submit-bar metadata tuned for mobile viewport behavior

## Validation
- `pnpm --filter @meatland/customer-portal lint` ✅
- `pnpm --filter @meatland/customer-portal test` ✅
- `pnpm test:portal-e2e` ✅

## Consequences
The customer portal now has test-backed domain/UI flow primitives that can be wired into Next.js views without redefining contract/error behavior, and Bishop can replay acceptance criteria through deterministic tests.
