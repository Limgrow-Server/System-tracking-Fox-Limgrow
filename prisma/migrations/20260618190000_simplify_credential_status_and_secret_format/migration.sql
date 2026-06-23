-- Credential status currently supports only active/disabled.
-- Legacy rotating/expired values were design placeholders without runtime flows.
CREATE TYPE "credential_status" AS ENUM ('active', 'disabled');

ALTER TABLE "android_credentials" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ios_credentials" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "android_credentials"
  ALTER COLUMN "status" TYPE "credential_status"
  USING (
    CASE
      WHEN "status"::text IN ('active', 'rotating') THEN 'active'::credential_status
      ELSE 'disabled'::credential_status
    END
  );

ALTER TABLE "ios_credentials"
  ALTER COLUMN "status" TYPE "credential_status"
  USING (
    CASE
      WHEN "status"::text IN ('active', 'rotating') THEN 'active'::credential_status
      ELSE 'disabled'::credential_status
    END
  );

ALTER TABLE "android_credentials" ALTER COLUMN "status" SET DEFAULT 'active';
ALTER TABLE "ios_credentials" ALTER COLUMN "status" SET DEFAULT 'active';

DROP TYPE "secret_lifecycle_status";

-- Current credential payloads are only service-account JSON or Apple .p8 keys.
-- Legacy text values are normalized by platform/secret shape so the enum can be narrowed.
ALTER TABLE "android_credentials" ALTER COLUMN "secret_format" DROP DEFAULT;
ALTER TABLE "ios_credentials" ALTER COLUMN "secret_format" DROP DEFAULT;

ALTER TYPE "secret_format" RENAME TO "secret_format_old";
CREATE TYPE "secret_format" AS ENUM ('json', 'p8');

ALTER TABLE "android_credentials"
  ALTER COLUMN "secret_format" TYPE "secret_format"
  USING (
    CASE
      WHEN "secret_format"::text = 'p8' THEN 'p8'::secret_format
      ELSE 'json'::secret_format
    END
  );

ALTER TABLE "ios_credentials"
  ALTER COLUMN "secret_format" TYPE "secret_format"
  USING (
    CASE
      WHEN "secret_format"::text = 'p8' THEN 'p8'::secret_format
      ELSE 'json'::secret_format
    END
  );

ALTER TABLE "android_credentials" ALTER COLUMN "secret_format" SET DEFAULT 'json';
ALTER TABLE "ios_credentials" ALTER COLUMN "secret_format" SET DEFAULT 'p8';

DROP TYPE "secret_format_old";
