# Parker — Approved Items API Contract and Audit Event

## Context
Issue #10 adds customer-specific allowlist management APIs for agents and requires assignment authorization + traceability.

## Decision
Implement `GET/POST /v1/agent/customers/:customerId/approved-items` behind assignment checks. POST returns `201` when newly created and `200` when duplicate exists, always with `{ customerId, item, created }`. Newly created approvals emit `audit_logs` event type `approved_item.added` with approved item id + customer/item identifiers.

## Impact
Enforces least-privilege behavior for customer allowlist changes, prevents duplicate mutation failures for repeated requests, and preserves an auditable event trail for approved-item additions.
