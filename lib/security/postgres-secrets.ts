import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import type { Prisma } from "@prisma/client";

type SecretClient = Pick<Prisma.TransactionClient, "$queryRaw">;

type UpsertSecretInput = {
  credentialRef: string;
  description: string | null;
  existingVaultSecretId?: string | null;
  keyId?: string | null;
  platform: "android" | "ios";
  secretCategory: string;
  secretText: string;
  storeAccountName?: string | null;
};

const safe = (value: string | null | undefined) =>
  (value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);

function category(value: string) {
  if (value === "android_service_account") return "service-account";
  if (value === "apple_asc_p8") return "key-review";
  if (value === "apple_iap_p8") return "key-iap";
  if (value === "firebase_service_account") return "firebase-admin";
  return safe(value) || "credential";
}

function key() {
  const raw = process.env.CREDENTIAL_ENCRYPTION_KEY?.trim() ?? "";
  const parsed = /^[a-f0-9]{64}$/i.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");
  if (parsed.length !== 32) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY must encode exactly 32 bytes.");
  }
  return parsed;
}

function name(input: UpsertSecretInput) {
  const store = safe(input.storeAccountName) || safe(input.credentialRef) || "store";
  const type = category(input.secretCategory);
  const keyId = safe(input.keyId).slice(0, 32);
  const suffix = createHash("sha256")
    .update(`${input.platform}:${store}:${type}:${keyId || "default"}`)
    .digest("hex")
    .slice(0, 8);
  return [input.platform, store, type, keyId, suffix].filter(Boolean).join(".");
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export async function upsertSecret(client: SecretClient, input: UpsertSecretInput) {
  const id = input.existingVaultSecretId || randomUUID();
  const secretName = name(input);
  const encrypted = encrypt(input.secretText);
  const rows = await client.$queryRaw<Array<{ id: string }>>`
    INSERT INTO public.app_secrets (id, name, description, ciphertext, iv, auth_tag, key_version, updated_at)
    VALUES (${id}::uuid, ${secretName}, ${input.description}, ${encrypted.ciphertext}, ${encrypted.iv}, ${encrypted.authTag}, 1, now())
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name, description = EXCLUDED.description,
      ciphertext = EXCLUDED.ciphertext, iv = EXCLUDED.iv,
      auth_tag = EXCLUDED.auth_tag, updated_at = now()
    RETURNING id::text
  `;
  return { vaultSecretId: rows[0]?.id ?? id, vaultSecretName: secretName };
}

export async function deleteSecret(client: SecretClient, id: string | null) {
  if (id) await client.$queryRaw`DELETE FROM public.app_secrets WHERE id = ${id}::uuid`;
}

export async function getSecret(client: SecretClient, id: string | null) {
  if (!id) throw new Error("Credential does not have an encrypted secret.");
  const rows = await client.$queryRaw<Array<{ auth_tag: string; ciphertext: string; iv: string }>>`
    SELECT auth_tag, ciphertext, iv FROM public.app_secrets WHERE id = ${id}::uuid LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error("Encrypted secret was not found.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(row.iv, "base64"));
  decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(row.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
