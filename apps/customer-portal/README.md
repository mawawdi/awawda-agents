# customer-portal

Phase 1 lightweight customer ordering portal using magic-link activation.

## Implemented in T17

- `/m/[token]` activation-route bootstrap state model with retryable invalid/expired/network/server failures and weak-network hint transition.
- `/order` composition model covering recent + approved sections, quantity-stepper interactions, and resilient loading/error states.
- Cart summary model with estimated total math plus mobile-optimized sticky submit bar behavior.

## Scripts

- `pnpm --filter @meatland/customer-portal lint`
- `pnpm --filter @meatland/customer-portal test`
