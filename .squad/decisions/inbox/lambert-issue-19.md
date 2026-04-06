# Lambert decision note — Issue #19 test coverage sweep

## Context

Issue #19 requires automated confidence across API, mobile, and portal critical paths, including Playwright scenario coverage for portal happy/mismatch ordering flows.

## Decision

Implement the maximal production-valid subset now:

- Expand runnable API tests around currently implemented operational contracts (`health`, `ready`).
- Expand runnable mobile tests around auth/login critical behavior (API client success/failure, token persistence lifecycle).
- Add Playwright portal critical-path specs and execution wiring now, but keep them explicitly skipped with blocker messaging until upstream endpoint dependencies land.
- Add a test ownership + failure triage runbook to make failures actionable in CI/review.

## Rationale

Current `auth`, `links`, and `orders` API modules in main are placeholders, so full backend business-rule/E2E coverage cannot be validated yet without fabricating non-existent behavior. This approach maximizes trustworthy automation today while preserving clear executable scenarios and unblocking immediate future activation once dependency tickets merge.

## Consequences

Bishop review can validate the new runnable suites immediately and confirm dependency blockers are explicit. When T13/T16/T18 land, portal Playwright scenarios can be unskipped and upgraded to mandatory CI signal without re-authoring the flow definitions.
