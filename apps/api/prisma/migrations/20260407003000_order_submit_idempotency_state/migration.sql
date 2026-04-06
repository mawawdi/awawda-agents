ALTER TABLE "idempotency_keys"
ADD COLUMN "hash_customer_id" VARCHAR(128),
ADD COLUMN "customer_session_id" UUID,
ADD COLUMN "request_hash" VARCHAR(128),
ADD COLUMN "response_status" INTEGER,
ADD COLUMN "response_body_json" JSONB;

UPDATE "idempotency_keys"
SET
  "hash_customer_id" = 'legacy',
  "customer_session_id" = '00000000-0000-0000-0000-000000000000',
  "request_hash" = COALESCE("response_hash", 'legacy');

ALTER TABLE "idempotency_keys"
ALTER COLUMN "hash_customer_id" SET NOT NULL,
ALTER COLUMN "customer_session_id" SET NOT NULL,
ALTER COLUMN "request_hash" SET NOT NULL;

CREATE INDEX "idempotency_keys_hash_customer_id_idx" ON "idempotency_keys"("hash_customer_id");
CREATE INDEX "idempotency_keys_customer_session_id_idx" ON "idempotency_keys"("customer_session_id");
