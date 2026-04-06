# Squad Decisions

## Active Decisions

### 2026-04-06 — Phase 1 Monorepo Project Structure (Ripley)

**Context**
Cana requested an initial project scaffold aligned to architecture and Phase 1 PRD scope.

**Decision**
Adopt a pnpm monorepo with:
- `apps/agent-mobile` (Expo placeholder)
- `apps/customer-portal` (Next.js placeholder)
- `apps/api` (NestJS placeholder)
- `packages/shared-types` as the only shared package for Phase 1
- `infra/docker` and `infra/compose` placeholders

**Rationale**
Aligns implementation with proposed architecture while minimizing unnecessary early complexity.

**Consequences**
Implementation can begin immediately with clear ownership boundaries; additional shared packages can be introduced later without structural churn.

---

### 2026-04-06 — Initial Implementation Backlog Accepted (Ripley)

**Scope**
Phase 1A MVP delivery for the Factory Agent Mobile App and Customer Ordering Portal, with modular monolith backend and two frontends.

**Decision**
Adopt the prioritized 15-item implementation backlog and dependency order authored by Ripley (`ripley-prd-backlog.md`) as the execution baseline for kickoff.

**Rationale**
The backlog captures sequencing constraints (scaffold first, shared types early, backend APIs before frontend integration) and enables parallel work across Ash, Parker, Dallas, and Lambert.

**Consequences**
Team planning and dispatch should follow the documented dependency graph and recommended week-by-week sequence unless superseded by a new decision entry.

---

### 2026-04-06 — Subagent Model Directive (Cana)

**Decision**
Use Codex-5.3-Medium for all subagents going forward as a hard rule.

**Rationale**
Explicit operator directive captured for team memory and orchestration consistency.

**Consequences**
Future spawns should enforce this model selection by default unless the owner explicitly amends the directive.


### 2026-04-06 — Decision Inbox: Magic Link Issuance Contract Hardened (Lambert)

**Context**
Issue #11 required production-grade issuance of customer magic links while preserving strict agent/customer authorization boundaries.

**Decision**
Issue magic links only when `(agentId, customerId)` assignment exists, persist SHA-256 token hashes only (never plaintext token), and initialize lifecycle as `issued` with configured TTL metadata in API responses.

**Rationale**
This aligns implementation with the documented security architecture and prevents token leakage or cross-customer issuance by authenticated but unauthorized agents.

**Consequences**
Downstream activation/session flows can trust issuance records for status and expiry while reviewers can validate boundaries and hash-only storage deterministically through tests.

---

### 2026-04-06 — Decision Inbox: Agent Mobile Dashboard Contract Consumption (Dallas)

**Context**
Issue #15 required the first production-ready mobile dashboard surface for assigned customers and approved-item management after T09/T10/T14 contracts merged.

**Decision**
Implement dashboard data access strictly against shared v1 contracts (`@meatland/shared-types`) via authenticated calls to `GET /v1/agent/customers`, `GET /v1/agent/customers/:customerId/approved-items`, and `POST /v1/agent/customers/:customerId/approved-items`, with explicit loading/error/slow-network operator states and duplicate-safe add-item handling.

**Rationale**
Keeping mobile request/response typing pinned to shared contracts prevents drift from backend behavior and enables deterministic handling of `created=false` mutation responses in field workflows.

**Consequences**
Future mobile iterations can extend dashboard interactions without reworking base resilience patterns, and Bishop can validate contract parity through focused vitest + UI-state evidence.

---

### 2026-04-06 — Decision Inbox: Mobile Magic-Link WhatsApp Dispatch and Fallback (Dallas)

**Context**
Issue #16 required production-grade mobile handling for customer link generation/sharing after backend magic-link issuance (Issue #11) and dashboard context (Issue #15) were in place.

**Decision**
Generate links from selected customer context via `POST /v1/agent/customers/:customerId/magic-links`, compose WhatsApp deep links with prefilled message text from backend link metadata, and force a copy-link fallback path when WhatsApp launch capability/dispatch fails while rendering backend `expiresAt`, `expiresInSeconds`, and `lifecycle` fields directly in UI metadata.

**Rationale**
This preserves strict contract alignment with backend issuance semantics and prevents field dead-ends on devices lacking WhatsApp handlers.

**Consequences**
Agents can always complete link sharing (direct send or manual copy), and reviewers can verify deterministic behavior through new client/presenter tests for generation, fallback triggers, and expiry rendering.

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
