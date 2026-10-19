-- CreateTable
CREATE TABLE "credential_secret_otps" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'credential_secret_reveal',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_secret_otps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credential_secret_unlocks" (
    "id" UUID NOT NULL,
    "member_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'credential_secret_reveal',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credential_secret_unlocks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credential_secret_otps_member_purpose_expires_idx" ON "credential_secret_otps"("member_id", "purpose", "expires_at");

-- CreateIndex
CREATE INDEX "credential_secret_otps_email_purpose_expires_idx" ON "credential_secret_otps"("email", "purpose", "expires_at");

-- CreateIndex
CREATE INDEX "credential_secret_unlocks_member_purpose_expires_idx" ON "credential_secret_unlocks"("member_id", "purpose", "expires_at");

-- CreateIndex
CREATE INDEX "credential_secret_unlocks_email_purpose_expires_idx" ON "credential_secret_unlocks"("email", "purpose", "expires_at");

-- AddForeignKey
ALTER TABLE "credential_secret_otps" ADD CONSTRAINT "credential_secret_otps_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_secret_unlocks" ADD CONSTRAINT "credential_secret_unlocks_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES "team_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- EnableRLS
ALTER TABLE "credential_secret_otps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "credential_secret_unlocks" ENABLE ROW LEVEL SECURITY;
