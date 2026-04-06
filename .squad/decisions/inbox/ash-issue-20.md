# Ash Issue 20 Decision Note

## Context
Issue #20 required production-grade CI/CD gates for Phase 1 services with deterministic PR validation, container artifact checks for API and customer portal, and explicit reviewer gating policy.

## Decision
Standardize release gates around three workflows:
- `squad-ci.yml`: deterministic workspace checks and PR container build validation.
- `squad-preview.yml`: preview branch quality and release-readiness verification.
- `squad-release.yml`: main branch release workflow with quality gates and GitHub release publishing.

Document branch/merge policy and mandatory Playwright reviewer evidence in `docs/ci-cd-release-gates.md`.

## Rationale
This keeps merge and release checks consistent, reproducible, and auditable while preventing promotion of unverified artifacts.

## Consequences
Future service changes must preserve these gates (or strengthen them) to keep CI/CD behavior deterministic and reviewer enforcement explicit.
