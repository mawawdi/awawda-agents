# Parker Issue 14 Revision Decision Note

## Context
Issue #14 was rejected due to out-of-scope changes and weak reviewability. The revision needed to be independently owned by Parker and tightly constrained to T14 acceptance criteria.

## Decision
Deliver a clean T14-only branch limited to `apps/agent-mobile` auth shell work:
- Login screen wired to `POST /v1/agent/auth/login`
- Secure token persistence/restore/logout clear via Expo SecureStore
- Authenticated vs unauthenticated navigation shell
- Mobile-friendly validation and auth error messaging with unit coverage

## Rationale
Keeping the delta app-scoped removes cross-ticket drift and gives Bishop a focused review surface tied directly to T14 outcomes.

## Consequences
Bishop can re-review T14 without sorting through unrelated API/squad changes. Backend dependency completion (T08) remains outside this revision’s implementation scope.
