# Parker Issue 9 Decision Note

## Context
Issue #9 required production-ready agent read APIs for assigned customers and master catalog, with strict agent-only authorization and caching behavior suitable for dashboard/catalog workflows.

## Decision
Implement two authenticated agent endpoints under `/v1`:
- `GET /v1/agent/customers` backed by assignment-scoped repository reads (`assignments`, `approved_items`, `orders`) so each agent only receives their own customer list plus dashboard metadata.
- `GET /v1/agent/catalog` backed by `ERP_GATEWAY.getMasterCatalog()` with short-lived in-process caching, cache metadata in the payload, and HTTP cache headers (`Cache-Control`, `ETag`, cache status timestamps).

Add `AgentAuthGuard` to enforce JWT bearer access restricted to `agent_shift` tokens and add integration tests proving auth rejection + happy paths for customers and catalog responses.

## Rationale
This keeps authorization explicit at the API boundary while preserving ERP abstraction and introducing cache hooks without coupling callers to infrastructure details. Returning cache headers and payload metadata supports mobile performance tuning and observability during Phase 1.

## Consequences
Future Redis-backed caching can replace the in-memory cache behind `CatalogService` without changing endpoint contracts. Additional customer read endpoints should reuse `AgentAuthGuard` and assignment-scoping patterns established here.
