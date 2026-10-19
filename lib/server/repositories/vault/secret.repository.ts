import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { deleteSecret, getSecret, upsertSecret } from "@/lib/security/postgres-secrets";

type VaultUpsertInput = Parameters<typeof upsertSecret>[1];
type VaultClient = Prisma.TransactionClient;

export function getCredentialVaultSecret(vaultSecretId: string | null) {
  return getSecret(prisma, vaultSecretId);
}

export function upsertCredentialVaultSecret(client: VaultClient, input: VaultUpsertInput) {
  return upsertSecret(client, input);
}

export function deleteCredentialVaultSecret(client: VaultClient, vaultSecretId: string | null) {
  return deleteSecret(client, vaultSecretId);
}
