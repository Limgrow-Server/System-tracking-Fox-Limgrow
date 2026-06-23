-- CreateEnum
CREATE TYPE "staff_role" AS ENUM ('Admin', 'Dev', 'Marketing');

-- CreateEnum
CREATE TYPE "team_member_status" AS ENUM ('active', 'invited', 'suspended', 'disabled');

-- CreateTable
CREATE TABLE "team_members" (
    "id" UUID NOT NULL,
    "auth_user_id" UUID,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "staff_role" NOT NULL,
    "status" "team_member_status" NOT NULL DEFAULT 'invited',
    "global_access" BOOLEAN NOT NULL DEFAULT false,
    "app_scope" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "store_scope" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_by" TEXT,
    "invited_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMPTZ(6),
    "last_active_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "console_audit_logs" (
    "id" UUID NOT NULL,
    "actor_member_id" UUID,
    "actor_email" TEXT,
    "action" TEXT NOT NULL,
    "resource_type" TEXT,
    "resource_id" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "console_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "team_members_auth_user_id_key" ON "team_members"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_email_key" ON "team_members"("email");

-- CreateIndex
CREATE INDEX "team_members_role_status_idx" ON "team_members"("role", "status");

-- CreateIndex
CREATE INDEX "team_members_email_status_idx" ON "team_members"("email", "status");

-- CreateIndex
CREATE INDEX "console_audit_logs_actor_time_idx" ON "console_audit_logs"("actor_member_id", "created_at");

-- CreateIndex
CREATE INDEX "console_audit_logs_resource_time_idx" ON "console_audit_logs"("resource_type", "resource_id", "created_at");

-- AddForeignKey
ALTER TABLE "console_audit_logs" ADD CONSTRAINT "console_audit_logs_actor_member_id_fkey" FOREIGN KEY ("actor_member_id") REFERENCES "team_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed the initial console admin profile. A matching Supabase Auth user must still be created separately.
INSERT INTO "team_members" (
    "id",
    "name",
    "email",
    "role",
    "status",
    "global_access",
    "app_scope",
    "store_scope",
    "created_by",
    "invited_at",
    "created_at",
    "updated_at"
)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Limgrow Admin',
    'admin@limgrow.com',
    'Admin',
    'active',
    true,
    ARRAY['*']::TEXT[],
    ARRAY['*']::TEXT[],
    'migration',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT ("email") DO UPDATE SET
    "role" = 'Admin',
    "status" = 'active',
    "global_access" = true,
    "app_scope" = ARRAY['*']::TEXT[],
    "store_scope" = ARRAY['*']::TEXT[],
    "updated_at" = CURRENT_TIMESTAMP;

ALTER TABLE "team_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "console_audit_logs" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "team_members", "console_audit_logs" FROM anon;
REVOKE ALL ON TABLE "team_members", "console_audit_logs" FROM authenticated;
