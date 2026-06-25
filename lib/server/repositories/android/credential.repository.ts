import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type CredentialTargetInput = {
  credentialRef?: string;
  id?: string;
};

export function getAndroidCredentials(take = 160) {
  return prisma.androidCredential.findMany({
    orderBy: { updatedAt: "desc" },
    take,
  });
}

export function getAndroidCredentialsByIds(ids: string[]) {
  return prisma.androidCredential.findMany({
    where: { id: { in: ids } },
  });
}

export async function getAndroidCredentialTarget(input: CredentialTargetInput) {
  if (input.id) {
    return prisma.androidCredential.findUnique({ where: { id: input.id } });
  }

  if (input.credentialRef) {
    return prisma.androidCredential.findUnique({
      where: { credentialRef: input.credentialRef },
    });
  }

  return null;
}

export function getCurrentAndroidCredentialForStoreProfile(
  tx: Prisma.TransactionClient,
  storeProfileId: string
) {
  return tx.androidCredential.findFirst({
    where: { storeProfileId },
    select: { id: true, vaultSecretId: true, vaultSecretVersion: true },
  });
}

export function createAndroidCredential(
  tx: Prisma.TransactionClient,
  data: Prisma.AndroidCredentialUncheckedCreateInput
) {
  return tx.androidCredential.create({ data });
}

export function updateAndroidCredential(
  tx: Prisma.TransactionClient,
  id: string,
  data: Prisma.AndroidCredentialUncheckedUpdateInput
) {
  return tx.androidCredential.update({
    where: { id },
    data,
  });
}

export function deleteAndroidCredential(
  tx: Prisma.TransactionClient,
  id: string
) {
  return tx.androidCredential.delete({ where: { id } });
}

export function deleteAndroidCredentialsByIds(
  tx: Prisma.TransactionClient,
  ids: string[]
) {
  return tx.androidCredential.deleteMany({ where: { id: { in: ids } } });
}
