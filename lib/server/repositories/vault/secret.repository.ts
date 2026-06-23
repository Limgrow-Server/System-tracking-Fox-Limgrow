import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import {
  deleteVaultSecret,
  getVaultSecret,
  upsertVaultSecret,
} from "@/lib/security/supabase-vault";

type VaultUpsertInput = Parameters<typeof upsertVaultSecret>[1];
type VaultClient = Prisma.TransactionClient;

export function getCredentialVaultSecret(vaultSecretId: string | null) {
  return getVaultSecret(prisma, vaultSecretId);
}

export function upsertCredentialVaultSecret(client: VaultClient, input: VaultUpsertInput) {
  return upsertVaultSecret(client, input);
}

export function deleteCredentialVaultSecret(client: VaultClient, vaultSecretId: string | null) {
  return deleteVaultSecret(client, vaultSecretId);
}
