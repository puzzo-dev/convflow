-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" VARCHAR(200) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'member',
    "api_key" VARCHAR(64) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'owner',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(80) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "openwa_session_id" VARCHAR(80) NOT NULL,
    "owner_phone" VARCHAR(20) NOT NULL,
    "config_json" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_slug" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "name" VARCHAR(120),
    "answers" JSONB NOT NULL DEFAULT '{}',
    "lead_score" INTEGER DEFAULT 0,
    "classification" VARCHAR(20),
    "source" VARCHAR(50),
    "routed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erpnext_connections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_slug" VARCHAR(80) NOT NULL,
    "erpnext_url" VARCHAR(255) NOT NULL,
    "api_key" VARCHAR(120) NOT NULL,
    "api_secret" VARCHAR(120) NOT NULL,
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_sync_at" TIMESTAMP(3),
    "status" VARCHAR(20) NOT NULL DEFAULT 'connected',
    "error_message" TEXT,

    CONSTRAINT "erpnext_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_slug" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "message_text" TEXT NOT NULL,
    "stage_id" VARCHAR(80),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "erpnext_item_cache" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_slug" VARCHAR(80) NOT NULL,
    "item_code" VARCHAR(140) NOT NULL,
    "item_name" VARCHAR(200) NOT NULL,
    "item_group" VARCHAR(100),
    "standard_rate" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currency" VARCHAR(10) NOT NULL DEFAULT 'NGN',
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "erpnext_item_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "human_takeovers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_slug" VARCHAR(80) NOT NULL,
    "phone" VARCHAR(20) NOT NULL,
    "triggered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resumed_at" TIMESTAMP(3),
    "resumed_by" VARCHAR(120),
    "off_flow_message" TEXT,
    "stage_at_takeover" INTEGER,

    CONSTRAINT "human_takeovers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_api_key_key" ON "users"("api_key");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_user_id_tenant_id_key" ON "tenant_memberships"("user_id", "tenant_id");

-- CreateIndex
CREATE INDEX "tenant_memberships_user_id_idx" ON "tenant_memberships"("user_id");

-- CreateIndex
CREATE INDEX "tenant_memberships_tenant_id_idx" ON "tenant_memberships"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_openwa_session_id_key" ON "tenants"("openwa_session_id");

-- CreateIndex
CREATE INDEX "leads_company_slug_idx" ON "leads"("company_slug");

-- CreateIndex
CREATE INDEX "leads_company_slug_phone_idx" ON "leads"("company_slug", "phone");

-- CreateIndex
CREATE INDEX "leads_company_slug_classification_idx" ON "leads"("company_slug", "classification");

-- CreateIndex
CREATE UNIQUE INDEX "erpnext_connections_company_slug_key" ON "erpnext_connections"("company_slug");

-- CreateIndex
CREATE INDEX "conversations_company_slug_phone_idx" ON "conversations"("company_slug", "phone");

-- CreateIndex
CREATE INDEX "conversations_company_slug_created_at_idx" ON "conversations"("company_slug", "created_at" DESC);

-- CreateIndex
CREATE INDEX "erpnext_item_cache_company_slug_is_active_idx" ON "erpnext_item_cache"("company_slug", "is_active");

-- CreateIndex
CREATE INDEX "erpnext_item_cache_company_slug_item_group_idx" ON "erpnext_item_cache"("company_slug", "item_group");

-- CreateIndex
CREATE UNIQUE INDEX "erpnext_item_cache_company_slug_item_code_key" ON "erpnext_item_cache"("company_slug", "item_code");

-- CreateIndex
CREATE INDEX "human_takeovers_company_slug_triggered_at_idx" ON "human_takeovers"("company_slug", "triggered_at" DESC);

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
