-- AlterTable: Add hashAgentId to agents
ALTER TABLE "agents" ADD COLUMN "hash_agent_id" VARCHAR(128);

-- CreateIndex: unique constraint on hash_agent_id (nullable — Postgres allows multiple NULLs)
CREATE UNIQUE INDEX "agents_hash_agent_id_key" ON "agents"("hash_agent_id");

-- AlterTable: Add agent association fields to orders
ALTER TABLE "orders" ADD COLUMN "submitted_by_agent_id" UUID;
ALTER TABLE "orders" ADD COLUMN "hash_submitted_by_agent_id" VARCHAR(128);

-- CreateIndex: index on submitted_by_agent_id for order lookups
CREATE INDEX "orders_submitted_by_agent_id_idx" ON "orders"("submitted_by_agent_id");

-- AddForeignKey: orders.submitted_by_agent_id → agents.id (SET NULL on delete)
ALTER TABLE "orders" ADD CONSTRAINT "orders_submitted_by_agent_id_fkey" FOREIGN KEY ("submitted_by_agent_id") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
