import "server-only";

import type { Prisma } from "@prisma/client";

type IosStoreProfileInput = {
  avatarUrl?: string | null;
  issuerId?: string | null;
  linkStore?: string | null;
  storeAccountName: string;
  supabaseUserId?: string | null;
};

type IosStoreProfilePatch = {
  avatarUrl?: string | null;
  issuerId?: string | null;
  linkStore?: string | null;
  storeAccountName?: string;
  supabaseUserId?: string | null;
};

export function upsertIosStoreProfile(
  tx: Prisma.TransactionClient,
  input: IosStoreProfileInput
) {
  const metadata = {
    avatarUrl: input.avatarUrl,
    linkStore: input.linkStore,
    supabaseUserId: input.supabaseUserId,
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
