# Dallas Issue 7 Revision Note

## Context
Issue #7 was rejected in Bishop review because PR #25 included unrelated T06 Prisma changes.

## Decision
Rebuild the revision from current `main` and include only T07 ERP scope:
- `ERP_GATEWAY` abstraction and internal response contracts
- Hashavshevet primary adapter skeleton with retry/backoff hooks
- B-MAX XML fallback adapter
- Stable `ERP_*` error code mapping and readiness/order wiring through the abstraction

## Validation
- `pnpm lint` ✅
- `pnpm test` ✅
- `pnpm build` ✅

## Consequences
Replacement PR is scoped to issue #7 only and is ready for Bishop re-review without Parker participation in this revision cycle.
