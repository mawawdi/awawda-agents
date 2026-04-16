-- CreateEnum
CREATE TYPE "AgentRole" AS ENUM ('FIELD_AGENT', 'SUPERVISOR');

-- CreateEnum
CREATE TYPE "CustomerProfileStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ON_HOLD');

-- AlterTable
ALTER TABLE "agents"
ADD COLUMN "role" "AgentRole" NOT NULL DEFAULT 'FIELD_AGENT';

-- CreateTable
CREATE TABLE "customer_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "hash_customer_id" VARCHAR(128) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "contact_name" VARCHAR(255),
    "phone" VARCHAR(32),
    "city" VARCHAR(120),
    "notes" TEXT,
    "status" "CustomerProfileStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_hash_customer_id_key" ON "customer_profiles"("hash_customer_id");

-- CreateIndex
CREATE INDEX "customer_profiles_status_idx" ON "customer_profiles"("status");

-- CreateIndex
CREATE INDEX "customer_profiles_city_idx" ON "customer_profiles"("city");
