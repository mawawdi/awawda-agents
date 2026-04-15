# customer-portal

Phase 1 lightweight customer ordering portal using magic-link activation.

## Implemented in T17

- Runtime `/m/[token]` activation route that exchanges magic-link tokens, shows weak-network guidance, and redirects into ordering on success.
- Runtime `/order` route wired to portal data fetch + composition UI (recent-orders cards, products gallery, quantity steppers, estimated total, sticky submit bar).
- Cart summary model with estimated total math plus mobile-optimized sticky submit bar behavior.

## Implemented in T18

- `/order` submit flow now calls `POST /v1/customer/orders` with idempotency key handling.
- `409 ORDER_LINES_MISMATCH` responses render line-level remediation with refresh + reconfirm actions.
- Success confirmation displays returned `orderRef` and hard-locks duplicate submit actions.

## Scripts

- `pnpm --filter @awawda/customer-portal lint`
- `pnpm --filter @awawda/customer-portal test`
- `pnpm --filter @awawda/customer-portal build`

## Runtime API configuration

The portal reads API base URL from `globalThis.__CUSTOMER_PORTAL_API_BASE_URL__` in `runtime-config.js`.

- Local/dev default: `/v1` (`public/runtime-config.js`)
- Container deploy override: `CUSTOMER_PORTAL_API_BASE_URL` env var (in `infra/compose/deploy.env`)
