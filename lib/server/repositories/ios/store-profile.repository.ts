import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type IosStoreProfileInput = {
  avatarUrl?: string | null;
  issuerId?: string | null;
  linkStore?: string | null;
  storeAccountName: string;
};

type IosStoreProfilePatch = {
  avatarUrl?: string | null;
  issuerId?: string | null;
  linkStore?: string | null;
  storeAccountName?: string;
};

export function upsertIosStoreProfile(
  tx: Prisma.TransactionClient,
  input: IosStoreProfileInput
) {
  const metadata = {
    avatarUrl: input.avatarUrl,
    linkStore: input.linkStore,
  };
  const updateData = input.issuerId ? { ...metadata, issuerId: input.issuerId } : metadata;

  return tx.iosStoreProfile.upsert({
    where: { storeAccountName: input.storeAccountName },
    update: updateData,
    create: {
      storeAccountName: input.storeAccountName,
      ...metadata,
      issuerId: input.issuerId,
    },
  });
}

export function getIosStoreProfileById(id: string) {
  return prisma.iosStoreProfile.findUnique({
    where: { id },
    select: {
      id: true,
      storeAccountName: true,
    },
  });
}

export function updateIosStoreProfileMetadata(
  tx: Prisma.TransactionClient,
  id: string,
  data: IosStoreProfilePatch
) {
  return tx.iosStoreProfile.update({
    where: { id },
    data,
  });
}

export function deleteUnusedIosStoreProfile(
  tx: Prisma.TransactionClient,
  id: string
) {
  return tx.iosStoreProfile.deleteMany({
    where: {
      id,
      credentials: { none: {} },
      mappings: { none: {} },
    },
  });
}
