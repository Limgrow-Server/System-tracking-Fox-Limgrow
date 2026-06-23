import "server-only";

import {
  CredentialPurpose,
  IosSecretType,
} from "@prisma/client";
import type {
  CredentialStatus,
  SecretFormat,
} from "@prisma/client";

import { badRequest, notFound } from "@/lib/server/api/errors";
import {
  createIosCredential,
  deleteIosCredential,
  deleteIosCredentialsByIds,
  getCurrentIosCredentialForStorePurpose,
  getIosCredentials,
  getIosCredentialsByIds,
  getIosCredentialTarget,
  updateIosCredential,
} from "@/lib/server/repositories/ios/credential.repository";
import {
  deleteUnusedIosStoreProfile,
  updateIosStoreProfileMetadata,
  upsertIosStoreProfile,
} from "@/lib/server/repositories/ios/store-profile.repository";
import { runRepositoryTransaction } from "@/lib/server/repositories/common/transaction.repository";
import {
  deleteCredentialVaultSecret,
  getCredentialVaultSecret,
  upsertCredentialVaultSecret,
} from "@/lib/server/repositories/vault/secret.repository";
import {
  CredentialConflictError,
  cleanText,
  credentialConflictToApiError,
  defaultFormat,
  getSecretFileText,
  inferMetadata,
  invalidCredentialRef,
  credentialStatusMap,
  nullableText,
  parseSecretPayload,
  profileMetadata,
  profileMetadataPatch,
  requireHardDeleteConfirmation,
  secretFormatMap,
  validateSecretValue,
} from "@/lib/server/services/credentials/credential.shared";
import type { CredentialPayload } from "@/lib/server/services/credentials/credential.types";
import { iosCredentialToMetadata } from "@/lib/tracking/mappers/ios";

type ExistingIosCredential = Awaited<ReturnType<typeof import("@/lib/server/repositories/ios/credential.repository").getIosCredentialTarget>>;

const iosSecretTypeMap: Record<string, IosSecretType> = {
  apple_asc_p8: IosSecretType.APPLE_ASC_P8,
  apple_iap_p8: IosSecretType.APPLE_IAP_P8,
  firebase_service_account: IosSecretType.FIREBASE_SERVICE_ACCOUNT,
};

const iosCredentialPurposeMap: Record<string, CredentialPurpose> = {
  apple_asc_p8: CredentialPurpose.REVIEW,
  apple_iap_p8: CredentialPurpose.IAP,
  firebase_service_account: CredentialPurpose.FIREBASE_ADMIN,
};

export async function getIosCredentialConfigs(take = 200) {
  const credentials = await getIosCredentials(take);

  return {
    credentials: credentials.map(iosCredentialToMetadata),
  };
}

export async function getIosCredentialSecret(input: {
  credentialRef: string;
  id: string;
}) {
  if (!input.id && invalidCredentialRef(input.credentialRef)) {
    throw badRequest("Credential id or ref is required.");
  }

  const target = await getIosCredentialTarget(input);
  if (!target) {
    throw notFound("iOS credential was not found.");
  }

  return {
    credentialId: target.id,
    platform: "ios" as const,
    secretText: await getCredentialVaultSecret(target.vaultSecretId),
  };
}

function getIosSecretInput(payload: CredentialPayload) {
  const credentialRef = cleanText(payload.credentialRef);
  const secretType = cleanText(payload.secretType);
  const secretFormatInput = payload.secretFormat ?? defaultFormat(secretType);
  const secretFormat = secretFormatMap[secretFormatInput];
  const credentialPurpose = iosCredentialPurposeMap[secretType];
  const status = credentialStatusMap[cleanText(payload.status).toLowerCase()] ?? credentialStatusMap.active;

  if (invalidCredentialRef(credentialRef)) {
    throw badRequest("Invalid credential ref.");
  }

  if (!secretFormat) {
    throw badRequest("Invalid secret format.");
  }

  if (!credentialPurpose || !iosSecretTypeMap[secretType]) {
    throw badRequest("Invalid iOS secret type.");
  }

  return {
    credentialPurpose,
    credentialRef,
    secretFormat,
    secretFormatInput,
    secretType,
    status,
  };
}

async function persistIosCredentialConfig(input: {
  authEmail: string;
  existingCredential: ExistingIosCredential;
  payload: CredentialPayload;
  secretFormat: SecretFormat;
  secretFormatInput: CredentialPayload["secretFormat"];
  secretText: string;
  secretType: string;
  status: CredentialStatus;
}) {
  const credentialRef = cleanText(input.payload.credentialRef);
  const credentialPurpose = iosCredentialPurposeMap[input.secretType];
  const iosSecretType = iosSecretTypeMap[input.secretType];
  const storeProfileId = cleanText(input.payload.storeProfileId);
  const storeAccountName = nullableText(input.payload.storeAccountName) ?? "";

  if (!storeAccountName) {
    throw badRequest("Store name is required.");
  }

  if (!credentialPurpose || !iosSecretType) {
    throw badRequest("Invalid iOS secret type.");
  }

  if (input.existingCredential && input.existingCredential.credentialPurpose !== credentialPurpose) {
    throw badRequest("Credential type does not match the existing iOS credential.");
  }

  const secretPayload = parseSecretPayload(input.secretText, input.secretFormatInput);
  validateSecretValue(input.secretType, input.secretFormatInput, input.secretText, secretPayload);

  const metadata = inferMetadata(input.payload, secretPayload);
  const credential = await runRepositoryTransaction(async (tx) => {
    const profile = input.existingCredential
      ? await updateIosStoreProfileMetadata(tx, input.existingCredential.storeProfileId, {
          storeAccountName,
          ...profileMetadata(input.payload),
          issuerId: metadata.issuerId,
        })
      : storeProfileId
        ? await updateIosStoreProfileMetadata(tx, storeProfileId, {
            storeAccountName,
            ...profileMetadata(input.payload),
            issuerId: metadata.issuerId,
          })
        : await upsertIosStoreProfile(tx, {
            storeAccountName,
            ...profileMetadata(input.payload),
            issuerId: metadata.issuerId,
          });
    const current = input.existingCredential
      ? {
          id: input.existingCredential.id,
          vaultSecretId: input.existingCredential.vaultSecretId,
          vaultSecretVersion: input.existingCredential.vaultSecretVersion,
        }
      : await getCurrentIosCredentialForStorePurpose(tx, {
          credentialPurpose,
          storeProfileId: profile.id,
        });

    if (input.existingCredential && input.existingCredential.id !== current?.id) {
      throw new CredentialConflictError("Credential ref already exists on another iOS credential.");
    }

    const vaultSecret = await upsertCredentialVaultSecret(tx, {
      credentialRef,
      description: nullableText(input.payload.description),
      existingVaultSecretId: current?.vaultSecretId,
      keyId: metadata.keyId,
      platform: "ios",
      secretCategory: input.secretType,
      secretText: input.secretText,
      storeAccountName,
    });

    const credentialData = {
      storeProfileId: profile.id,
      credentialRef,
      secretType: iosSecretType,
      credentialPurpose,
      secretFormat: input.secretFormat,
      vaultSecretId: vaultSecret.vaultSecretId,
      vaultSecretName: vaultSecret.vaultSecretName,
      vaultSecretVersion: (current?.vaultSecretVersion ?? 0) + 1,
      storeAccountName: profile.storeAccountName,
      linkStore: nullableText(input.payload.linkStore),
      avatarUrl: nullableText(input.payload.avatarUrl),
      keyId: metadata.keyId,
      issuerId: metadata.issuerId,
      clientEmail: metadata.clientEmail,
      projectId: metadata.projectId,
      status: input.status,
      description: nullableText(input.payload.description),
      rotatedBy: input.authEmail,
    };

    if (current) {
      return updateIosCredential(tx, current.id, credentialData);
    }

    return createIosCredential(tx, {
      ...credentialData,
      createdBy: input.authEmail,
    });
  });

  return {
    credential: iosCredentialToMetadata(credential),
    message: `Vault credential ${credentialRef} has been saved.`,
  };
}

export async function saveIosCredentialConfig(payload: CredentialPayload, authEmail: string) {
  const input = getIosSecretInput(payload);
  const secretText = await getSecretFileText(payload);
  const existingCredential = await getIosCredentialTarget({
    id: cleanText(payload.id),
    credentialRef: input.credentialRef,
  });

  try {
    return persistIosCredentialConfig({
      authEmail,
      existingCredential,
      payload,
      secretFormat: input.secretFormat,
      secretFormatInput: input.secretFormatInput,
      secretText,
      secretType: input.secretType,
      status: input.status,
    });
  } catch (error) {
    credentialConflictToApiError(error);
  }
}

async function updateIosCredentialMetadata(input: {
  authEmail: string;
  payload: CredentialPayload;
  target: NonNullable<ExistingIosCredential>;
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
  const iosPatch = {
    ...basePatch,
    keyId: input.payload.keyId === undefined ? undefined : nullableText(input.payload.keyId),
    issuerId: input.payload.issuerId === undefined ? undefined : nullableText(input.payload.issuerId),
  };

  const credential = await runRepositoryTransaction(async (tx) => {
    const profile =
      input.payload.storeAccountName !== undefined ||
      input.payload.linkStore !== undefined ||
      input.payload.avatarUrl !== undefined ||
      input.payload.issuerId !== undefined
        ? await updateIosStoreProfileMetadata(tx, input.target.storeProfileId, {
            ...profileMetadataPatch(input.payload),
            issuerId: input.payload.issuerId === undefined ? undefined : nullableText(input.payload.issuerId),
            storeAccountName: patchStoreAccountName,
          })
        : null;

    return updateIosCredential(
      tx,
      input.target.id,
      profile
        ? {
            ...iosPatch,
            storeAccountName: profile.storeAccountName,
          }
        : iosPatch
    );
  });

  return { credential: iosCredentialToMetadata(credential), message: "Credential metadata updated." };
}

export async function updateIosCredentialConfig(payload: CredentialPayload, authEmail: string) {
  const id = cleanText(payload.id);
  const credentialRef = cleanText(payload.credentialRef);

  if (!id && invalidCredentialRef(credentialRef)) {
    throw badRequest("Credential id or ref is required.");
  }

  const target = await getIosCredentialTarget({ id, credentialRef });
  if (!target) {
    throw notFound("iOS credential was not found.");
  }

  return updateIosCredentialMetadata({ authEmail, payload, target });
}

async function deleteIosCredentialByTarget(input: {
  confirmationName: string;
  target: NonNullable<ExistingIosCredential>;
}) {
  requireHardDeleteConfirmation(input.confirmationName, [input.target]);

  await runRepositoryTransaction(async (tx) => {
    await deleteCredentialVaultSecret(tx, input.target.vaultSecretId);
    await deleteIosCredential(tx, input.target.id);
    await deleteUnusedIosStoreProfile(tx, input.target.storeProfileId);
  });

  return { deleted: input.target.id, message: "Database credential deleted." };
}

async function deleteIosCredentialConfigGroup(input: {
  confirmationName: string;
  ids: string[];
}) {
  const credentials = await getIosCredentialsByIds(input.ids);

  if (credentials.length !== input.ids.length) {
    throw badRequest("One or more credentials were not found.");
  }

  requireHardDeleteConfirmation(input.confirmationName, credentials);

  await runRepositoryTransaction(async (tx) => {
    const storeProfileIds = Array.from(new Set(credentials.map((credential) => credential.storeProfileId)));

    for (const credential of credentials) {
      await deleteCredentialVaultSecret(tx, credential.vaultSecretId);
    }
    await deleteIosCredentialsByIds(tx, input.ids);

    for (const storeProfileId of storeProfileIds) {
      await deleteUnusedIosStoreProfile(tx, storeProfileId);
    }
  });

  return { deleted: input.ids, message: "Credential config group hard deleted." };
}

export async function deleteIosCredentialConfig(payload: CredentialPayload) {
  const id = cleanText(payload.id);
  const ids = Array.isArray(payload.ids) ? Array.from(new Set(payload.ids.map(cleanText).filter(Boolean))) : [];
  const credentialRef = cleanText(payload.credentialRef);
  const confirmationName = cleanText(payload.confirmationName);

  if (!confirmationName) {
    throw badRequest("Confirmation name is required for hard delete.");
  }

  if (ids.length) {
    return deleteIosCredentialConfigGroup({ confirmationName, ids });
  }

  if (!id && invalidCredentialRef(credentialRef)) {
    throw badRequest("Credential id or ref is required.");
  }

  const target = await getIosCredentialTarget({ id, credentialRef });
  if (!target) {
    throw notFound("iOS credential was not found.");
  }

  return deleteIosCredentialByTarget({ confirmationName, target });
}
