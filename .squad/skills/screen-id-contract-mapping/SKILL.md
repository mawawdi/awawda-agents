---
name: "screen-id-contract-mapping"
description: "Keep stitched scenario screens stable by centralizing test-id contracts and consuming them at render sites."
domain: "frontend-testing"
confidence: "high"
source: "observed"
---

## Context
Use this when UI parity work depends on multiple named scenarios (design artifacts, QA scripts, and unit/e2e tests) staying synchronized over time.

## Patterns
- Create a dedicated `*-screen-ids.ts` module with a typed constant map for scenario IDs.
- Reference that map directly in JSX/TSX `data-testid`/`testID` props instead of inline strings.
- Add a lightweight test asserting the mapping object so contract regressions fail fast before runtime UI tests.

## Examples
- `apps/agent-mobile/src/screens/agent-screen-ids.ts` used by `authenticated-home-screen.tsx` and `src/__tests__/screen-ids.test.ts`.
- `apps/customer-portal/src/portal-screen-ids.ts` used by `customer-portal-routes.tsx` and `portal-screen-ids.test.ts`.

## Anti-Patterns
- Duplicating literal screen IDs across components/tests.
- Adding new visual scenarios without updating a shared scenario-ID contract.

