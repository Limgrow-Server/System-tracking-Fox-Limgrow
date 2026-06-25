import "server-only";

import type { MappingStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { upsertAndroidStoreProfile } from "@/lib/server/repositories/android/store-profile.repository";

type SaveAndroidStoreMappingInput = {
  appId: string | null;
  appIconUrl: string | null;
  appLink: string | null;
  appName: string;
  id?: string | null;
  packageName: string;
  status: MappingStatus;
  storeAccountName: string;
  storeProfileId?: string | null;
};

export function getAndroidStoreMappings(options?: { take?: number }) {
  const take = options?.take ?? 200;

  return prisma.androidStoreMapping.findMany({
    include: {
      storeProfile: {
        select: {
          storeAccountName: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take,
  });
}

export async function getAndroidStoreMappingId(id: string) {
  const mapping = await prisma.androidStoreMapping.findUnique({
    where: { id },
    select: { id: true },
  });

  return mapping?.id ?? null;
}

export async function saveAndroidStoreMapping(
  tx: Prisma.TransactionClient,
  input: SaveAndroidStoreMappingInput
) {
  const profile = input.storeProfileId
    ? {
        id: input.storeProfileId,
        storeAccountName: input.storeAccountName,
      }
    : await upsertAndroidStoreProfile(tx, {
        storeAccountName: input.storeAccountName,
      });

  const data = {
    appId: input.appId,
    appIconUrl: input.appIconUrl,
    appLink: input.appLink,
    appName: input.appName,
    packageName: input.packageName,
    status: input.status,
    storeAccountName: profile.storeAccountName,
    storeProfileId: profile.id,
  };

  if (input.id) {
    return tx.androidStoreMapping.update({
      where: { id: input.id },
      data,
    });
  }

  const existing = await tx.androidStoreMapping.findFirst({
    where: {
      appName: input.appName,
      storeProfileId: profile.id,
    },
    select: { id: true },
  });

  if (existing) {
    return tx.androidStoreMapping.update({
      where: { id: existing.id },
      data,
    });
  }

  return tx.androidStoreMapping.create({
    data,
  });
}

export function deleteAndroidStoreMapping(id: string) {
  return prisma.androidStoreMapping.delete({ where: { id } });
}
