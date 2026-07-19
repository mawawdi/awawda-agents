-- Enforce at most one active (non-failed) order per customer session.
-- A magic link is single-use, so concurrent submits for the same session must not create duplicate
-- orders (and duplicate ERP handoffs). This partial unique index is the DB-level backstop behind the
-- application's session-claim gate. FAILED orders (should any ever be persisted) do not occupy the
-- slot, leaving the session free for a genuine re-attempt.
CREATE UNIQUE INDEX "orders_one_active_per_session"
  ON "orders" ("customer_session_id")
  WHERE "status" <> 'FAILED';
