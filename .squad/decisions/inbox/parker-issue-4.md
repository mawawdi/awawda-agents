# Parker Issue 4 Decision Note

## Context
Issue #4 required a production-grade API bootstrap for Phase 1 with Fastify, versioned operational routes, and clean module boundaries for upcoming domain work.

## Decision
Implement the API skeleton in `apps/api` using NestJS with the Fastify adapter and URI versioning (`v1`), then expose explicit operational contracts:
- `GET /v1/health` for liveness
- `GET /v1/ready` for readiness placeholders with dependency check metadata

Scaffold isolated modules for `auth`, `customers`, `catalog`, `links`, `sessions`, `orders`, and `erp` within `AppModule` so future endpoint logic can land without circular cross-domain coupling.

## Rationale
This creates a stable runtime boundary and operational contract before business endpoints are implemented. It also preserves architectural modularity and enables incremental backend delivery with testable bootstrap behavior.

## Consequences
Subsequent tickets should add feature controllers/services inside existing module boundaries and extend readiness checks from placeholders to real dependency probes without changing route shape.
