-- CreateEnum
CREATE TYPE "staff_role" AS ENUM ('Admin', 'Dev', 'Marketing');

-- CreateEnum
CREATE TYPE "team_member_status" AS ENUM ('active', 'invited', 'suspended', 'disabled');

-- CreateEnum
CREATE TYPE "ios_secret_type" AS ENUM ('apple_asc_p8', 'apple_iap_p8', 'firebase_service_account');

-- CreateEnum
CREATE TYPE "mapping_status" AS ENUM ('active', 'inactive', 'archived');

-- CreateEnum
CREATE TYPE "credential_status" AS ENUM ('active', 'disabled');

-- CreateEnum
CREATE TYPE "secret_format" AS ENUM ('json', 'p8');

-- CreateEnum
CREATE TYPE "credential_purpose" AS ENUM ('firebase_admin', 'review', 'iap');

-- CreateEnum
CREATE TYPE "review_sync_status" AS ENUM ('idle', 'running', 'succeeded', 'failed');

-- CreateEnum
CREATE TYPE "review_fetch_run_status" AS ENUM ('running', 'succeeded', 'failed', 'partial');

-- CreateEnum
CREATE TYPE "review_fetch_trigger" AS ENUM ('scheduled', 'manual', 'retry');

-- CreateEnum
CREATE TYPE "review_fetch_schedule_status" AS ENUM ('active', 'paused');

-- CreateTable
CREATE TABLE "android_store_profiles" (
    "id" UUID NOT NULL,
    "store_account_name" TEXT NOT NULL,
    "link_store" TEXT,
    "avatar_url" TEXT,
    "contact_email" TEXT,
    "support_phone" TEXT,
    "website_url" TEXT,
    "status" "mapping_status" NOT NULL DEFAULT 'active',
    "supabase_user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "android_store_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "android_store_mappings" (
    "id" UUID NOT NULL,
    "store_profile_id" UUID NOT NULL,
    "store_account_name" TEXT NOT NULL,
    "app_id" TEXT,
    "app_name" TEXT NOT NULL,
    "app_icon_url" TEXT,
    "app_link" TEXT,
    "package_name" TEXT NOT NULL,
    "status" "mapping_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "android_store_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "android_store_reviews" (
    "id" UUID NOT NULL,
    "store_mapping_id" UUID NOT NULL,
    "review_id" TEXT NOT NULL,
    "author_name" TEXT,
    "rating" INTEGER,
    "review_text" TEXT,
    "original_text" TEXT,
    "reviewer_language" TEXT,
    "device" TEXT,
    "device_metadata" JSONB,
    "android_os_version" INTEGER,
    "app_version_code" INTEGER,
    "app_version_name" TEXT,
    "thumbs_up_count" INTEGER,
    "thumbs_down_count" INTEGER,
    "user_comment_updated_at" TIMESTAMPTZ(6),
    "developer_reply_text" TEXT,
    "developer_reply_updated_at" TIMESTAMPTZ(6),
    "raw_review" JSONB,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "android_store_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "android_store_review_sync_states" (
    "id" UUID NOT NULL,
    "store_mapping_id" UUID NOT NULL,
    "status" "review_sync_status" NOT NULL DEFAULT 'idle',
    "last_fetch_started_at" TIMESTAMPTZ(6),
    "last_fetch_finished_at" TIMESTAMPTZ(6),
    "last_success_at" TIMESTAMPTZ(6),
    "last_review_updated_at" TIMESTAMPTZ(6),
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" TEXT,
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "last_fetched_count" INTEGER NOT NULL DEFAULT 0,
    "last_upserted_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "android_store_review_sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "android_store_review_fetch_runs" (
    "id" UUID NOT NULL,
    "store_mapping_id" UUID NOT NULL,
    "trigger_type" "review_fetch_trigger" NOT NULL DEFAULT 'scheduled',
    "status" "review_fetch_run_status" NOT NULL DEFAULT 'running',
    "max_results" INTEGER NOT NULL DEFAULT 100,
    "max_pages" INTEGER NOT NULL DEFAULT 2,
    "pages_fetched" INTEGER NOT NULL DEFAULT 0,
    "reviews_fetched" INTEGER NOT NULL DEFAULT 0,
    "reviews_upserted" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "error_message" TEXT,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "android_store_review_fetch_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "android_store_review_fetch_schedules" (
    "id" UUID NOT NULL,
    "store_mapping_id" UUID NOT NULL,
    "status" "review_fetch_schedule_status" NOT NULL DEFAULT 'active',
    "schedule_type" TEXT NOT NULL DEFAULT 'daily',
    "time_of_day" TEXT NOT NULL DEFAULT '09:00',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "lookback_days" INTEGER NOT NULL DEFAULT 7,
    "max_results" INTEGER NOT NULL DEFAULT 100,
    "max_pages" INTEGER NOT NULL DEFAULT 2,
    "next_run_at" TIMESTAMPTZ(6) NOT NULL,
    "last_run_at" TIMESTAMPTZ(6),
    "last_status" "review_fetch_run_status",
    "last_error_message" TEXT,
    "locked_at" TIMESTAMPTZ(6),
    "locked_by" TEXT,
    "run_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "android_store_review_fetch_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "android_store_review_reply_templates" (
    "id" UUID NOT NULL,
    "store_mapping_id" UUID NOT NULL,
    "rating" INTEGER NOT NULL,
    "reply_text" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "android_store_review_reply_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "android_credentials" (
    "id" UUID NOT NULL,
    "store_profile_id" UUID NOT NULL,
    "credential_ref" TEXT NOT NULL,
    "vault_secret_id" UUID,
    "vault_secret_name" TEXT,
    "vault_secret_version" INTEGER NOT NULL DEFAULT 1,
    "store_account_name" TEXT NOT NULL,
    "link_store" TEXT,
    "avatar_url" TEXT,
    "private_key_id" TEXT,
    "client_email" TEXT,
    "project_id" TEXT,
    "status" "credential_status" NOT NULL DEFAULT 'active',
    "description" TEXT,
    "created_by" TEXT,
    "rotated_by" TEXT,
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "android_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "iap_android" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "store_profile_id" UUID,
    "package_name" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "purchase_kind" TEXT NOT NULL,
    "purchase_token" TEXT NOT NULL,
    "order_id" TEXT,
    "linked_purchase_token" TEXT,
    "state" TEXT NOT NULL,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "consumed" BOOLEAN,
    "auto_renewing" BOOLEAN,
    "purchase_date" TIMESTAMPTZ(6),
    "expires_date" TIMESTAMPTZ(6),
    "revenue_micros" BIGINT,
    "currency" TEXT,
    "region_code" TEXT,
    "base_plan_id" TEXT,
    "offer_id" TEXT,
    "is_test_purchase" BOOLEAN NOT NULL DEFAULT false,
    "raw_receipt" JSONB,
    "verified_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "iap_android_pkey" PRIMARY KEY ("id")
);

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
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ios_store_profiles" (
    "id" UUID NOT NULL,
    "supabase_user_id" UUID,
    "store_account_name" TEXT NOT NULL,
    "link_store" TEXT,
    "avatar_url" TEXT,
    "issuer_id" TEXT,
    "status" "mapping_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ios_store_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ios_store_mappings" (
    "id" UUID NOT NULL,
    "store_profile_id" UUID NOT NULL,
    "store_account_name" TEXT NOT NULL,
    "app_id" TEXT,
    "app_name" TEXT NOT NULL,
    "app_icon_url" TEXT,
    "app_link" TEXT,
    "bundle_id" TEXT NOT NULL,
    "status" "mapping_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ios_store_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ios_credentials" (
    "id" UUID NOT NULL,
    "store_profile_id" UUID NOT NULL,
    "credential_ref" TEXT NOT NULL,
    "secret_type" "ios_secret_type" NOT NULL,
    "secret_format" "secret_format" NOT NULL DEFAULT 'p8',
    "credential_purpose" "credential_purpose" NOT NULL,
    "vault_secret_id" UUID,
    "vault_secret_name" TEXT,
    "vault_secret_version" INTEGER NOT NULL DEFAULT 1,
    "store_account_name" TEXT NOT NULL,
    "link_store" TEXT,
    "avatar_url" TEXT,
    "key_id" TEXT,
    "issuer_id" TEXT,
    "client_email" TEXT,
    "project_id" TEXT,
    "status" "credential_status" NOT NULL DEFAULT 'active',
    "description" TEXT,
    "created_by" TEXT,
    "rotated_by" TEXT,
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ios_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ios_iap_transactions" (
    "id" UUID NOT NULL,
    "store_profile_id" UUID,
    "transaction_id" TEXT NOT NULL,
    "original_transaction_id" TEXT,
    "product_id" TEXT NOT NULL,
    "user_id" TEXT,
    "bundle_id" TEXT,
    "purchase_date" TIMESTAMPTZ(6),
    "expires_date" TIMESTAMPTZ(6),
    "state" TEXT NOT NULL,
    "revenue_micros" BIGINT,
    "price_milliunits" BIGINT,
    "currency" TEXT,
    "is_trial" BOOLEAN,
    "environment" TEXT NOT NULL DEFAULT 'production',
    "raw_receipt" JSONB NOT NULL,
    "verified_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ios_iap_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" TEXT NOT NULL,
    "app_id" TEXT,
    "device_id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "firebase_app_id" TEXT,
    "firebase_project_id" TEXT,
    "token_hash" TEXT NOT NULL,
    "fcm_token" TEXT NOT NULL,
    "app_version" TEXT,
    "os_version" TEXT,
    "locale" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "store_platform" TEXT,
    "store_account_name" TEXT,
    "product_app_id" TEXT,
    "package_name" TEXT,
    "bundle_id" TEXT,
    "device_model" TEXT,
    "device_manufacturer" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "device_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "schedule_id" UUID,
    "platform" TEXT NOT NULL,
    "store_platform" TEXT,
    "store_profile_id" UUID,
    "store_account_name" TEXT,
    "app_mapping_id" UUID,
    "app_id" TEXT,
    "app_name" TEXT NOT NULL,
    "package_name" TEXT,
    "bundle_id" TEXT,
    "topic_base" TEXT NOT NULL,
    "credential_ref" TEXT,
    "project_id" TEXT,
    "target_type" TEXT NOT NULL DEFAULT 'topic',
    "target_values" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "title" TEXT,
    "message" TEXT,
    "image_url" TEXT,
    "data_payload" JSONB NOT NULL DEFAULT '{}',
    "locale_payload" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "error_count" INTEGER NOT NULL DEFAULT 0,
    "requested_by" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "store_platform" TEXT,
    "store_profile_id" UUID,
    "store_account_name" TEXT,
    "app_mapping_id" UUID,
    "app_id" TEXT,
    "app_name" TEXT NOT NULL,
    "package_name" TEXT,
    "bundle_id" TEXT,
    "topic_base" TEXT NOT NULL,
    "credential_ref" TEXT,
    "project_id" TEXT,
    "target_type" TEXT NOT NULL DEFAULT 'topic',
    "target_values" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "title" TEXT,
    "message" TEXT,
    "image_url" TEXT,
    "data_payload" JSONB NOT NULL DEFAULT '{}',
    "locale_payload" JSONB NOT NULL DEFAULT '[]',
    "schedule_type" TEXT NOT NULL DEFAULT 'once',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "scheduled_at" TIMESTAMPTZ(6),
    "time_of_day" TEXT,
    "day_of_month" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'active',
    "next_run_at" TIMESTAMPTZ(6),
    "last_run_at" TIMESTAMPTZ(6),
    "last_status" TEXT,
    "last_error" TEXT,
    "run_count" INTEGER NOT NULL DEFAULT 0,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "notification_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_id" TEXT NOT NULL,
    "job_id" UUID,
    "event_type" TEXT NOT NULL,
    "device_id" TEXT,
    "platform" TEXT,
    "target_type" TEXT,
    "target_value" TEXT,
    "status" TEXT,
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "error_detail" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "android_store_profiles_store_account_name_key" ON "android_store_profiles"("store_account_name");

-- CreateIndex
CREATE UNIQUE INDEX "android_store_profiles_supabase_user_id_key" ON "android_store_profiles"("supabase_user_id");

-- CreateIndex
CREATE INDEX "android_store_profiles_status_name_idx" ON "android_store_profiles"("status", "store_account_name");

-- CreateIndex
CREATE INDEX "android_store_mappings_app_id_status_idx" ON "android_store_mappings"("app_id", "status");

-- CreateIndex
CREATE INDEX "android_store_mappings_package_status_idx" ON "android_store_mappings"("package_name", "status");

-- CreateIndex
CREATE INDEX "android_store_mappings_store_name_idx" ON "android_store_mappings"("store_account_name");

-- CreateIndex
CREATE UNIQUE INDEX "android_store_mappings_profile_app_name_key" ON "android_store_mappings"("store_profile_id", "app_name");

-- CreateIndex
CREATE UNIQUE INDEX "android_store_mappings_profile_app_id_key" ON "android_store_mappings"("store_profile_id", "app_id");

-- CreateIndex
CREATE UNIQUE INDEX "android_store_mappings_package_key" ON "android_store_mappings"("package_name");

-- CreateIndex
CREATE INDEX "android_store_reviews_mapping_user_updated_idx" ON "android_store_reviews"("store_mapping_id", "user_comment_updated_at");

-- CreateIndex
CREATE INDEX "android_store_reviews_mapping_rating_idx" ON "android_store_reviews"("store_mapping_id", "rating");

-- CreateIndex
CREATE INDEX "android_store_reviews_reply_updated_idx" ON "android_store_reviews"("developer_reply_updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "android_store_reviews_mapping_review_key" ON "android_store_reviews"("store_mapping_id", "review_id");

-- CreateIndex
CREATE UNIQUE INDEX "android_store_review_sync_states_store_mapping_id_key" ON "android_store_review_sync_states"("store_mapping_id");

-- CreateIndex
CREATE INDEX "android_store_review_sync_states_status_started_idx" ON "android_store_review_sync_states"("status", "last_fetch_started_at");

-- CreateIndex
CREATE INDEX "android_store_review_sync_states_success_idx" ON "android_store_review_sync_states"("last_success_at");

-- CreateIndex
CREATE INDEX "android_store_review_fetch_runs_mapping_started_idx" ON "android_store_review_fetch_runs"("store_mapping_id", "started_at");

-- CreateIndex
CREATE INDEX "android_store_review_fetch_runs_status_started_idx" ON "android_store_review_fetch_runs"("status", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "android_store_review_fetch_schedules_store_mapping_id_key" ON "android_store_review_fetch_schedules"("store_mapping_id");

-- CreateIndex
CREATE INDEX "android_store_review_fetch_schedules_status_next_idx" ON "android_store_review_fetch_schedules"("status", "next_run_at");

-- CreateIndex
CREATE INDEX "android_store_review_fetch_schedules_locked_idx" ON "android_store_review_fetch_schedules"("locked_at");

-- CreateIndex
CREATE INDEX "android_store_review_reply_templates_mapping_active_idx" ON "android_store_review_reply_templates"("store_mapping_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "android_store_review_reply_templates_mapping_rating_key" ON "android_store_review_reply_templates"("store_mapping_id", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "android_credentials_credential_ref_key" ON "android_credentials"("credential_ref");

-- CreateIndex
CREATE INDEX "android_credentials_lookup_idx" ON "android_credentials"("credential_ref", "status");

-- CreateIndex
CREATE INDEX "android_credentials_store_status_idx" ON "android_credentials"("store_account_name", "status");

-- CreateIndex
CREATE INDEX "android_credentials_vault_secret_id_idx" ON "android_credentials"("vault_secret_id");

-- CreateIndex
CREATE INDEX "android_credentials_vault_secret_name_idx" ON "android_credentials"("vault_secret_name");

-- CreateIndex
CREATE UNIQUE INDEX "android_credentials_profile_key" ON "android_credentials"("store_profile_id");

-- CreateIndex
CREATE INDEX "iap_android_package_name_product_id_idx" ON "iap_android"("package_name", "product_id");

-- CreateIndex
CREATE INDEX "iap_android_state_purchase_date_idx" ON "iap_android"("state", "purchase_date");

-- CreateIndex
CREATE INDEX "iap_android_store_profile_id_idx" ON "iap_android"("store_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "iap_android_package_name_purchase_token_key" ON "iap_android"("package_name", "purchase_token");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_auth_user_id_key" ON "team_members"("auth_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_email_key" ON "team_members"("email");

-- CreateIndex
CREATE INDEX "team_members_role_status_idx" ON "team_members"("role", "status");

-- CreateIndex
CREATE INDEX "team_members_email_status_idx" ON "team_members"("email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ios_store_profiles_supabase_user_id_key" ON "ios_store_profiles"("supabase_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ios_store_profiles_store_account_name_key" ON "ios_store_profiles"("store_account_name");

-- CreateIndex
CREATE INDEX "ios_store_profiles_status_name_idx" ON "ios_store_profiles"("status", "store_account_name");

-- CreateIndex
CREATE INDEX "ios_store_mappings_app_id_status_idx" ON "ios_store_mappings"("app_id", "status");

-- CreateIndex
CREATE INDEX "ios_store_mappings_bundle_status_idx" ON "ios_store_mappings"("bundle_id", "status");

-- CreateIndex
CREATE INDEX "ios_store_mappings_store_name_idx" ON "ios_store_mappings"("store_account_name");

-- CreateIndex
CREATE UNIQUE INDEX "ios_store_mappings_profile_app_name_key" ON "ios_store_mappings"("store_profile_id", "app_name");

-- CreateIndex
CREATE UNIQUE INDEX "ios_store_mappings_profile_app_id_key" ON "ios_store_mappings"("store_profile_id", "app_id");

-- CreateIndex
CREATE UNIQUE INDEX "ios_store_mappings_bundle_key" ON "ios_store_mappings"("bundle_id");

-- CreateIndex
CREATE UNIQUE INDEX "ios_credentials_credential_ref_key" ON "ios_credentials"("credential_ref");

-- CreateIndex
CREATE INDEX "ios_credentials_lookup_idx" ON "ios_credentials"("credential_ref", "status");

-- CreateIndex
CREATE INDEX "ios_credentials_store_purpose_status_idx" ON "ios_credentials"("store_account_name", "credential_purpose", "status");

-- CreateIndex
CREATE INDEX "ios_credentials_vault_secret_id_idx" ON "ios_credentials"("vault_secret_id");

-- CreateIndex
CREATE INDEX "ios_credentials_vault_secret_name_idx" ON "ios_credentials"("vault_secret_name");

-- CreateIndex
CREATE UNIQUE INDEX "ios_credentials_profile_purpose_key" ON "ios_credentials"("store_profile_id", "credential_purpose");

-- CreateIndex
CREATE INDEX "ios_iap_transactions_store_profile_id_idx" ON "ios_iap_transactions"("store_profile_id");

-- CreateIndex
CREATE INDEX "ios_iap_transactions_bundle_verified_idx" ON "ios_iap_transactions"("bundle_id", "verified_at");

-- CreateIndex
CREATE INDEX "ios_iap_transactions_product_verified_idx" ON "ios_iap_transactions"("product_id", "verified_at");

-- CreateIndex
CREATE INDEX "ios_iap_transactions_user_verified_idx" ON "ios_iap_transactions"("user_id", "verified_at");

-- CreateIndex
CREATE UNIQUE INDEX "ios_iap_transactions_transaction_key" ON "ios_iap_transactions"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_tokens_token_hash_key" ON "device_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "device_tokens_platform_status_seen_idx" ON "device_tokens"("platform", "status", "last_seen_at");

-- CreateIndex
CREATE INDEX "device_tokens_device_platform_idx" ON "device_tokens"("device_id", "platform");

-- CreateIndex
CREATE INDEX "device_tokens_app_id_platform_status_idx" ON "device_tokens"("app_id", "platform", "status");

-- CreateIndex
CREATE INDEX "device_tokens_app_platform_status_idx" ON "device_tokens"("product_app_id", "platform", "status");

-- CreateIndex
CREATE INDEX "device_tokens_package_status_idx" ON "device_tokens"("package_name", "status");

-- CreateIndex
CREATE INDEX "device_tokens_bundle_status_idx" ON "device_tokens"("bundle_id", "status");

-- CreateIndex
CREATE INDEX "notification_jobs_schedule_created_idx" ON "notification_jobs"("schedule_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_jobs_platform_status_created_idx" ON "notification_jobs"("platform", "status", "created_at");

-- CreateIndex
CREATE INDEX "notification_jobs_store_created_idx" ON "notification_jobs"("store_account_name", "created_at");

-- CreateIndex
CREATE INDEX "notification_jobs_app_id_platform_created_idx" ON "notification_jobs"("app_id", "platform", "created_at");

-- CreateIndex
CREATE INDEX "notification_jobs_app_platform_created_idx" ON "notification_jobs"("app_name", "platform", "created_at");

-- CreateIndex
CREATE INDEX "notification_schedules_status_next_run_idx" ON "notification_schedules"("status", "next_run_at");

-- CreateIndex
CREATE INDEX "notification_schedules_platform_type_status_idx" ON "notification_schedules"("platform", "schedule_type", "status");

-- CreateIndex
CREATE INDEX "notification_schedules_app_id_platform_created_idx" ON "notification_schedules"("app_id", "platform", "created_at");

-- CreateIndex
CREATE INDEX "notification_schedules_app_platform_created_idx" ON "notification_schedules"("app_name", "platform", "created_at");

-- CreateIndex
CREATE INDEX "notification_events_notification_id_idx" ON "notification_events"("notification_id");

-- CreateIndex
CREATE INDEX "notification_events_job_created_idx" ON "notification_events"("job_id", "created_at");

-- CreateIndex
CREATE INDEX "notification_events_platform_event_created_idx" ON "notification_events"("platform", "event_type", "created_at");

-- CreateIndex
CREATE INDEX "notification_events_device_created_idx" ON "notification_events"("device_id", "created_at");

-- AddForeignKey
ALTER TABLE "android_store_mappings" ADD CONSTRAINT "android_store_mappings_store_profile_id_fkey" FOREIGN KEY ("store_profile_id") REFERENCES "android_store_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "android_store_reviews" ADD CONSTRAINT "android_store_reviews_store_mapping_id_fkey" FOREIGN KEY ("store_mapping_id") REFERENCES "android_store_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "android_store_review_sync_states" ADD CONSTRAINT "android_store_review_sync_states_store_mapping_id_fkey" FOREIGN KEY ("store_mapping_id") REFERENCES "android_store_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "android_store_review_fetch_runs" ADD CONSTRAINT "android_store_review_fetch_runs_store_mapping_id_fkey" FOREIGN KEY ("store_mapping_id") REFERENCES "android_store_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "android_store_review_fetch_schedules" ADD CONSTRAINT "android_store_review_fetch_schedules_store_mapping_id_fkey" FOREIGN KEY ("store_mapping_id") REFERENCES "android_store_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "android_store_review_reply_templates" ADD CONSTRAINT "android_store_review_reply_templates_store_mapping_id_fkey" FOREIGN KEY ("store_mapping_id") REFERENCES "android_store_mappings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "android_credentials" ADD CONSTRAINT "android_credentials_store_profile_id_fkey" FOREIGN KEY ("store_profile_id") REFERENCES "android_store_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "iap_android" ADD CONSTRAINT "iap_android_store_profile_id_fkey" FOREIGN KEY ("store_profile_id") REFERENCES "android_store_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ios_store_mappings" ADD CONSTRAINT "ios_store_mappings_store_profile_id_fkey" FOREIGN KEY ("store_profile_id") REFERENCES "ios_store_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ios_credentials" ADD CONSTRAINT "ios_credentials_store_profile_id_fkey" FOREIGN KEY ("store_profile_id") REFERENCES "ios_store_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ios_iap_transactions" ADD CONSTRAINT "ios_iap_transactions_store_profile_id_fkey" FOREIGN KEY ("store_profile_id") REFERENCES "ios_store_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_jobs" ADD CONSTRAINT "notification_jobs_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "notification_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "notification_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
