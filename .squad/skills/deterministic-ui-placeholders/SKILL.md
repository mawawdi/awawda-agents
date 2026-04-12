---
name: "deterministic-ui-placeholders"
description: "Use local deterministic visual placeholders when design comps reference unstable remote media"
domain: "frontend-ux"
confidence: "high"
source: "observed"
---

## Context
Use when stitched/mockup screens include remote image URLs that are not guaranteed stable in runtime tests or CI snapshots.

## Patterns
- Avoid direct runtime dependency on external image hosts for parity-only visual blocks.
- Generate placeholder surfaces deterministically from stable IDs (e.g., hash item/customer id to pick background tint).
- Pair placeholder color blocks with semantic local icons to preserve information scent.
- Keep deterministic placeholder logic pure and colocated near render helpers.

## Examples
- `apps/agent-mobile/src/screens/authenticated-home-screen.tsx` (`placeholderColor`, catalog/customer approved-item placeholder blocks).

## Anti-Patterns
- Hardcoding random colors or timestamps in visual placeholders.
- Fetching remote mockup images directly in production/test UI for parity snapshots.
