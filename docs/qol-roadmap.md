# QOL & Feature Roadmap

Tracked improvements across the full stack. Check items off as they are completed.

---

## 🔴 High Impact

- [x] **Auth rate limiting on login endpoint** — `@nestjs/throttler` added; 10 attempts/60s per IP on `POST /agent/auth/login`
- [x] **CI pipeline** — `.github/workflows/ci.yml` runs `pnpm lint && pnpm test && pnpm build` on every PR
- [x] **JWT refresh tokens** — Add `/agent/auth/refresh` endpoint; issue a long-lived refresh token alongside the access token; rotate on use; revoke on logout
- [x] **Pull-to-refresh on mobile** — `RefreshControl` wired to `refreshActiveTab` on the main `ScrollView`
- [x] **KeyboardAvoidingView on forms** — Login screen wrapped; prevents keyboard covering password field on iOS
- [ ] **Push notifications** — Install `expo-notifications`; device token registration on login; server-side dispatch on order status change, ERP errors, new customer assignment

---

## 🟠 Medium Impact

- [x] **Request correlation IDs on API** — `X-Request-Id` UUID generated in Fastify `onRequest` hook; returned in response headers; included in log lines
- [x] **Remove approved items endpoint** — `DELETE /agent/customers/:customerId/approved-items/:hashItemId`; audit-logged
- [x] **Swagger / OpenAPI docs** — Add `@nestjs/swagger`; generate docs behind `SWAGGER_ENABLED` env flag (off in prod)
- [x] **Sentry error tracking** — `@sentry/nestjs` on API + `@sentry/react-native` on mobile; symbolicated crash reports from production builds
- [x] **Skeleton loaders** — Replace `ActivityIndicator` spinners with shimmer skeletons on customer list, orders list, catalog grid
- [x] **Order detail view for agents** — Add `GET /agent/orders/:orderId` endpoint; tap an order card in the mobile app to see line items, status, and cancellation
- [x] **Customer portal: error boundary + toast system** — Render crash safety net + lightweight toast for submit success/failure feedback

---

## 🟡 Good-to-Have

- [x] **Haptic feedback** — Light haptics on: magic link copy, order submit, error shake
- [ ] **Offline order draft** — Auto-save order-composition state to `SecureStore`; restore on app launch after crash/backgrounding
- [ ] **Pagination on large list endpoints** — `GET /supervisor/customers`, `/supervisor/agents`, `/agent/customers` return unbounded lists; add `limit`/`cursor` params
- [ ] **Customer notes / call log** — `POST /agent/customers/:id/notes` + mobile UI panel; agents log call outcomes and follow-ups
- [ ] **Price history browsing** — Once H-Connect is live, surface `getCustomerPricing` / `getCustomerSpecialPricing` as a "Price History" panel in the customer detail view
- [x] **Playwright E2E in CI** — The `tests/playwright/` suite exists but is never run automatically; add a CI step that boots the stack and runs it
- [x] **Delivery scheduling** — Add optional `requestedDeliveryDate` field to order submit DTO; display in agent order list
- [ ] **Customer portal PWA** — Add `manifest.json`, service worker, install-to-homescreen support for mobile browser customers
- [ ] **Response caching layer** — Redis-backed cache with short TTL on `/agent/catalog` and `/agent/customers`; invalidate on ERP sync
- [ ] **Accessibility audit** — Systematic `accessibilityLabel`/`accessibilityHint`/`accessibilityState` coverage; run `react-native-accessibility-engine` in tests

---

## ✅ Already Done (pre-roadmap)

- [x] Error boundary on mobile (`src/components/error-boundary.tsx`)
- [x] Monthly goal persisted via `expo-secure-store`
- [x] Settings menu rows wired (alert handlers for "עריכת פרופיל" and "הגדרות התראות")
- [x] ERP sync metric is now dynamic (תקין / אטי / שגיאה)
- [x] "Forgot password" shows alert directing to manager
- [x] `expo-updates` installed and configured for OTA
- [x] Secrets centralized in `infra/secrets.env` (gitignored)
- [x] H-Connect credentials loaded; all 14 report methods wired
- [x] Agent association on orders (hash agent ID passed to ERP)
- [x] Testing vs production DB/adapter separation
