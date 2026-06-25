import "server-only";

import type { Prisma } from "@prisma/client";

type AndroidStoreProfileInput = {
  avatarUrl?: string | null;
  linkStore?: string | null;
  storeAccountName: string;
};

type AndroidStoreProfilePatch = {
  avatarUrl?: string | null;
  linkStore?: string | null;
  storeAccountName?: string;
};

export function upsertAndroidStoreProfile(
  tx: Prisma.TransactionClient,
  input: AndroidStoreProfileInput
) {
  const metadata = {
    avatarUrl: input.avatarUrl,
    linkStore: input.linkStore,
  };

  return tx.androidStoreProfile.upsert({
    where: { storeAccountName: input.storeAccountName },
    update: metadata,
    create: {
      storeAccountName: input.storeAccountName,
      ...metadata,
    },
  });
}

export function updateAndroidStoreProfileMetadata(
  tx: Prisma.TransactionClient,
  id: string,
  data: AndroidStoreProfilePatch
) {
  return tx.androidStoreProfile.update({
    where: { id },
    data,
  });
}

export function deleteUnusedAndroidStoreProfile(
  tx: Prisma.TransactionClient,
  id: string
) {
  return tx.androidStoreProfile.deleteMany({
    where: {
      id,
      credentials: { none: {} },
      mappings: { none: {} },
    },
  });
}
