---
name: "portal-visual-regression"
description: "Create deterministic Playwright screenshot coverage across portal runtime scenarios"
domain: "testing"
confidence: "high"
source: "earned"
tools:
  - name: "playwright"
    description: "Runs browser-based visual regression assertions"
    when: "Need screenshot guardrails for runtime UI scenarios"
---

## Context
Use this when portal states must be validated visually beyond behavioral assertions, especially where designers supply scenario references and regressions must be caught before release.

## Patterns
- Run the actual app runtime (not static HTML) and mock API responses per scenario.
- Assert screenshots with `expect(page).toHaveScreenshot(...)` for deterministic baselines.
- For mobile surfaces, pair full-page screenshots with `expect(page.getByTestId(screenId)).toHaveScreenshot(...)` so component-level and whole-layout drift are both detected.
- Stabilize visuals: fixed viewport, locale/timezone, reduced-motion media, and blocked remote font variance.
- Cover both desktop and mobile-web views when possible; at minimum ensure full desktop scenario coverage.
- Capture state transitions in sequence (composer → mismatch → success) plus standalone failure state (session error).

## Examples
- `tests/playwright/portal-visual-regression.spec.ts`
- `package.json` scripts: `test:portal-visual`, `test:portal-visual:update`

## Anti-Patterns
- Capturing screenshots without deterministic mocks (flake-prone).
- Depending on external font/CDN timing for visual baselines.
- Limiting screenshot checks to only happy-path and missing mismatch/error states.
