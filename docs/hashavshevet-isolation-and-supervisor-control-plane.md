# Hashavshevet isolation and supervisor control-plane spec

## Why this exists

This document defines:

1. A **hard separation model** so testing data can never cross into production Hashavshevet flows.
2. A new **Supervisor account** surface to manage agents/customers operationally.
3. A prioritized **nice-to-have backlog** for Supervisor, Agent app, and Customer Portal.

---

## 1) Non-negotiable Hashavshevet data isolation

### 1.1 Environment boundary model

- **Production** and **testing** must use fully separate:
  - Hashavshevet credentials and plugin authorizations
  - PostgreSQL databases
  - Redis instances
  - secrets stores and deploy pipelines
- No shared API keys, no shared DB, no shared Redis.

### 1.2 Runtime hard guards

- Production runtime must fail startup unless:
  - `NODE_ENV=production`
  - `HASH_ENV=production`
  - production Hash credentials are present
- Production runtime must explicitly disable testing-only surfaces:
  - `seed:testing`
  - testing-assets/testing-catalog endpoints
  - any mock/fallback snapshot path intended for QA
- Any request path using test Hash endpoints in production must be rejected and alerted.

### 1.3 CI/CD and deployment controls

- Separate deploy workflows and secrets per environment (`testing` vs `production`).
- Add release gate: reject deployment if production manifest references testing Hash URL/key.
- Protect production secret changes with manual approval.
- Tag all ERP calls in logs/audit with `environment`, `station`, and `company`.

### 1.4 Data handling policy

- Never clone production customer/order data into testing.
- If production-like test data is needed, use anonymized one-way exports only.
- Maintain yearly retention in production according to business policy; keep testing retention short and disposable.

---

## 2) Supervisor account and control plane

### 2.1 Role definition

Introduce a new role: `SUPERVISOR`.

Scope:

- Oversees all agents.
- Creates agent accounts. Sets email, phone number, password, names etc...
- Assigns/reassigns customers to agents.
- Updates customer profile/operational metadata (Not-Hashavshevet-pulled data).
- Monitors ordering activity and operational health.

### 2.2 Required capabilities (MVP)

1. **Agent management**
   - List all agents and current assignment counts.
   - Activate/deactivate agent access.
   - Force logout / revoke active sessions.

2. **Customer ownership management**
   - Assign/unassign customer-to-agent links.
   - Bulk reassignment (for vacations, outages, load balancing).
   - Conflict prevention (single source of assignment truth).

3. **Customer data operations**
   - Edit allowed customer fields (name, contact, phone, city, notes, status).
   - Track change reason and actor in audit log.
   - Validate edits before save (required fields, format checks).

4. **Oversight dashboard**
   - Today orders by agent/customer.
   - Unassigned customers.
   - Failed ERP handoffs / retries needed.
   - Session activation and conversion funnel.

5. **Audit & compliance**
   - Immutable audit trail for all supervisor actions.
   - Filter by actor, customer, action type, and time range.

### 2.3 Security and guardrails

- Least-privilege RBAC (`AGENT`, `SUPERVISOR`, future `ADMIN` if needed).
- Mandatory action logging for assignment/data edits.
- Optional two-step confirmation for high-impact actions (bulk reassignment, deactivation).
- No direct exposure of Hashavshevet credentials in UI.

---

## 3) Nice-to-have features

### 3.1 Supervisor account (control plane)

- Territory map view (customer geography + agent coverage).
- SLA board (unhandled customers, stale sessions, failed handoffs).
- Controlled impersonation mode (view-as-agent with explicit banner + audit entry).
- Scheduled assignment rules (time-based/fallback routing).

### 3.2 Agent app (Awawda Agents)

- Offline order draft capture with later sync.
- Push notifications for reassignment/new customer links.
- Smart reorder suggestions from customer history.
- Quick-scan item lookup (barcode/SKU search).
- Voice note attachment to order/customer context.

### 3.3 Customer Portal (Awawda Customer Portal)

- Saved order templates/favorites.
- Smart substitutions when an item is unavailable.
- Delivery preference presets and preferred windows.
- Price-change transparency chips between repeated orders.
- Optional bilingual toggle (HE/EN) with full RTL integrity.

---

## 4) Implementation slices (recommended)

1. **Isolation hardening first**
   - enforce env guards, startup checks, deploy gates, and audit tagging.
2. **RBAC + supervisor backend APIs**
   - role model, permission checks, audit schema.
3. **Supervisor UI**
   - agent/customer management + oversight dashboard.
4. **Nice-to-have rollout**
   - ship by impact/complexity with measurable adoption metrics.

---

## 4.1 Current implementation status (2026-04-16)

### Implemented

- **Isolation guardrails**
  - production startup guardrails enforce `NODE_ENV=production` + `HASH_ENV=production`.
  - testing-only paths are blocked in production (`testing-assets` and testing seed behavior).
  - deploy templates now separate testing vs production env wiring.

- **Supervisor backend APIs**
  - `GET /v1/supervisor/agents`
  - `POST /v1/supervisor/agents`
  - `POST /v1/supervisor/agents/:agentId/force-logout`
  - `GET /v1/supervisor/customers`
  - `GET /v1/supervisor/customer-profiles`
  - `GET /v1/supervisor/customers/:customerId/assignments`
  - `POST /v1/supervisor/customers/:customerId/assignments`
  - `DELETE /v1/supervisor/customers/:customerId/assignments/:agentId`
  - `PATCH /v1/supervisor/customers/:customerId/profile`
  - `PATCH /v1/supervisor/agents/:agentId/access`
  - `POST /v1/supervisor/customers/bulk-reassign`
  - `GET /v1/supervisor/audit`
  - `GET /v1/supervisor/oversight`
  - all privileged mutations emit audit events with actor and payload context.

- **Supervisor mobile control-plane**
  - role-gated supervisor tab is live in `agent-mobile`.
  - supports agent creation, forced logout, customer assignment/unassignment, customer profile updates, agent access toggle, bulk reassignment, recent audit timeline viewing, and daily oversight analytics (orders, unassigned customers, ERP board, activation funnel).

- **Auth guard hardening**
  - agent JWT auth now re-checks agent state from DB on each request.
  - deactivated agents are rejected immediately even if they still hold a previously issued token.

- **Production deploy preflight gate**
  - `pnpm deploy:up:prod` now runs `deploy:verify:prod` before compose startup.
  - the gate hard-fails when effective production Hash config resolves to testing URL/key values or missing production credentials.

### Remaining from this spec

- no open MVP gaps; future work is optional nice-to-have items from section 3.

---

## 5) Acceptance criteria

- No production deployment can run with testing Hash configuration.
- No testing-only API/data path is available in production.
- Supervisor can assign/reassign customers and update customer data with full audit history.
- Agent/mobile/portal behavior remains backward-compatible for existing users.
- Security review passes for role boundaries and privileged actions.
