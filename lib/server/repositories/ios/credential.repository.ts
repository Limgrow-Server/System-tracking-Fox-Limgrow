import "server-only";

import type { CredentialPurpose, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type CredentialTargetInput = {
  credentialRef?: string;
  id?: string;
};

export function getIosCredentials(take = 160) {
  return prisma.iosCredential.findMany({
    orderBy: { updatedAt: "desc" },
    take,
  });
}

export function getIosCredentialsByIds(ids: string[]) {
  return prisma.iosCredential.findMany({
    where: { id: { in: ids } },
  });
}

export async function getIosCredentialTarget(input: CredentialTargetInput) {
  if (input.id) {
    return prisma.iosCredential.findUnique({ where: { id: input.id } });
  }

  if (input.credentialRef) {
    return prisma.iosCredential.findUnique({
      where: { credentialRef: input.credentialRef },
    });
  }

  return null;
}

export function getCurrentIosCredentialForStorePurpose(
  tx: Prisma.TransactionClient,
  input: { credentialPurpose: CredentialPurpose; storeProfileId: string }
) {
  return tx.iosCredential.findFirst({
    where: {
      credentialPurpose: input.credentialPurpose,
      storeProfileId: input.storeProfileId,
    },
    select: { id: true, vaultSecretId: true, vaultSecretVersion: true },
  });
}

export function createIosCredential(
  tx: Prisma.TransactionClient,
  data: Prisma.IosCredentialUncheckedCreateInput
) {
  return tx.iosCredential.create({ data });
}

export function updateIosCredential(
  tx: Prisma.TransactionClient,
  id: string,
  data: Prisma.IosCredentialUncheckedUpdateInput
) {
  return tx.iosCredential.update({
    where: { id },
    data,
  });
}

export function deleteIosCredential(
  tx: Prisma.TransactionClient,
  id: string
) {
  return tx.iosCredential.delete({ where: { id } });
}

export function deleteIosCredentialsByIds(
  tx: Prisma.TransactionClient,
  ids: string[]
) {
  return tx.iosCredential.deleteMany({ where: { id: { in: ids } } });
}
