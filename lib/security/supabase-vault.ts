import "server-only";

import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";

type VaultClient = Pick<Prisma.TransactionClient, "$queryRaw">;

type UpsertVaultSecretInput = {
  credentialRef: string;
  description: string | null;
  existingVaultSecretId?: string | null;
  keyId?: string | null;
  platform: "android" | "ios";
  secretCategory: string;
  secretText: string;
  storeAccountName?: string | null;
};

function safeNamePart(value: string | null | undefined) {
  if (!value) return "";

  return value
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
}

function vaultSecretCategoryName(secretCategory: string, platform?: "android" | "ios") {
  if (platform === "android" && secretCategory === "android_service_account") {
    return "service-account";
  }

  switch (secretCategory) {
    case "apple_asc_p8":
      return "key-review";
    case "apple_iap_p8":
      return "key-iap";
    case "firebase_service_account":
      return "firebase-admin";
    default:
      return safeNamePart(secretCategory) || "credential";
  }
}

export function vaultSecretName(
  input: Pick<
    UpsertVaultSecretInput,
    "credentialRef" | "keyId" | "platform" | "secretCategory" | "storeAccountName"
  >
) {
  const storeSlug = safeNamePart(input.storeAccountName) || safeNamePart(input.credentialRef) || "store";
  const category = vaultSecretCategoryName(input.secretCategory, input.platform);
  const readableKeyId = safeNamePart(input.keyId).slice(0, 32);
  const hash = createHash("sha256")
    .update(`${input.platform}:${storeSlug}:${category}:${readableKeyId || "default"}`)
    .digest("hex")
    .slice(0, 8);

  return [input.platform, storeSlug, category, readableKeyId, hash].filter(Boolean).join(".");
}

function vaultDescription(input: UpsertVaultSecretInput) {
  const text = input.description?.trim();
  const storeName = input.storeAccountName?.trim() || input.credentialRef;
  const context = [
    input.platform,
    storeName,
    vaultSecretCategoryName(input.secretCategory, input.platform),
    input.keyId ? `keyId=${input.keyId}` : null,
  ].filter(Boolean).join(" | ");

  return text ? `${text} (${context})` : `System Tracking credential (${context})`;
}

export async function upsertVaultSecret(client: VaultClient, input: UpsertVaultSecretInput) {
  const name = vaultSecretName(input);
  const description = vaultDescription(input);

  if (input.existingVaultSecretId) {
    await client.$queryRaw<Array<{ ok: boolean }>>`
      with updated as (
        select vault.update_secret(
          ${input.existingVaultSecretId}::uuid,
          ${input.secretText},
          ${name},
          ${description},
          ${null}::uuid
        )
      )
      select true as ok from updated
    `;

    return {
      vaultSecretId: input.existingVaultSecretId,
      vaultSecretName: name,
    };
  }

  const rows = await client.$queryRaw<Array<{ id: string }>>`
    select vault.create_secret(${input.secretText}, ${name}, ${description}, ${null}::uuid)::text as id
  `;

  const vaultSecretId = rows[0]?.id;
  if (!vaultSecretId) {
    throw new Error("Vault secret creation did not return an id.");
  }

  return {
    vaultSecretId,
    vaultSecretName: name,
  };
}

export async function deleteVaultSecret(client: VaultClient, vaultSecretId: string | null) {
  if (!vaultSecretId) return;

  const rows = await client.$queryRaw<Array<{ id: string }>>`
    with deleted as (
      delete from vault.secrets
      where id = ${vaultSecretId}::uuid
      returning id
    )
    select id::text from deleted
  `;

  if (!rows[0]?.id) {
    throw new Error("Vault secret was not found or could not be deleted.");
  }
}

export async function getVaultSecret(client: VaultClient, vaultSecretId: string | null) {
  if (!vaultSecretId) {
    throw new Error("Credential does not have a Vault secret.");
  }

  const rows = await client.$queryRaw<Array<{ decrypted_secret: string | null }>>`
    select decrypted_secret::text
    from vault.decrypted_secrets
    where id = ${vaultSecretId}::uuid
    limit 1
  `;

  const secretText = rows[0]?.decrypted_secret;
  if (!secretText) {
    throw new Error("Vault secret was not found or could not be decrypted.");
  }

  return secretText;
}
