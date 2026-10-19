import "server-only";

import { webcrypto } from "node:crypto";

import { ApiError, badRequest } from "@/lib/server/api/errors";
import { getCredentialVaultSecret } from "@/lib/server/repositories/vault/secret.repository";
import { cleanText, parseSecretPayload } from "@/lib/server/services/credentials/credential.shared";

type AppleCredential = {
  credentialRef: string;
  issuerId: string | null;
  keyId: string | null;
  secretFormat: "JSON" | "P8";
  vaultSecretId: string | null;
};

export type AppleAscCredential = {
  credentialRef: string;
  issuerId: string;
  keyId: string;
  privateKey: string;
};

export type AppleRateLimit = {
  hourlyLimit: number | null;
  hourlyRemaining: number | null;
  rawHeader: string | null;
};

function base64Url(value: string | ArrayBuffer) {
  const buffer =
    typeof value === "string" ? Buffer.from(value) : Buffer.from(value);

  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s/g, "");

  return Buffer.from(base64, "base64");
}

export async function appleAppStoreConnectToken(
  credential: AppleAscCredential,
) {
  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "ES256",
    kid: credential.keyId,
    typ: "JWT",
  };
  const payload = {
    aud: "appstoreconnect-v1",
    exp: now + 15 * 60,
    iat: now,
    iss: credential.issuerId,
  };
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(payload),
  )}`;
  const key = await webcrypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(credential.privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = await webcrypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    Buffer.from(signingInput),
  );

  return `${signingInput}.${base64Url(signature)}`;
}

export async function resolveAppleAscCredential(
  credential: AppleCredential | null,
) {
  if (!credential) {
    throw badRequest("No active App Store Connect review credential was found.");
  }

  const secretText = await getCredentialVaultSecret(credential.vaultSecretId);
  const secretPayload = parseSecretPayload(
    secretText,
    credential.secretFormat === "JSON" ? "json" : "p8",
  );
  const privateKey =
    cleanText(secretPayload.private_key) || cleanText(secretPayload.value);
  const keyId =
    cleanText(credential.keyId) || cleanText(secretPayload.key_id);
  const issuerId =
    cleanText(credential.issuerId) || cleanText(secretPayload.issuer_id);

  if (!privateKey || !keyId || !issuerId) {
    throw badRequest(
      "App Store Connect credential must include private key, key id and issuer id.",
    );
  }

  return {
    credentialRef: credential.credentialRef,
    issuerId,
    keyId,
    privateKey,
  };
}

export function parseAppleRateLimit(header: string | null): AppleRateLimit {
  const parts = new Map<string, number>();

  for (const part of (header ?? "").split(";")) {
    const [key, value] = part.trim().split(":");
    const parsed = Number(value);
    if (key && Number.isFinite(parsed)) parts.set(key, parsed);
  }

  return {
    hourlyLimit: parts.get("user-hour-lim") ?? null,
    hourlyRemaining: parts.get("user-hour-rem") ?? null,
    rawHeader: header,
  };
}

export async function readAppleJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

export function throwAppleApiError(
  response: Response,
  body: Record<string, unknown>,
  operation: string,
) {
  throw new ApiError(
    `${operation} failed: ${JSON.stringify(body)}`,
    response.status === 429 ? 429 : 502,
  );
}
