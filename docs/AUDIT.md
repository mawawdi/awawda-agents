# Security & Correctness Audit — Awawda Agents

_Audit date: 2026-07-19_

## Overview

This repository was audited by a multi-agent review swarm: **7 domain finders** (ERP, auth/sessions, orders/pricing, data layer, runtime/security, mobile, customer portal), each finding **independently and adversarially verified** to strip false positives, plus a **4-way documentation-accuracy audit** against the actual code (30 agents total).

**Result:** 18 code findings (all verified, all resolved) and 29 documentation corrections (all applied).

| Severity | Count |
|---|---|
| High | 10 |
| Medium | 4 |
| Low | 4 |
| **Total** | **18** |

**Verification:** TypeScript typecheck clean across all packages; **180 API** (incl. every DB-backed integration test), **68 mobile**, and **32 portal** unit/integration tests pass.

> **Runtime context that shaped several findings:** `ErpModule` binds `ERP_GATEWAY` to an in-process mock (`TestingErpAdapter`) whenever `HASH_ENV=testing` — the default for local dev, the `deploy-test` scripts, and CI. The live Hashavshevet/B-MAX path (`CompositeErpGateway`) runs only under `HASH_ENV=production`. So the ERP findings below are production-path defects, even though the default run mode never exercises them.

## Code findings

| # | Severity | Area | Finding | Status |
|---|---|---|---|---|
| 1 | High | erp | Order handoff retry re-POSTs a possibly-committed order (no idempotency key) → duplicate ERP documents | ✅ `dbdedb7` |
| 2 | High | erp | Unrecognized H-Connect business errors default to ERP_UNAVAILABLE (retryable + B-MAX fallback), masking permanent rejections as accepted orders | ✅ `dbdedb7` |
| 3 | High | erp | Handoff response never captures the Hashavshevet document reference for wrapped ({data:[...]}) responses | ✅ `dbdedb7` |
| 4 | High | orders-pricing | No upper bound on order quantity overflows the Decimal order columns during persistence, which runs after the ERP order is already committed | ✅ `dbdedb7` |
| 5 | High | orders-pricing | Transient ERP-unavailable (503) responses are finalized into the idempotency key and replayed forever, so the order can never be placed with that key after ERP recovers | ✅ `dbdedb7` |
| 6 | High | data-layer | Concurrent order submits create duplicate orders (and duplicate ERP handoffs) for a single-use magic link | ✅ `ff7e701` |
| 7 | High | data-layer | ERP handoff, order persistence and idempotency finalization are not atomic; a failure after handoff orphans the ERP order and permanently bricks the idempotency key | ✅ `dbdedb7` |
| 8 | High | runtime-security | Production guardrail permits unauthenticated Hashavshevet REST calls when H-Connect is enabled | ✅ `377df6c` |
| 9 | High | mobile | Token-refresh callback permanently unregistered after logout, never restored on re-login | ✅ `f4b326f` |
| 10 | High | portal | Retry after a transient failure during mismatch-confirm reverts to stale prices while reusing the same idempotency key | ✅ `f4b326f` |
| 11 | Medium | erp | Order reference truncation keeps the FIRST 9 digits of a random UUID, causing ERP reference collisions | ✅ `dbdedb7` |
| 12 | Medium | auth-sessions | Activation rate-limiter keyed on spoofable leftmost X-Forwarded-For, enabling per-IP throttle bypass | ✅ `377df6c` |
| 13 | Medium | mobile | Approved-items load has no stale-request guard; out-of-order responses show wrong customer's items | ✅ `f4b326f` |
| 14 | Medium | portal | Order success confirmation displays stale pre-mismatch prices after the customer accepts new ERP prices | ✅ `f4b326f` |
| 15 | Low | auth-sessions | Shift-token revocation check compares millisecond agent.updatedAt against second-truncated JWT iat, falsely revoking freshly issued tokens | ✅ `377df6c` |
| 16 | Low | data-layer | removeApprovedItem check-then-delete throws unhandled Prisma P2025 on concurrent/duplicate removal | ✅ `08c5ddb` |
| 17 | Low | runtime-security | Guardrail rejects a valid H-Connect-only production config that the adapter fully supports | ✅ `377df6c` |
| 18 | Low | runtime-security | Unset/empty CORS_ALLOWED_ORIGINS silently allows localhost dev origins with credentials in production | ✅ `377df6c` |

---

### 1. Order handoff retry re-POSTs a possibly-committed order (no idempotency key) → duplicate ERP documents

- **Severity:** High  ·  **Area:** erp  ·  **Verdict:** confirmed
- **Where:** `apps/api/src/erp/hashavshevet.adapter.ts:142`
- **Status:** ✅ Resolved in `dbdedb7`

**Failure scenario.** handoffOrder() (line 142) calls withRetry -> handoffOrderViaHConnect (line 150) -> invokeCapabilityPlugin('movein', ...) -> fetch (line 945). Suppose the POST reaches Hashavshevet and the imovein plugin commits the order document, but the response body read times out (AbortController fires at requestTimeoutMs). invokeHConnectPlugin maps this to ERP_TIMEOUT (lines 971-977). ERP_TIMEOUT is in RETRYABLE_HANDOFF_ERROR_CODES (line 105-108), so isNonRetryableHandoffError returns false (line 1110) and withRetry (line 992-1011) re-POSTs the identical movein pluginData — reference is derived deterministically from orderId so it is byte-identical — creating a SECOND document. Up to 3 attempts => up to 3 duplicate documents. If all 3 attempts fail this way, withRetry throws ERP_ORDER_HANDOFF_FAILED(cause ERP_TIMEOUT); CompositeErpGateway.handoffOrder then sees shouldFallbackToBmax=true and ALSO submits the order to BMaxXmlAdapter (composite-erp.gateway.ts:51-53), i.e. a 4th submission via a different provider. orders.service.ts only catches the final error and never learns about the already-committed duplicates. Hashavshevet is the declared single source of truth, so this produces duplicate real orders/invoices.

**Recommended fix.** Send a stable idempotency token to the imovein plugin (e.g. include orderId/reference and have the ERP dedupe on it), OR only retry failures that are provably pre-transmission (connection-refused / DNS), never a timeout that occurred while awaiting the response. Do not let CompositeErpGateway fall back to BMax after a wrapped timeout that may have committed.

---

### 2. Unrecognized H-Connect business errors default to ERP_UNAVAILABLE (retryable + B-MAX fallback), masking permanent rejections as accepted orders

- **Severity:** High  ·  **Area:** erp  ·  **Verdict:** confirmed
- **Where:** `apps/api/src/erp/hashavshevet.adapter.ts:1362`
- **Status:** ✅ Resolved in `dbdedb7`

**Failure scenario.** Hashavshevet rejects a handoff with a business error such as {"status":"error","message":"Item key ITM-9 not found"} or "Customer account is blocked". detectHConnectErrorMessage returns that message (lines 1400-1408), and detectHConnectError (lines 1334-1363) checks for 'missing'/'failed to validate'/'invalid json' (no), 'not allowed'/'must consist'/'authentication'/'authorization' (no), 'not in service'/'failed to load' (no), then hits the default return at line 1362 => ERP_UNAVAILABLE. That code is retryable, so withRetry re-submits the invalid order 3 times, then wraps it as ERP_ORDER_HANDOFF_FAILED(cause ERP_UNAVAILABLE). CompositeErpGateway.handoffOrder sees a fallback-eligible chain (composite-erp.gateway.ts:144-156) and calls BMaxXmlAdapter.handoffOrder, which returns status 'pending_retry'. orders.service.ts:179-201 then persists the order and returns 201 to the customer. Net effect: an order Hashavshevet permanently rejected (nonexistent item / blocked account) is accepted into the B-MAX queue and reported as success. Note even 'validation failed' text is misclassified because the code only matches the exact substring 'failed to validate', not 'validation failed'.

**Recommended fix.** Default unknown H-Connect plugin errors to a non-retryable, non-fallback code (ERP_VALIDATION_FAILED) at line 1362, and reserve ERP_UNAVAILABLE for explicit transport/service-down signals only.

---

### 3. Handoff response never captures the Hashavshevet document reference for wrapped ({data:[...]}) responses

- **Severity:** High  ·  **Area:** erp  ·  **Verdict:** confirmed
- **Where:** `apps/api/src/erp/hashavshevet.adapter.ts:739`
- **Status:** ✅ Resolved in `dbdedb7`

**Failure scenario.** For the documented response shape {"data":[{"reference":"123456789","DocumentID":"123456789"}]} (exactly the shape used by the adapter's own tests), handoffOrderViaHConnect does extractPrimaryRecord(payload) at line 739. payload is a record (not an array), so extractPrimaryRecord returns the outer {data:[...]} object (lines 1580-1593). readOptionalIdentifier then looks for externalRef/reference/DocumentID at the TOP level (lines 742-750) and finds none (they live inside data[0]), so externalRef falls back to `imovein:${orderId}` (line 751). Unlike the report path, the handoff path never calls normalizeHConnectReportResponse to unwrap data/message. orders.service.ts:183,192 persists this as orderRef and returns it to the customer, so the real Hashavshevet document number is lost and the order cannot be reconciled or cancelled against the ERP by document number.

**Recommended fix.** Unwrap the handoff response before extracting the identifier (reuse normalizeHConnectReportResponse or dig into the data/message array via extractPrimaryRecord on the unwrapped rows) so reference/DocumentID from the ERP row is captured.

---

### 4. No upper bound on order quantity overflows the Decimal order columns during persistence, which runs after the ERP order is already committed

- **Severity:** High  ·  **Area:** orders-pricing  ·  **Verdict:** confirmed
- **Where:** `apps/api/src/orders/dto/customer-order-submit.dto.ts:27`
- **Status:** ✅ Resolved in `dbdedb7`

**Failure scenario.** A valid customer session submits one line {itemId:'item-1', quantity: 100000000000, unit:'kg', clientUnitPrice: 49.9} where 49.9 matches the ERP price. The DTO passes: quantity is finite, has <=3 decimals, is >= 0.001, and there is no @Max (customer-order-submit.dto.ts:26-27). Price revalidation passes (areEqualMoneyValues). orders.service.ts:146 calls erpGateway.handoffOrder -> Hashavshevet CREATES order ORD-X and returns externalRef. Then orders.service.ts:188 calls persistOrderSubmission, where new Prisma.Decimal(quantity) is written to OrderLine.quantity Decimal(14,3) (max 99,999,999,999.999); 1e11 has 12 integer digits -> Postgres 'numeric field overflow' -> PrismaClientKnownRequestError. This is not an ErpGatewayError, so it is NOT caught (orders.service.ts has no catch around persist) and propagates as HTTP 500. Net state: ERP holds order ORD-X with NO local Order row (the agent list/cancel endpoints can never see or cancel it), and the idempotency_keys row is left with response_status NULL, so every retry with the same idempotency key hits reserveIdempotencyKey lines 71-73 and returns 409 CustomerOrderIdempotencyKeyConflictError forever. A more modest quantity such as 30000000000 * 49.9 = 1.497e12 overflows lineTotalSnapshot Decimal(14,2) (max ~9.99e11) with the identical outcome.

**Recommended fix.** Add a business-sane @Max to quantity and clientUnitPrice in CustomerOrderSubmitLineDto (e.g. @Max(99999999) on quantity), and reject before handoff any line whose quantity*unitPrice or the summed estimatedTotal would exceed Decimal(14,2). Additionally, since a post-handoff persistence failure orphans the ERP order and poisons the key, wrap the handoff+persist so that on any persistence error the idempotency reservation is released (deleted) rather than left NULL, and ideally validate/persist locally (or reserve the DB write) before committing the ERP handoff.

---

### 5. Transient ERP-unavailable (503) responses are finalized into the idempotency key and replayed forever, so the order can never be placed with that key after ERP recovers

- **Severity:** High  ·  **Area:** orders-pricing  ·  **Verdict:** confirmed
- **Where:** `apps/api/src/orders/orders.service.ts:76`
- **Status:** ✅ Resolved in `dbdedb7`

**Failure scenario.** Customer submits a valid order with idempotency-key 'K' during a brief Hashavshevet outage. erpGateway.getCustomerPricing throws ErpGatewayError(ERP_UNAVAILABLE). The catch at orders.service.ts:70-82 builds a 503 replay and calls finalizeIdempotencyKey(reservation.idempotencyId, {statusCode:503, body:{code:'CUSTOMER_ORDER_ERP_UNAVAILABLE',...}}) at lines 76-81, persisting response_status=503 and response_body_json on the key (the handoff-failure catch at lines 154-165 does the same). The ERP recovers seconds later. The client retries the SAME operation reusing idempotency-key 'K' (standard idempotency practice). reserveIdempotencyKey finds the existing row, hashCustomerId/customerSessionId/requestHash all match, responseStatus is 503 (not null), and toReplayBody matches the ERP-unavailable branch (orders.repository.ts:463-469), so it returns kind:'replay' with the 503 body. The customer receives 503 again -- and on every subsequent retry with key 'K' -- and can never place the order. (Not finalizing instead would leave response_status NULL, which reserveIdempotencyKey treats as 'conflict' 409, so the order is blocked either way.)

**Recommended fix.** Do not persist transient 5xx outcomes as the idempotent result. In the ERP-unavailable catch blocks, delete/release the reserved idempotency_keys row (or leave a short-lived non-replayable marker) instead of calling finalizeIdempotencyKey, so a same-key retry starts a fresh attempt once the ERP is healthy. Only finalize terminal results (201 success and 409 line mismatch).

---

### 6. Concurrent order submits create duplicate orders (and duplicate ERP handoffs) for a single-use magic link

- **Severity:** High  ·  **Area:** data-layer  ·  **Verdict:** confirmed
- **Where:** `apps/api/src/orders/orders.repository.ts:109`
- **Status:** ✅ Resolved in `ff7e701`

**Failure scenario.** The customer portal is opened in two tabs that share the stored session token (each tab's submitIdempotencyKeyRef is a separate React ref, so each generates a different crypto.randomUUID() idempotency key). Both tabs POST /v1/customer/orders at the same time. Both pass CustomerSessionAuthGuard.validateCustomerSession (session read as ACTIVE in both, no row lock). reserveIdempotencyKey succeeds for both (distinct keys, so no ON CONFLICT). Both call erpGateway.handoffOrder -> TWO real orders are sent to Hashavshevet (the ERP source of truth). Both call persistOrderSubmission, which unconditionally tx.order.create (customer_session_id has no unique constraint -> both inserts succeed) and each sets the session to CLOSED / magic link to CONSUMED. Net result: two Order rows + two ERP orders for a magic link that is supposed to be single-use.

**Recommended fix.** Make session consumption the gate for order creation inside the persist transaction: run `tx.session.updateMany({ where: { id: customerSessionId, status: ACTIVE, isActive: true }, data: { status: CLOSED, isActive: false } })` FIRST and if `count === 0` abort/roll back before creating the Order and before (ideally) the ERP handoff. Additionally add a DB-level backstop such as a partial unique index enforcing at most one SUBMITTED order per customer_session_id, so the second concurrent insert fails instead of duplicating.

---

### 7. ERP handoff, order persistence and idempotency finalization are not atomic; a failure after handoff orphans the ERP order and permanently bricks the idempotency key

- **Severity:** High  ·  **Area:** data-layer  ·  **Verdict:** confirmed
- **Where:** `apps/api/src/orders/orders.service.ts:188`
- **Status:** ✅ Resolved in `dbdedb7`

**Failure scenario.** handoffOrder returns success (order really created in Hashavshevet), then persistOrderSubmission throws a transient error (DB connection drop / deadlock). The idempotency_keys row reserved at the start is never finalized, so response_status stays NULL and no Order/OrderLine rows exist locally. Because persist failed, the session is still ACTIVE, so the customer retries the identical request with the same idempotency key. reserveIdempotencyKey finds the existing row, matches customer/session/requestHash, but response_status is NULL -> returns { kind: 'conflict' } -> the API responds 409 idempotency_conflict. The portal's idempotency_conflict handler does not regenerate the key, so every retry reuses the same key and gets 409 forever. The customer can never record the order that already exists in the ERP.

**Recommended fix.** Persist the order and finalize the idempotency key in a single transaction, and perform the ERP handoff under an outbox/retry pattern (or reconcile on failure) so a post-handoff DB failure does not leave an un-finalized reservation. At minimum, on any thrown error after reservation, finalize the idempotency row with a retriable error body (or delete the reservation) so the same key does not permanently return conflict while a real ERP order is orphaned.

---

### 8. Production guardrail permits unauthenticated Hashavshevet REST calls when H-Connect is enabled

- **Severity:** High  ·  **Area:** runtime-security  ·  **Verdict:** confirmed
- **Where:** `apps/api/src/runtime/production-guardrails.ts:59`
- **Status:** ✅ Resolved in `377df6c`

**Failure scenario.** Set NODE_ENV=production, HASH_ENV=production, HASH_HCONNECT_ENABLED=true with full H-Connect creds (station/company/netPassportId/signatureToken), HASH_API_URL=https://hash.prod/api, and NO HASH_API_KEY/HASH_PROD_API_KEY. Map only SOME H-Connect reports (e.g. assignedCustomers) but leave the catalog report unset. Guardrail line 59 evaluates hasRestBaseUrl(true) && !hasRestApiKey(true) && !(hconnectEnabled && hasHconnectCredentials)(false) => false, so it does NOT throw; the adapter's own check at line 1141 has the identical exemption and also passes. App boots. When getMasterCatalog() runs (hashavshevet.adapter.ts:263-278): hconnect.reports.catalog is null so the H-Connect branch is skipped, restEnabled is true so it does not throw, and it calls fetchJson(catalogPath) which uses buildHeaders(null) — sending the request to the production ERP with NO api key / authorization header. Same for getAssignedCustomers/getCustomerRecentItems/getCustomerPricing. The guardrail's stated invariant ('Production runtime forbids unauthenticated Hashavshevet REST calls') is bypassed.

**Recommended fix.** Remove the `!(hconnectEnabled && hasHconnectCredentials)` exemption from the unauthenticated-REST check in both places: in production, if a REST base URL is configured (hasRestBaseUrl) then a REST API key MUST be present, unconditionally — e.g. `if (hasRestBaseUrl && !hasRestApiKey) throw ...` at production-guardrails.ts:59 and the equivalent `if (restEnabled && apiKey === null) throw ...` at hashavshevet.adapter.ts:1141. (Alternatively, make the adapter never fall back to REST while hconnect.enabled is true.)

---

### 9. Token-refresh callback permanently unregistered after logout, never restored on re-login

- **Severity:** High  ·  **Area:** mobile  ·  **Verdict:** confirmed
- **Where:** `apps/agent-mobile/src/auth/auth-provider.tsx:144`
- **Status:** ✅ Resolved in `f4b326f`

**Failure scenario.** 1) App launches; AuthProvider mounts and its useEffect([]) (auth-provider.tsx:92-114) calls registerRefreshCallback(cb). 2) Agent logs in, works, then taps 'יציאה מהמערכת' -> signOut() runs unregisterRefreshCallback() (auth-provider.tsx:144), setting _refreshCallback=null (token-refresher.ts:17-20). 3) AuthProvider is mounted above the navigator (App.tsx:85) and does NOT unmount on logout, so the [] effect never re-runs; signIn() (auth-provider.tsx:116-141) does not register either. 4) Agent logs in again (same process). _refreshCallback is still null. 5) ~15 min later the access token expires; listAssignedCustomers returns 401; requestAgentApi's interceptor (agent-customers-client.ts:392-408) calls executeRefresh(), which returns null because _refreshCallback is null (token-refresher.ts:31-33). 6) No retry happens, the 401 propagates as AgentApiError(401), and loadCustomers (authenticated-home-screen.tsx:379-382) calls signOut(). The agent is forcibly kicked out mid-shift even though a valid, unexpired refresh token is in SecureStore. The refresher's own test (token-refresher.test.ts:112-127) shows a NEW callback must be re-registered after unregister for refresh to work again.

**Recommended fix.** Keep register/unregister tied to mount/unmount only. In token-refresher.ts add invalidateRefreshSession() that bumps _sessionGeneration (and clears _refreshPromise) WITHOUT nulling _refreshCallback, and call that from signOut() instead of unregisterRefreshCallback(). Alternatively, hoist refreshCallback into a stable useCallback and call registerRefreshCallback(refreshCallback) again at the end of a successful signIn(). Either way the singleton must hold a live callback whenever the provider is mounted and authenticated.

---

### 10. Retry after a transient failure during mismatch-confirm reverts to stale prices while reusing the same idempotency key

- **Severity:** High  ·  **Area:** portal  ·  **Verdict:** confirmed
- **Where:** `apps/customer-portal/src/customer-portal-routes.tsx:492`
- **Status:** ✅ Resolved in `f4b326f`

**Failure scenario.** item-1 stale price 42.50, accepted mismatch price 49.90. Customer clicks “אשר ושדר הזמנה” -> handleSubmit(true) generates key K2 and submits clientUnitPrice 49.90. The network drops after the server commits the order at 49.90 but before the response arrives; catch sets submitState='error' and K2 is retained (not reset). Customer clicks “נסו לשלוח שוב” -> handleSubmit(); since submitState is now 'error' (not 'mismatch'), mismatchOverrides is empty, so line 498 resolves clientUnitPrice back to the stale 42.50, and the same key K2 is reused (line 524). Server sees same idempotency key + different payload -> 409 (non-ORDER_LINES_MISMATCH) -> PortalApiError('idempotency_conflict') -> “מפתח השליחה פג תוקף”. The customer believes the order failed even though it was committed at 49.90 (duplicate-order risk / stuck checkout). If the original request never reached the server, the stale-price retry instead re-triggers ORDER_LINES_MISMATCH, looping back to the mismatch prompt with the price reverted.

**Recommended fix.** Persist the accepted mismatch prices independently of submitState (e.g., in a ref or by updating the order state's unitPrice) and apply them on every subsequent submit attempt instead of gating on submitState.status === 'mismatch'; additionally rotate the idempotency key whenever the outbound price payload differs from the one the current key was issued for.

---

### 11. Order reference truncation keeps the FIRST 9 digits of a random UUID, causing ERP reference collisions

- **Severity:** Medium  ·  **Area:** erp  ·  **Verdict:** confirmed
- **Where:** `apps/api/src/erp/hashavshevet.adapter.ts:723`
- **Status:** ✅ Resolved in `dbdedb7`

**Failure scenario.** orders.service.ts:142 sets orderId = randomUUID(). In handoffOrderViaHConnect line 723, request.orderId.replaceAll(/\D+/g,'').slice(0,9) keeps the first 9 digit characters of the UUID; those 9 digits are uniform over 10^9, so by the birthday bound roughly 1 in ~31,600 orders collides, and collisions become likely within a few tens of thousands of orders (well within a B2B factory's lifetime). Two distinct orders then send the identical `reference` field to the imovein plugin. If the ERP treats reference as a document key it will conflate or reject the second order; if it does not, reconciliation/cancellation keyed on reference matches the wrong order. (For long sequential numeric IDs the collapse is even worse: '1000000001' and '1000000002' both slice to '100000000'.)

**Recommended fix.** Use a collision-resistant reference: take the last 9 digits, hash the orderId to 9 digits, or pass the full orderId if the ERP field allows it, instead of slicing the leading 9 digits.

---

### 12. Activation rate-limiter keyed on spoofable leftmost X-Forwarded-For, enabling per-IP throttle bypass

- **Severity:** Medium  ·  **Area:** auth-sessions  ·  **Verdict:** confirmed
- **Where:** `apps/api/src/sessions/sessions.controller.ts:74`
- **Status:** ✅ Resolved in `377df6c`

**Failure scenario.** In production the app sits behind a reverse proxy/LB whose socket address is a private/loopback IP. request.ip is therefore a trusted-proxy IP (isTrustedProxyIp returns true at line 59), so resolveClientIp() falls through to readForwardedIp(), which at line 74 takes forwardedForValue.split(',')[0] — the leftmost X-Forwarded-For value. A standard proxy (e.g. nginx `$proxy_add_x_forwarded_for`) APPENDS the real client IP to the right of whatever the client sent, so the leftmost value is fully attacker-controlled. An attacker hitting POST /v1/customer/sessions/activate sets a different `X-Forwarded-For: <random>` per request; each yields a distinct bucket in ActivationRateLimiter, so activationRateLimitBurst (default 5/60s) is never reached and the throttle intended to cap activation attempts per IP is defeated (unbounded activation attempts, audit-log/DB flooding, and loss of the abuse-protection the limiter exists to provide).

**Recommended fix.** Do not trust the leftmost XFF entry. Given a known number of trusted proxy hops, select the Nth-from-rightmost XFF value (the first untrusted address walking right-to-left), or configure Fastify `trustProxy` with the specific proxy CIDRs and use request.ip instead of hand-parsing the header. At minimum, change readForwardedIp to take the rightmost non-trusted address rather than split(',')[0].

---

### 13. Approved-items load has no stale-request guard; out-of-order responses show wrong customer's items

- **Severity:** Medium  ·  **Area:** mobile  ·  **Verdict:** confirmed
- **Where:** `apps/agent-mobile/src/screens/authenticated-home-screen.tsx:407`
- **Status:** ✅ Resolved in `f4b326f`

**Failure scenario.** Effect at authenticated-home-screen.tsx:456-464 calls loadApprovedItemsForCustomer(selectedCustomerId) on every selection change with no cancellation. Agent taps customer A -> GET /v1/agent/customers/A/approved-items starts (slow). Agent immediately taps customer B -> GET .../B/approved-items starts and resolves first; setApprovedItems(B.items) runs (line 407). Then A's request resolves and runs setApprovedItems(A.items), while selectedCustomerId is still B. The UI now shows customer B selected but lists customer A's approved cuts. For a meat-ordering app this is a real data-integrity issue: the agent sees/acts on the wrong customer's approved catalog. loadApprovedItemsForCustomer's deps are [beginSlowNetworkTimer, token] (not selectedCustomerId), so its identity is stable and no cleanup cancels the in-flight call.

**Recommended fix.** Add a stale-request guard: keep a ref (e.g. latestApprovedItemsCustomerIdRef) updated to the customerId currently being loaded (set it in the effect or at the top of loadApprovedItemsForCustomer), and after the await do `if (latestApprovedItemsCustomerIdRef.current !== customerId) return` before setApprovedItems/setItemImageCandidateIndexByItemId. Alternatively use an AbortController per request and abort the previous one in the effect cleanup.

---

### 14. Order success confirmation displays stale pre-mismatch prices after the customer accepts new ERP prices

- **Severity:** Medium  ·  **Area:** portal  ·  **Verdict:** confirmed
- **Where:** `apps/customer-portal/src/customer-portal-routes.tsx:1047`
- **Status:** ✅ Resolved in `f4b326f`

**Failure scenario.** item-1 is displayed at ₪42.50/kg, qty 1 (cart total ₪42.50). ERP price changed to ₪49.90. Customer submits -> server returns ORDER_LINES_MISMATCH with currentUnitPrice 49.90. Customer clicks “אשר ושדר הזמנה”, which calls handleSubmit(true); the request is sent with clientUnitPrice 49.90 (verified by the test at customer-portal-routes.test.tsx:462) and the order is committed at 49.90. handleSubmit only mutates the outbound request via mismatchOverrides (lines 491-510) and never updates state.cart.lines[].lineEstimate / state.cart.estimatedTotal. The success overlay (lines 1002-1047, e.g. line 1037 lineEstimate and line 1047 estimatedTotal) therefore shows ₪42.50 total — a price/total the customer never confirmed, misrepresenting the committed B2B order.

**Recommended fix.** On accepting a mismatch, write the server's accepted currentUnitPrice back into the order state (rebuild the cart/section unitPrice from the mismatch lines) before or immediately after a successful submit — or reload portal data with preserved quantities — so the confirmation overlay and summary totals reflect the prices actually submitted and committed.

---

### 15. Shift-token revocation check compares millisecond agent.updatedAt against second-truncated JWT iat, falsely revoking freshly issued tokens

- **Severity:** Low  ·  **Area:** auth-sessions  ·  **Verdict:** confirmed
- **Where:** `apps/api/src/auth/agent-auth.guard.ts:61`
- **Status:** ✅ Resolved in `377df6c`

**Failure scenario.** A supervisor force-logs-out agent X at 10:00:00.400 (agent.updatedAt = ...400ms). Agent X immediately re-authenticates and AuthService.login issues a new shift token at 10:00:00.900; jsonwebtoken sets iat = floor(10:00:00.900) = 10:00:00, so resolveIssuedAtMilliseconds returns 10:00:00.000. On the next request the guard evaluates agent.updatedAt.getTime() (10:00:00.400) > issuedAtMs (10:00:00.000) => true and throws AgentAccessRevokedError, locking out a user whose token was actually issued 500ms AFTER the force-logout. The check fails closed (no security hole) but denies access to a legitimately re-authenticated agent until the next second boundary. Note the refresh path (auth.service.ts:93) uses full-millisecond createdAt, so the two revocation comparisons are inconsistent.

**Recommended fix.** Compare against the token's real issue time at second granularity on both sides: reject only when Math.floor(agent.updatedAt.getTime()/1000) > payload.iat (i.e., strictly later second), or persist/track token issuance with millisecond precision to match agent.updatedAt instead of relying on the truncated iat.

---

### 16. removeApprovedItem check-then-delete throws unhandled Prisma P2025 on concurrent/duplicate removal

- **Severity:** Low  ·  **Area:** data-layer  ·  **Verdict:** confirmed
- **Where:** `apps/api/src/customers/customers.repository.ts:202`
- **Status:** ✅ Resolved in `08c5ddb`

**Failure scenario.** An agent double-clicks Remove (or has the customer open in two tabs), firing two concurrent DELETE requests for the same (hashCustomerId, hashItemId). Both calls pass the findUnique existence check. The first transaction's tx.approvedItem.delete succeeds; the second transaction's tx.approvedItem.delete targets the now-missing row and throws Prisma P2025. That error is not handled, so the second request returns HTTP 500 instead of an idempotent { removed: false }.

**Recommended fix.** Replace the read-then-delete with an atomic conditional delete: use `tx.approvedItem.deleteMany({ where: { hashCustomerId, hashItemId } })` and treat `count === 0` as { removed: false } (skipping the audit log), or wrap the delete and catch Prisma P2025 to return { removed: false }.

---

### 17. Guardrail rejects a valid H-Connect-only production config that the adapter fully supports

- **Severity:** Low  ·  **Area:** runtime-security  ·  **Verdict:** confirmed
- **Where:** `apps/api/src/runtime/production-guardrails.ts:40`
- **Status:** ✅ Resolved in `377df6c`

**Failure scenario.** Set NODE_ENV=production, HASH_ENV=production, all four HASH_HCONNECT_* credentials, do NOT set HASH_HCONNECT_ENABLED, and do NOT set any HASH_API_URL/HASH_PROD_API_URL. Adapter: loadHConnectConfig enabled = resolveOptionalBoolean(undefined) ?? hasRequiredConfig = true; its production check at line 1135 (`!restEnabled && !(hconnect.enabled && hasHconnectCredentials)`) => `true && !(true && true)` => false, so it accepts the config. Guardrail (runs first in createApiApp, main path via server.ts:56): hconnectEnabled = resolveOptionalBoolean(undefined) ?? false = false; line 53 `!hasRestBaseUrl && !(hconnectEnabled && hasHconnectCredentials)` => `true && !(false && true)` => `true && true` => THROWS 'Production runtime requires Hashavshevet production credentials.' The app never boots despite a valid, supported configuration.

**Recommended fix.** Make the guardrail's enable resolution match the adapter: compute hasHconnectCredentials first, then `const hconnectEnabled = resolveOptionalBoolean(env.HASH_HCONNECT_ENABLED) ?? hasHconnectCredentials;` so full-credential H-Connect deployments are accepted the same way the adapter accepts them.

---

### 18. Unset/empty CORS_ALLOWED_ORIGINS silently allows localhost dev origins with credentials in production

- **Severity:** Low  ·  **Area:** runtime-security  ·  **Verdict:** confirmed
- **Where:** `apps/api/src/main.ts:43`
- **Status:** ✅ Resolved in `377df6c`

**Failure scenario.** Deploy to production without setting CORS_ALLOWED_ORIGINS, or set CORS_ALLOWED_ORIGINS="" intending to lock CORS down. main.ts:35-37 produces an empty array (split(',') on '' -> [''] -> filtered to []), so configuredOrigins.length===0 and line 43 returns the DEFAULT set. The CORS callback (server.ts:91) then answers `allowedOrigins.has(origin)` true for http://localhost:8080 etc. and responds with Access-Control-Allow-Credentials:true. A page an attacker gets loaded at one of those local origins can issue credentialed cross-origin requests to the production API. Setting the variable empty to disable CORS instead re-enables the permissive dev defaults.

**Recommended fix.** In production, require CORS_ALLOWED_ORIGINS to be explicitly configured (throw at boot if missing) rather than falling back to localhost defaults, and treat an explicitly-set-but-empty value as deny-all instead of reverting to DEFAULT_CORS_ALLOWED_ORIGINS.

---

## Documentation corrections (29)

All applied in commits `1bf2a9a`, `22a6481`, `9da56e4`. The recurring theme: docs claimed a stack the code does not use, and an always-live ERP that is actually mocked by default.

### `README.md` (4)

- **[high] L147** `MAGIC_LINK_SIGNING_SECRET` is not a real env var. It is not read anywhere in the API source (no `process.env.MAGIC_LINK_SIGNING_SECRET` in apps/api/src) and is absent from every .env.example. Magic links are unsigned random tokens: apps/api/src/links/token-generator.ts uses `randomBytes(32).toString('base64url')` and apps/api/src/links/links.service.ts persists only `createHash('sha256')...digest('hex')` — there is no HMAC signing, so no signing secret exists. The actual magic-link env vars are `MAGIC_LINK_BASE_URL` and `MAGIC_LINK_TTL_SECONDS` (apps/api/.env.example).
- **[medium] L186** The gateway class names are wrong. In apps/api/src/erp/ the interface is `ErpGateway` (correct), but the primary adapter is `HashavshevetAdapter` (hashavshevet.adapter.ts, not `HashavshevetApiGateway`) and the fallback is `BMaxXmlAdapter` (bmax-xml.adapter.ts, not `BmaxXmlGateway`). They are wired together by `CompositeErpGateway` (composite-erp.gateway.ts), which implements `ErpGateway` and does the Hashavshevet-primary/B-MAX-fallback dispatch. A separate `TestingErpAdapter` implements the same interface for HASH_ENV=testing.
- **[medium] L12** Implies the ERP is always live, but the only documented run path is fully mocked. `pnpm api:dev:test` (the command in Getting Started, line 152) sets HASH_ENV=testing, and apps/api/src/erp/erp.module.ts binds ERP_GATEWAY to the in-process `TestingErpAdapter` (not the real Hashavshevet) whenever HASH_ENV==='testing'. The live H-Connect Hashavshevet path only runs under HASH_ENV=production and is additionally gated by `HASH_HCONNECT_ENABLED`, which defaults to false in apps/api/.env.example. A reviewer following the README exercises the mock, not a live ERP.
- **[low] L51** Only 10 files match `.github/workflows/squad-*`: squad-ci, squad-docs, squad-heartbeat, squad-insider-release, squad-issue-assign, squad-label-enforce, squad-preview, squad-promote, squad-release, squad-triage. (There is an 11th squad-related workflow, sync-squad-labels.yml, plus a generic ci.yml, but neither matches the `squad-*` prefix.)

### `docs/PRD.md` (5)

- **[medium] L14** Overstated/contradicted by code. The backend is NOT strictly a Hashavshevet read/write passthrough: it owns a full PostgreSQL database (Prisma) with domain models Assignment, ApprovedItem, MagicLink, Session, Order/OrderLine, IdempotencyKey, AuditLog and CustomerProfile (apps/api/prisma/schema.prisma). The Approved Items whitelist is created/listed/deleted only in the local ApprovedItem table (apps/api/src/customers/customers.repository.ts) and is never written back to Hashavshevet, and agent-customer assignments are created/removed via the supervisor control plane into the local Assignment table (apps/api/src/supervisor/supervisor.repository.ts), not via the Hashavshevet API.
- **[medium] L22** Contradicted by code. The assigned-customer list returned to the agent app is served from the local Postgres Assignment table (PrismaAgentCustomersRepository.listAssignedCustomers), not pulled from Hashavshevet. In CustomersService.getAssignedCustomers (apps/api/src/customers/customers.service.ts) the ERP call erpGateway.getAssignedCustomers(agentId) is made but its result is discarded (the Promise.all result is destructured as [customers], using only the local repository value; ERP errors are merely logged). Assignments are populated by the supervisor control plane and seed data, not synced from Hashavshevet.
- **[low] L24** 'permanently' is contradicted by code: there is a DELETE /v1/agent/customers/:customerId/approved-items/:hashItemId endpoint (CustomersController.removeApprovedItem -> customers.repository.removeApprovedItem) that hard-deletes the row. The item is also stored in the local ApprovedItem table, not written to the customer's profile in Hashavshevet.
- **[low] L40** Misleading. B-MAX XML is not an alternate Hashavshevet payload format; it is a separate fallback ERP provider (BMaxXmlAdapter, provider 'bmax_xml'). CompositeErpGateway.handoffOrder only calls it when the Hashavshevet handoff throws a retryable error (ERP_UNAVAILABLE/ERP_TIMEOUT/ERP_NOT_IMPLEMENTED). BMaxXmlAdapter.handoffOrder builds an XML envelope but returns status 'pending_retry' with externalRef 'bmax-queue:...' (apps/api/src/erp/bmax-xml.adapter.ts) - it queues to B-MAX, it does not inject directly into Hashavshevet.
- **[low] L34** Missing a critical caveat a reviewer needs. The whole ERP integration is mockable: ErpModule binds ERP_GATEWAY to the in-memory TestingErpAdapter whenever HASH_ENV=testing, and resolveHashEnvironment defaults to 'testing' when HASH_ENV is unset (apps/api/src/erp/erp.module.ts, apps/api/src/runtime/production-guardrails.ts). Only HASH_ENV=production routes to CompositeErpGateway/Hashavshevet. The repo's default local and deploy-test scripts (api:dev:test, deploy:up:test, deploy:test in package.json) all run HASH_ENV=testing, so in those workflows pricing and order handoff are served by the mock, never live Hashavshevet.

### `docs/Architecture.md` (14)

- **[high] L30** The doc presents Hashavshevet as a live read/write ERP everywhere (SSOT, this diagram arrow, Section 8) but never states the critical caveat that in testing mode the ERP is a mock. In apps/api/src/erp/erp.module.ts (lines 16-26) the ERP_GATEWAY provider is bound via useFactory: when resolveHashEnvironment(process.env.HASH_ENV)==='testing' it returns the in-code TestingErpAdapter (no network, canned data); only otherwise does it return CompositeErpGateway (real Hashavshevet + B-MAX). HASH_ENV=testing is the default for local/dev and CI: root package.json scripts api:dev:test and deploy:up:test set HASH_ENV=testing, and .github/workflows/ci.yml sets HASH_ENV: testing.
- **[high] L59** The agent-app tech stack lists TanStack Query, Zustand, and React Hook Form, but none of these are dependencies of apps/agent-mobile/package.json. The app uses React Context for auth state (src/auth/auth-provider.tsx), hand-written fetch clients for server data (src/api/auth-client.ts, src/api/agent-customers-client.ts), and manual form handling in src/screens/login-screen.tsx with a custom validator (src/auth/validation.ts). Only Zod, React Navigation, and Expo SecureStore from this list are actually present.
- **[medium] L76** The customer-portal stack claims TanStack Query and Zod-validated API contracts, but apps/customer-portal/package.json depends on neither. Data fetching uses a hand-written client (src/portal-api-client.ts) and React state in src/customer-portal-routes.tsx; payloads are validated with hand-rolled normalizers (normalizeRecentOrdersFeed, toNonEmptyString, etc.), not Zod. Routing uses react-router-dom. The shared-types package (packages/shared-types) is pure TypeScript types with no Zod either.
- **[low] L77** Section 3.2 says the portal uses 'CSS Modules / app-level CSS', but the portal styles with Tailwind-style utilities via a shadcn/ui-flavored component set: apps/customer-portal/package.json includes class-variance-authority, clsx, tailwind-merge and @radix-ui/react-slot, with src/lib/cn.ts and src/components/ui/*. Styling is class-utility based plus a single app-level src/customer-portal.css, not CSS Modules.
- **[medium] L91** The backend is described as using a Pino logger (also Section 12 line 491 'Structured JSON logs (Pino)'), but there is no pino dependency in apps/api/package.json and no logger is configured. src/server.ts constructs FastifyAdapter({ bodyLimit }) with no logger option (Nest's Fastify adapter leaves request logging off by default). Observability is actually via Sentry (@sentry/nestjs, initialized in src/main.ts) plus an x-request-id correlation hook in server.ts.
- **[high] L92** Both Section 3.3 (line 92) and Section 9.4 (line 429, 'Input validation with DTO + Zod') claim Zod is used for backend request validation. The API has no zod dependency (apps/api/package.json); it validates with class-validator + class-transformer through a global Nest ValidationPipe (whitelist/forbidNonWhitelisted, src/server.ts). DTOs use class-validator decorators, e.g. src/auth/dto/agent-login-request.dto.ts uses @IsString()/@IsNotEmpty().
- **[high] L454** Redis is described as the cache for read-through data (master catalog, price list, recent items) and for 'ephemeral session/token caching' (Section 2 line 48). The API has no Redis client dependency and uses none for caching or sessions: the catalog cache is an in-process field (src/catalog/catalog.service.ts, `private cache`, default TTL 300s via CATALOG_CACHE_TTL_SECONDS), activation rate limiting is an in-memory Map (src/sessions/activation-rate-limiter.ts), and magic links/sessions/idempotency are persisted in PostgreSQL via Prisma. Redis appears only as an optional readiness probe that opens a raw TCP socket and sends PING when REDIS_URL is set (src/ready/ready.probes.ts).
- **[medium] L420** Section 9.3 says refresh tokens are an 'Optional refresh token in Phase 2', implying they are not yet built. Refresh tokens are fully implemented: src/auth/auth.service.ts issues a 30-day refresh token on login (generateRefreshToken, JWT_REFRESH_TOKEN_TTL default '30d' in src/auth/auth.config.ts) and persists its SHA-256 hash via a RefreshTokenRepository; src/auth/auth.controller.ts exposes POST /v1/agent/auth/refresh and POST /v1/agent/auth/logout. These two endpoints are also missing from the Section 7.1 Agent APIs list.
- **[high] L534** The secrets list uses env var names that do not match the code. There is no DB_URL — the database env var is DATABASE_URL (used in src/ready/ready.probes.ts, apps/api/package.json seed/prisma scripts, and .github/workflows/ci.yml). There is no MAGIC_LINK_SIGNING_SECRET anywhere in the codebase; magic-link tokens are random and stored as SHA-256 hashes (no signing secret), and the related vars are MAGIC_LINK_BASE_URL and MAGIC_LINK_TTL_SECONDS. (HASH_API_URL and HASH_API_KEY/JWT_SECRET/REDIS_URL do exist.)
- **[medium] L554** Section 14.2 State Layers repeats the incorrect claim that the agent app uses TanStack Query for server data and Zustand for UI state. Neither library is a dependency of apps/agent-mobile/package.json. Server data comes from custom fetch clients in src/api/*, and state is held in React Context (src/auth/auth-provider.tsx) and local component state; token storage is Expo SecureStore (src/session/session-storage.ts).
- **[low] L377** The Section 8.1 adapter design does not match the implementation names or shape. Implementation classes are HashavshevetAdapter and BMaxXmlAdapter (not HashavshevetApiGateway/BmaxXmlGateway), composed by CompositeErpGateway (primary then fallback), with a TestingErpAdapter selected under HASH_ENV=testing (apps/api/src/erp/erp.module.ts). The ErpGateway interface method names also differ (apps/api/src/erp/erp.gateway.ts): submitOrder is handoffOrder, getCustomerPriceList is getCustomerPricing, getRecentItems is getCustomerRecentItems, and it adds getHealth plus optional cancelOrder and many report methods.
- **[low] L569** Section 14.4 documents the WhatsApp deep link as including a phone parameter, but the implementation builds a text-only link. src/screens/agent-dashboard-presenter.ts buildWhatsAppDeepLink(message) returns `whatsapp://send?text=${encodeURIComponent(message)}` with no phone segment (authenticated-home-screen.tsx uses Linking.canOpenURL/openURL with this link). The copy-link fallback claim is correct (shouldUseCopyLinkFallback).
- **[medium] L725** Section 21 presents store-release items as completed for both stores, but the config shows internal distribution and Android-only submission. apps/agent-mobile/eas.json: preview builds are distribution:internal (Android apk); production Android is app-bundle submitted to Google Play track:internal, releaseStatus:draft; there is no iOS submit config at all. No Apple distribution cert/profile or Android keystore is configured in-repo (EAS-managed at best). This matches an internal-APK/manual-install model, not a finished public two-store release.
- **[medium] L726** Section 21 states app store metadata is finalized, but apps/agent-mobile/app.json contains only the app name (Hebrew 'עואודה סוכנים'), slug, bundle identifiers, and version. There is no subtitle/short description, support URL, or privacy policy URL, and extra.sentryDsn is empty. The metadata is not finalized.

### `docs/DESIGN.md` (2)

- **[high] L35** Typography claim is contradicted by the actual implementation. Both surfaces use Plus Jakarta Sans, not Newsreader/Inter/Heebo. Mobile: apps/agent-mobile/App.tsx (PlusJakartaSans_400/500/600/700/800 via useFonts) and package.json dep '@expo-google-fonts/plus-jakarta-sans'. Portal: apps/customer-portal/src/customer-portal.css line 1/40 imports and applies font-family: 'Plus Jakarta Sans'. The authoritative docs/DESIGN_DIRECTION.md line 52 also mandates Plus Jakarta Sans. (Newsreader/Inter/Heebo are only preloaded in apps/customer-portal/index.html line 22 but never applied by the CSS — a dead preload.) DESIGN.md is a stale/superseded design brief.
- **[medium] L72** The color tokens in this doc do not match the implemented palette; DESIGN.md is superseded by docs/DESIGN_DIRECTION.md and the app token files. Starkest example: the 'secondary' token here is leather brown #7a5647, but the implemented mobile secondary (apps/agent-mobile/src/theme/tokens.ts) is teal #0d9488 (secondaryFixed #f0fdfa) — a different hue family. Other tokens also diverge: DESIGN.md background #faf9f4 vs implemented #fafaf9; DESIGN.md primary #190000 / primary-container #480003 vs implemented primary #1c1917 / primaryContainer #7f1d1d / primaryFixed #fef2f2.

### `apps/api/README.md` (3)

- **[medium] L7** The Environment section is incomplete: it only tells you to copy .env.example to .env, but the required JWT_SECRET and all HASH_* credentials live in infra/secrets.env, not .env (per the .env.example header comment). The dev script (apps/api/package.json) is `node --env-file=../../infra/secrets.env --env-file=.env ...`, so if infra/secrets.env is missing (it is gitignored — .gitignore line 21) node fails with ENOENT before startup, and JWT_SECRET is required (src/auth/auth.config.ts throws if absent). A fresh clone following only this step cannot start the API.
- **[medium] L15** The documented `seed:testing` (and `seed:testing:deploy`) commands fail as written. package.json wires seed:testing to DATABASE_URL=...55432/awawda (and seed:testing:deploy to ...55433/awawda). The seed script apps/api/scripts/seed-testing-data.ts (main(), lines 198-205) resolves the DB name to 'awawda' and throws 'Refusing to seed the primary database "awawda"... Set ALLOW_SEED_PRIMARY_DB=true to override.' So running the documented command with no extra env var aborts before seeding. The README presents it as a working one-step seed (also repeated in the T07 'Testing-only rich dataset' block, lines 181-190).
- **[medium] L174** The T07 ERP-integration section implies Hashavshevet is the active ERP gateway, but at the default HASH_ENV=testing (README line 66 confirms testing is the default) ErpModule (src/erp/erp.module.ts) binds ERP_GATEWAY to the mock TestingErpAdapter (in-memory fixtures from buildTestingCatalogItems), not to CompositeErpGateway/HashavshevetAdapter/BMaxXmlAdapter. A reviewer reading only this section would assume live Hashavshevet read/handoff by default. The testing binding is not mentioned here (only obliquely under 'Production guardrails').

### `apps/agent-mobile/README.md` (1)

- **[medium] L66** The 'Submit to stores' section (and the Prerequisites listing Apple Developer / App Store Connect and Play Console) overstates the configured distribution. eas.json only defines `submit.production.android` with track 'internal' and releaseStatus 'draft' — i.e. a Play Console internal-testing draft, not a public store release. There is NO `submit.production.ios` block, so `pnpm eas:submit:production:ios` has no submit profile configured. Preview builds are also internal-distribution APKs (eas.json build.preview.distribution 'internal', buildType 'apk'). The doc frames this as full App Store + Play Store submission.

## Notable corrections at a glance

- **`docs/Architecture.md`** claimed the backend uses **Zod** (it uses class-validator), **Redis caching** (in-process Map), and **Pino** logging (Sentry only); and that the mobile/portal apps use **TanStack Query / Zustand / React Hook Form** (none are dependencies).
- Phantom env vars **`MAGIC_LINK_SIGNING_SECRET`** and **`DB_URL`** were documented but never read (magic-link tokens are random and SHA-256-hashed; the var is `DATABASE_URL`).
- The mobile app was described as a finished two-store release; it is internal APK / Play internal-track distribution only.

## Verification

```bash
pnpm infra:local:up                 # Postgres + Redis
pnpm -r --if-present lint           # typecheck all packages (clean)
pnpm --filter @awawda/api test      # 180 pass (incl. DB integration)
pnpm --filter @awawda/agent-mobile test    # 68 pass
pnpm --filter @awawda/customer-portal test # 32 pass
```

## Notes & residual limitations

- **Prisma migration drift.** The `orders_one_active_per_session` partial unique index (finding 6) cannot be expressed in `schema.prisma` (Prisma has no filtered-unique syntax), so it lives in raw migration SQL only. `prisma migrate deploy` applies and tracks it; a local `prisma migrate dev` may flag it as drift — do not accept a migration that drops it.
- **At-most-once ERP handoff (finding 1).** A single request no longer fans out into duplicate submissions. A *cross-request* duplicate is still theoretically possible if a customer manually retries after a timeout that actually committed — inherent to synchronous submit without ERP-side idempotency. The chosen trade-off favors at-most-once (no silent duplicate in the ledger) over at-least-once.
