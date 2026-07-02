import "server-only";

import type { CredentialStatus } from "@prisma/client";
import { unstable_cache } from "next/cache";

import { CACHE_TAGS } from "@/lib/server/cache-tags";
import { badRequest, notFound } from "@/lib/server/api/errors";
import {
  createAndroidCredential,
  deleteAndroidCredential,
  deleteAndroidCredentialsByIds,
  getAndroidCredentials,
  getAndroidCredentialsPage,
  getAndroidCredentialStoreRefs,
  getAndroidCredentialsByIds,
  getAndroidCredentialTarget,
  getCurrentAndroidCredentialForStoreProfile,
  updateAndroidCredential,
} from "@/lib/server/repositories/android/credential.repository";
import {
  deleteUnusedAndroidStoreProfile,
  updateAndroidStoreProfileMetadata,
  upsertAndroidStoreProfile,
} from "@/lib/server/repositories/android/store-profile.repository";
import { runRepositoryTransaction } from "@/lib/server/repositories/common/transaction.repository";
import { paginatedResult, type PaginationQuery } from "@/lib/server/api/pagination";
import {
  deleteCredentialVaultSecret,
  getCredentialVaultSecret,
  upsertCredentialVaultSecret,
} from "@/lib/server/repositories/vault/secret.repository";
import {
  CredentialConflictError,
  cleanText,
  credentialConflictToApiError,
  getSecretFileText,
  inferMetadata,
  invalidCredentialRef,
  credentialStatusMap,
  nullableText,
  parseSecretPayload,
  profileMetadata,
  profileMetadataPatch,
  requireHardDeleteConfirmation,
  validateGoogleServiceAccountSecret,
} from "@/lib/server/services/credentials/credential.shared";
import type { CredentialPayload } from "@/lib/server/services/credentials/credential.types";
import { androidCredentialToMetadata } from "@/lib/tracking/mappers/android";
import type { StoreMappingStoreOption } from "@/lib/tracking/page-data";

type ExistingAndroidCredential = Awaited<ReturnType<typeof import("@/lib/server/repositories/android/credential.repository").getAndroidCredentialTarget>>;

const getCachedAndroidCredentialConfigs = unstable_cache(
  async (take: number) => {
    const credentials = await getAndroidCredentials(take);

    return {
      credentials: credentials.map(androidCredentialToMetadata),
    };
  },
  ["android-credential-configs"],
  {
    revalidate: 300,
    tags: [CACHE_TAGS.androidCredentials],
  },
);

export function getAndroidCredentialConfigs(take = 200) {
  return getCachedAndroidCredentialConfigs(take);
}

export async function getAndroidCredentialStoreOptions(take = 300): Promise<StoreMappingStoreOption[]> {
  const credentials = await getAndroidCredentialStoreRefs(take);
  const options = new Map<string, StoreMappingStoreOption>();

  for (const credential of credentials) {
    const name =
      credential.storeProfile?.storeAccountName?.trim() ||
      credential.storeAccountName?.trim();

    if (!credential.storeProfileId || !name || options.has(credential.storeProfileId)) {
      continue;
    }

    options.set(credential.storeProfileId, {
      id: credential.storeProfileId,
      name,
      platform: "android",
    });
  }

  return Array.from(options.values()).sort((left, right) =>
    left.name.localeCompare(right.name),
  );
}

export async function getAndroidCredentialConfigsPage(options: PaginationQuery & {
  knownTotal?: number;
  search?: string;
}) {
  const [credentials, total] = await getAndroidCredentialsPage({
    includeTotal: options.knownTotal === undefined,
    search: options.search,
    skip: options.skip,
    take: options.take,
  });

  return paginatedResult(
    credentials.map(androidCredentialToMetadata),
    total ?? options.knownTotal ?? credentials.length,
    options,
  );
}

export async function getAndroidCredentialSecret(input: {
  credentialRef: string;
  id: string;
}) {
  if (!input.id && invalidCredentialRef(input.credentialRef)) {
    throw badRequest("Credential id or ref is required.");
  }

  const target = await getAndroidCredentialTarget(input);
  if (!target) {
    throw notFound("Android credential was not found.");
  }

  return {
    credentialId: target.id,
    platform: "android" as const,
    secretText: await getCredentialVaultSecret(target.vaultSecretId),
  };
}

function getAndroidSecretInput(payload: CredentialPayload) {
  const credentialRef = cleanText(payload.credentialRef);
  const status = credentialStatusMap[cleanText(payload.status).toLowerCase()] ?? credentialStatusMap.active;

  if (invalidCredentialRef(credentialRef)) {
    throw badRequest("Invalid credential ref.");
  }

  return {
    credentialRef,
    status,
  };
}

async function persistAndroidCredentialConfig(input: {
  authEmail: string;
  existingCredential: ExistingAndroidCredential;
  payload: CredentialPayload;
  secretText: string;
  status: CredentialStatus;
}) {
  const credentialRef = cleanText(input.payload.credentialRef);
  const storeProfileId = cleanText(input.payload.storeProfileId);
  const storeAccountName = nullableText(input.payload.storeAccountName) ?? "";

  if (!storeAccountName) {
    throw badRequest("Store name is required.");
  }

  const secretPayload = parseSecretPayload(input.secretText, "json");
  if (!validateGoogleServiceAccountSecret(secretPayload)) {
    throw badRequest("Google Service Account JSON is missing required fields.");
  }

  const metadata = inferMetadata(input.payload, secretPayload);
  const credential = await runRepositoryTransaction(async (tx) => {
    const profile = input.existingCredential
      ? await updateAndroidStoreProfileMetadata(tx, input.existingCredential.storeProfileId, {
          storeAccountName,
          ...profileMetadata(input.payload),
        })
      : storeProfileId
        ? await updateAndroidStoreProfileMetadata(tx, storeProfileId, {
            storeAccountName,
            ...profileMetadata(input.payload),
          })
        : await upsertAndroidStoreProfile(tx, {
            storeAccountName,
            ...profileMetadata(input.payload),
          });
    const current = input.existingCredential
      ? {
          id: input.existingCredential.id,
          vaultSecretId: input.existingCredential.vaultSecretId,
          vaultSecretVersion: input.existingCredential.vaultSecretVersion,
        }
      : await getCurrentAndroidCredentialForStoreProfile(tx, profile.id);

    if (input.existingCredential && input.existingCredential.id !== current?.id) {
      throw new CredentialConflictError("Credential ref already exists on another Android credential.");
    }

    const vaultSecret = await upsertCredentialVaultSecret(tx, {
      credentialRef,
      description: nullableText(input.payload.description),
      existingVaultSecretId: current?.vaultSecretId,
      keyId: metadata.keyId,
      platform: "android",
      secretText: input.secretText,
      secretCategory: "android_service_account",
      storeAccountName,
    });

    const credentialData = {
      storeProfileId: profile.id,
      credentialRef,
      vaultSecretId: vaultSecret.vaultSecretId,
      vaultSecretName: vaultSecret.vaultSecretName,
      vaultSecretVersion: (current?.vaultSecretVersion ?? 0) + 1,
      storeAccountName: profile.storeAccountName,
      linkStore: nullableText(input.payload.linkStore),
      avatarUrl: nullableText(input.payload.avatarUrl),
      privateKeyId: metadata.keyId,
      clientEmail: metadata.clientEmail,
      projectId: metadata.projectId,
      status: input.status,
      description: nullableText(input.payload.description),
      rotatedBy: input.authEmail,
    };

    if (current) {
      return updateAndroidCredential(tx, current.id, credentialData);
    }

    return createAndroidCredential(tx, {
      ...credentialData,
      createdBy: input.authEmail,
    });
  });

  return {
    credential: androidCredentialToMetadata(credential),
    message: `Vault credential ${credentialRef} has been saved.`,
  };
}

export async function saveAndroidCredentialConfig(payload: CredentialPayload, authEmail: string) {
  const input = getAndroidSecretInput(payload);
  const secretText = await getSecretFileText(payload);
  const existingCredential = await getAndroidCredentialTarget({
    id: cleanText(payload.id),
    credentialRef: input.credentialRef,
  });

  try {
    return persistAndroidCredentialConfig({
      authEmail,
      existingCredential,
      payload,
      secretText,
      status: input.status,
    });
  } catch (error) {
    credentialConflictToApiError(error);
  }
}

async function updateAndroidCredentialMetadata(input: {
  authEmail: string;
  payload: CredentialPayload;
  target: NonNullable<ExistingAndroidCredential>;
}) {
  const patchStoreAccountName =
    input.payload.storeAccountName === undefined ? undefined : cleanText(input.payload.storeAccountName);

  if (input.payload.storeAccountName !== undefined && !patchStoreAccountName) {
    throw badRequest("Store name is required.");
  }

  const basePatch = {
    status: input.payload.status ? credentialStatusMap[input.payload.status] : undefined,
    storeAccountName: patchStoreAccountName,
    linkStore: input.payload.linkStore === undefined ? undefined : nullableText(input.payload.linkStore),
    avatarUrl: input.payload.avatarUrl === undefined ? undefined : nullableText(input.payload.avatarUrl),
    description: input.payload.description === undefined ? undefined : nullableText(input.payload.description),
    rotatedBy: input.authEmail,
  };

  const credential = await runRepositoryTransaction(async (tx) => {
    const profile =
      input.payload.storeAccountName !== undefined ||
      input.payload.linkStore !== undefined ||
      input.payload.avatarUrl !== undefined
        ? await updateAndroidStoreProfileMetadata(tx, input.target.storeProfileId, {
            ...profileMetadataPatch(input.payload),
            storeAccountName: patchStoreAccountName,
          })
        : null;

    return updateAndroidCredential(
      tx,
      input.target.id,
      profile
        ? {
            ...basePatch,
            storeAccountName: profile.storeAccountName,
          }
        : basePatch
    );
  });

  return { credential: androidCredentialToMetadata(credential), message: "Credential metadata updated." };
}

export async function updateAndroidCredentialConfig(payload: CredentialPayload, authEmail: string) {
  const id = cleanText(payload.id);
  const credentialRef = cleanText(payload.credentialRef);

  if (!id && invalidCredentialRef(credentialRef)) {
    throw badRequest("Credential id or ref is required.");
  }

  const target = await getAndroidCredentialTarget({ id, credentialRef });
  if (!target) {
    throw notFound("Android credential was not found.");
  }

  return updateAndroidCredentialMetadata({ authEmail, payload, target });
}

async function deleteAndroidCredentialByTarget(input: {
  confirmationName: string;
  target: NonNullable<ExistingAndroidCredential>;
}) {
  requireHardDeleteConfirmation(input.confirmationName, [input.target]);

  await runRepositoryTransaction(async (tx) => {
    await deleteCredentialVaultSecret(tx, input.target.vaultSecretId);
    await deleteAndroidCredential(tx, input.target.id);
    await deleteUnusedAndroidStoreProfile(tx, input.target.storeProfileId);
  });

  return { deleted: input.target.id, message: "Database credential deleted." };
}

async function deleteAndroidCredentialConfigGroup(input: {
  confirmationName: string;
  ids: string[];
}) {
  const credentials = await getAndroidCredentialsByIds(input.ids);

  if (credentials.length !== input.ids.length) {
    throw badRequest("One or more credentials were not found.");
  }

  requireHardDeleteConfirmation(input.confirmationName, credentials);

  await runRepositoryTransaction(async (tx) => {
    const storeProfileIds = Array.from(new Set(credentials.map((credential) => credential.storeProfileId)));

    for (const credential of credentials) {
      await deleteCredentialVaultSecret(tx, credential.vaultSecretId);
    }
    await deleteAndroidCredentialsByIds(tx, input.ids);

    for (const storeProfileId of storeProfileIds) {
      await deleteUnusedAndroidStoreProfile(tx, storeProfileId);
    }
  });

  return { deleted: input.ids, message: "Credential config hard deleted." };
}

export async function deleteAndroidCredentialConfig(payload: CredentialPayload) {
  const id = cleanText(payload.id);
  const ids = Array.isArray(payload.ids) ? Array.from(new Set(payload.ids.map(cleanText).filter(Boolean))) : [];
  const credentialRef = cleanText(payload.credentialRef);
  const confirmationName = cleanText(payload.confirmationName);

  if (!confirmationName) {
    throw badRequest("Confirmation name is required for hard delete.");
  }

  if (ids.length) {
    return deleteAndroidCredentialConfigGroup({ confirmationName, ids });
  }

  if (!id && invalidCredentialRef(credentialRef)) {
    throw badRequest("Credential id or ref is required.");
  }

  const target = await getAndroidCredentialTarget({ id, credentialRef });
  if (!target) {
    throw notFound("Android credential was not found.");
  }

  return deleteAndroidCredentialByTarget({ confirmationName, target });
}
