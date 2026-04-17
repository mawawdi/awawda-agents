# customer-portal

Awawda Customer Portal (Vite + React) for customer ordering via magic links.

## Current behavior

- `/m/[token]` activation route with weak-network guidance and resilient 404-style activation error screen.
- `/order` route with:
  - paginated **recent orders** cards (one-click load into cart),
  - paginated approved-items smart gallery,
  - persistent right-side order summary + submit action,
  - centered success confirmation card (includes order details for screenshot-at-a-glance),
  - repeat-order flow (`הזמנה נוספת`) without permanent submit lock.
- Submit flow calls `POST /v1/customer/orders` with idempotency and mismatch handling (`409 ORDER_LINES_MISMATCH`).
- Runtime API mismatch handling for `Cannot GET /v1/...` responses with actionable client error messaging.

## Scripts

- `pnpm --filter @awawda/customer-portal lint`
- `pnpm --filter @awawda/customer-portal test`
- `pnpm --filter @awawda/customer-portal build`

## Runtime API configuration

The portal reads API base URL from `globalThis.__CUSTOMER_PORTAL_API_BASE_URL__` in `runtime-config.js`.

- Local/dev default: `/v1` (`public/runtime-config.js`)
- Local/dev runtime env default: `globalThis.__CUSTOMER_PORTAL_RUNTIME_ENV__ = "development"` (`public/runtime-config.js`)
- Container deploy overrides:
  - `CUSTOMER_PORTAL_API_BASE_URL` → runtime API base URL
  - `CUSTOMER_PORTAL_RUNTIME_ENV` (defaults to `production`) → disables testing-assets image fallback URLs in production runtime

> Note: `GET /v1/...` browser hits on write endpoints are not valid API calls. Portal mutations are `POST` calls via the app runtime.
