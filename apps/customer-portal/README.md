# customer-portal

Phase 1 lightweight customer ordering portal using magic-link activation.

## Implemented in T17

- Runtime `/m/[token]` activation route that exchanges magic-link tokens, shows weak-network guidance, and redirects into ordering on success.
- Runtime `/order` route wired to portal data fetch + composition UI (recent + approved sections, quantity steppers, estimated total, sticky submit bar).
- Cart summary model with estimated total math plus mobile-optimized sticky submit bar behavior.

## Scripts

- `pnpm --filter @meatland/customer-portal lint`
- `pnpm --filter @meatland/customer-portal test`
