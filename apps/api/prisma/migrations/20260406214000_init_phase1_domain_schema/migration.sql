-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "MagicLinkStatus" AS ENUM ('ISSUED', 'ACTIVATED', 'EXPIRED', 'CONSUMED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'CLOSED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('SUBMITTED', 'FAILED', 'PENDING_RETRY');

-- CreateEnum
CREATE TYPE "IdempotencyScope" AS ENUM ('CUSTOMER_ORDER_SUBMIT');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('AGENT', 'CUSTOMER_SESSION', 'SYSTEM');

-- CreateTable
CREATE TABLE "agents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(32) NOT NULL,
    "email" VARCHAR(255),
    "password_hash" VARCHAR(255) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "agent_id" UUID NOT NULL,
    "hash_customer_id" VARCHAR(128) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approved_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hash_customer_id" VARCHAR(128) NOT NULL,
    "hash_item_id" VARCHAR(128) NOT NULL,
    "added_by_agent_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approved_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "magic_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" VARCHAR(128) NOT NULL,
    "hash_customer_id" VARCHAR(128) NOT NULL,
    "issued_by_agent_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "MagicLinkStatus" NOT NULL DEFAULT 'ISSUED',
    "activated_at" TIMESTAMPTZ(3),
    "consumed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "magic_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "magic_link_id" UUID NOT NULL,
    "hash_customer_id" VARCHAR(128) NOT NULL,
    "session_expires_at" TIMESTAMPTZ(3) NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_session_id" UUID NOT NULL,
    "hash_customer_id" VARCHAR(128) NOT NULL,
    "hash_order_ref" VARCHAR(128),
    "status" "OrderStatus" NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estimated_total" DECIMAL(14,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_lines" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "hash_item_id" VARCHAR(128) NOT NULL,
    "item_name_snapshot" VARCHAR(255) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" VARCHAR(16) NOT NULL,
    "unit_price_snapshot" DECIMAL(14,2) NOT NULL,
    "line_total_snapshot" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope" "IdempotencyScope" NOT NULL,
    "key" VARCHAR(255) NOT NULL,
    "response_hash" VARCHAR(128),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_type" "AuditActorType" NOT NULL,
    "actor_id" VARCHAR(128) NOT NULL,
    "event_type" VARCHAR(120) NOT NULL,
    "event_payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agents_phone_key" ON "agents"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "agents_email_key" ON "agents"("email");

-- CreateIndex
CREATE INDEX "assignments_hash_customer_id_idx" ON "assignments"("hash_customer_id");

-- CreateIndex
CREATE INDEX "assignments_agent_id_idx" ON "assignments"("agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_agent_customer_key" ON "assignments"("agent_id", "hash_customer_id");

-- CreateIndex
CREATE INDEX "approved_items_hash_customer_id_idx" ON "approved_items"("hash_customer_id");

-- CreateIndex
CREATE INDEX "approved_items_added_by_agent_id_idx" ON "approved_items"("added_by_agent_id");

-- CreateIndex
CREATE UNIQUE INDEX "approved_items_customer_item_key" ON "approved_items"("hash_customer_id", "hash_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "magic_links_token_hash_key" ON "magic_links"("token_hash");

-- CreateIndex
CREATE INDEX "magic_links_hash_customer_id_idx" ON "magic_links"("hash_customer_id");

-- CreateIndex
CREATE INDEX "magic_links_issued_by_agent_id_idx" ON "magic_links"("issued_by_agent_id");

-- CreateIndex
CREATE INDEX "magic_links_status_idx" ON "magic_links"("status");

-- CreateIndex
CREATE INDEX "magic_links_expires_at_idx" ON "magic_links"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_magic_link_id_key" ON "sessions"("magic_link_id");

-- CreateIndex
CREATE INDEX "sessions_hash_customer_id_idx" ON "sessions"("hash_customer_id");

-- CreateIndex
CREATE INDEX "sessions_status_idx" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "sessions_session_expires_at_idx" ON "sessions"("session_expires_at");

-- CreateIndex
CREATE INDEX "sessions_is_active_idx" ON "sessions"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "orders_hash_order_ref_key" ON "orders"("hash_order_ref");

-- CreateIndex
CREATE INDEX "orders_customer_session_id_idx" ON "orders"("customer_session_id");

-- CreateIndex
CREATE INDEX "orders_hash_customer_id_idx" ON "orders"("hash_customer_id");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "order_lines_order_id_idx" ON "order_lines"("order_id");

-- CreateIndex
CREATE INDEX "order_lines_hash_item_id_idx" ON "order_lines"("hash_item_id");

-- CreateIndex
CREATE INDEX "idempotency_keys_created_at_idx" ON "idempotency_keys"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_keys_scope_key_key" ON "idempotency_keys"("scope", "key");

-- CreateIndex
CREATE INDEX "audit_logs_actor_lookup_idx" ON "audit_logs"("actor_type", "actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_event_type_idx" ON "audit_logs"("event_type");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approved_items" ADD CONSTRAINT "approved_items_added_by_agent_id_fkey" FOREIGN KEY ("added_by_agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "magic_links" ADD CONSTRAINT "magic_links_issued_by_agent_id_fkey" FOREIGN KEY ("issued_by_agent_id") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_magic_link_id_fkey" FOREIGN KEY ("magic_link_id") REFERENCES "magic_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_session_id_fkey" FOREIGN KEY ("customer_session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
