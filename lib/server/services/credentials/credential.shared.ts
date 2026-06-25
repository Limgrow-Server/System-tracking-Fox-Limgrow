import "server-only";

import {
  CredentialStatus,
  SecretFormat,
} from "@prisma/client";

import { badRequest, conflict } from "@/lib/server/api/errors";
import type {
  CredentialMetadata,
  CredentialPayload,
} from "@/lib/server/services/credentials/credential.types";

const MAX_SECRET_BYTES = 128 * 1024;

export const secretFormatMap: Record<string, SecretFormat> = {
  json: SecretFormat.JSON,
  p8: SecretFormat.P8,
};

export const credentialStatusMap: Record<string, CredentialStatus> = {
  active: CredentialStatus.ACTIVE,
  disabled: CredentialStatus.DISABLED,
};

export class CredentialConflictError extends Error {}

export function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function nullableText(value: unknown) {
  const cleaned = cleanText(value);
  return cleaned || null;
}

export function profileMetadata(payload: CredentialPayload) {
  return {
    linkStore: nullableText(payload.linkStore),
    avatarUrl: nullableText(payload.avatarUrl),
  };
}

export function profileMetadataPatch(payload: CredentialPayload) {
  return {
    linkStore: payload.linkStore === undefined ? undefined : nullableText(payload.linkStore),
    avatarUrl: payload.avatarUrl === undefined ? undefined : nullableText(payload.avatarUrl),
  };
}

export function invalidCredentialRef(credentialRef: string) {
  return !credentialRef || !/^[A-Za-z0-9_.:@/-]+$/.test(credentialRef);
}

function formText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : undefined;
}

function isFile(value: FormDataEntryValue | null): value is File {
  return typeof File !== "undefined" && value instanceof File;
}

export async function parseCredentialPayload(request: Request): Promise<CredentialPayload> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.toLowerCase().includes("multipart/form-data")) {
    const form = await request.formData();
    const secretFile = form.get("secretFile");

    return {
      id: formText(form, "id"),
      credentialRef: formText(form, "credentialRef"),
      secretType: formText(form, "secretType"),
      secretFormat: formText(form, "secretFormat") as CredentialPayload["secretFormat"],
      secretFile: isFile(secretFile) ? secretFile : null,
      secretFileName: isFile(secretFile) ? secretFile.name : formText(form, "secretFileName"),
      storeProfileId: formText(form, "storeProfileId"),
      storePlatform: formText(form, "storePlatform") as CredentialPayload["storePlatform"],
      storeAccountName: formText(form, "storeAccountName"),
      platform: formText(form, "platform") as CredentialPayload["platform"],
      keyId: formText(form, "keyId"),
      issuerId: formText(form, "issuerId"),
      clientEmail: formText(form, "clientEmail"),
      projectId: formText(form, "projectId"),
      linkStore: formText(form, "linkStore"),
      avatarUrl: formText(form, "avatarUrl"),
      status: formText(form, "status") as CredentialPayload["status"],
      description: formText(form, "description"),
    };
  }

  return (await request.json().catch(() => ({}))) as CredentialPayload;
}

export async function getSecretFileText(payload: CredentialPayload) {
  if (!payload.secretFile) {
    throw badRequest("Secret file is required.");
  }

  if (payload.secretFile.size > MAX_SECRET_BYTES) {
    throw badRequest("Secret file is too large. Maximum size is 128KB.");
  }

  return payload.secretFile.text();
}

export function parseSecretPayload(secretText: string, secretFormat: CredentialPayload["secretFormat"]) {
  if (secretFormat === "json") {
    try {
      const parsed = JSON.parse(secretText) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return { value: secretText };
    }
  }

  return { value: secretText };
}

export function validateGoogleServiceAccountSecret(secretPayload: Record<string, unknown>) {
  const privateKey = typeof secretPayload.private_key === "string" ? secretPayload.private_key : "";
  const clientEmail = typeof secretPayload.client_email === "string" ? secretPayload.client_email : "";

  return (
    secretPayload.type === "service_account" &&
    typeof secretPayload.project_id === "string" &&
    typeof secretPayload.private_key_id === "string" &&
    clientEmail.includes("@") &&
    privateKey.includes("-----BEGIN PRIVATE KEY-----") &&
    privateKey.includes("-----END PRIVATE KEY-----")
  );
}

function validateP8(secretText: string) {
  return (
    secretText.includes("-----BEGIN PRIVATE KEY-----") &&
    secretText.includes("-----END PRIVATE KEY-----")
  );
}

export function validateSecretValue(
  secretType: string,
  secretFormat: CredentialPayload["secretFormat"],
  secretText: string,
  secretPayload: Record<string, unknown>
) {
  if (secretFormat === "json" && !secretText.trim().startsWith("{")) {
    throw badRequest("JSON credential must be an object.");
  }

  if (
    secretType === "firebase_service_account" &&
    !validateGoogleServiceAccountSecret(secretPayload)
  ) {
    throw badRequest("Service-account JSON is missing required fields.");
  }

  if (["apple_asc_p8", "apple_iap_p8"].includes(secretType) && !validateP8(secretText)) {
    throw badRequest("Apple .p8 credential must contain a PEM private key.");
  }
}

export function inferMetadata(payload: CredentialPayload, secretPayload: Record<string, unknown>): CredentialMetadata {
  const privateKeyId = typeof secretPayload.private_key_id === "string" ? secretPayload.private_key_id : null;
  const clientEmail = typeof secretPayload.client_email === "string" ? secretPayload.client_email : null;
  const projectId = typeof secretPayload.project_id === "string" ? secretPayload.project_id : null;

  return {
    keyId: nullableText(payload.keyId) ?? privateKeyId,
    issuerId: nullableText(payload.issuerId),
    clientEmail: nullableText(payload.clientEmail) ?? clientEmail,
    projectId: nullableText(payload.projectId) ?? projectId,
  };
}

export function defaultFormat(secretType: string) {
  if (secretType.includes("p8")) return "p8" as const;
  return "json" as const;
}

export function deleteConfirmationName(credentials: Array<{ credentialRef: string; storeAccountName: string | null }>) {
  const storeNames = Array.from(
    new Set(credentials.map((credential) => cleanText(credential.storeAccountName)).filter(Boolean))
  );

  if (storeNames.length === 1) return storeNames[0];
  if (credentials.length === 1) return credentials[0]?.credentialRef ?? "";
  return "";
}

export function requireHardDeleteConfirmation(
  confirmationName: string,
  credentials: Array<{ credentialRef: string; storeAccountName: string | null; status: CredentialStatus }>
) {
  const expectedName = deleteConfirmationName(credentials);

  if (!expectedName) {
    throw conflict("Could not determine the credential confirmation name.");
  }

  if (confirmationName !== expectedName) {
    throw conflict("Confirmation name does not match.");
  }

  if (credentials.some((credential) => credential.status === CredentialStatus.ACTIVE)) {
    throw conflict("Credential must be inactive before hard delete.");
  }
}

export function credentialConflictToApiError(error: unknown): never {
  if (error instanceof CredentialConflictError) {
    throw conflict(error.message);
  }

  throw error;
}
