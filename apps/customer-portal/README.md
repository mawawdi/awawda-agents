# customer-portal

Phase 1 lightweight customer ordering portal using magic-link activation.

## Implemented in T17

- Runtime `/m/[token]` activation route that exchanges magic-link tokens, shows weak-network guidance, and redirects into ordering on success.
- Runtime `/order` route wired to portal data fetch + composition UI (recent + approved sections, quantity steppers, estimated total, sticky submit bar).
- Cart summary model with estimated total math plus mobile-optimized sticky submit bar behavior.

## Implemented in T18

- `/order` submit flow now calls `POST /v1/customer/orders` with idempotency key handling.
- `409 ORDER_LINES_MISMATCH` responses render line-level remediation with refresh + reconfirm actions.
- Success confirmation displays returned `orderRef` and hard-locks duplicate submit actions.

## Scripts

- `pnpm --filter @meatland/customer-portal lint`
- `pnpm --filter @meatland/customer-portal test`
