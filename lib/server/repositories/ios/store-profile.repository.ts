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

export async function updateIosStoreProfileMetadata(
  tx: Prisma.TransactionClient,
  id: string,
  data: IosStoreProfilePatch
) {
  const profile = await tx.iosStoreProfile.update({
    where: { id },
    data,
  });

  if (data.storeAccountName !== undefined) {
    await tx.reviewStoreTarget.updateMany({
      where: { iosStoreProfileId: id },
      data: { storeAccountName: data.storeAccountName },
    });
  }

  return profile;
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
