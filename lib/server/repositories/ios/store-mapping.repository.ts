import "server-only";

import type { MappingStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { upsertIosStoreProfile } from "@/lib/server/repositories/ios/store-profile.repository";

type SaveIosStoreMappingInput = {
  appIconUrl: string | null;
  appLink: string | null;
  appName: string;
  bundleId: string;
  id?: string | null;
  status: MappingStatus;
  storeAccountName: string;
};

export function getIosStoreMappings(options?: { take?: number }) {
  const take = options?.take ?? 200;

  return prisma.iosStoreMapping.findMany({
    orderBy: { updatedAt: "desc" },
    take,
  });
}

export async function getIosStoreMappingId(id: string) {
  const mapping = await prisma.iosStoreMapping.findUnique({
    where: { id },
    select: { id: true },
  });

  return mapping?.id ?? null;
}

export async function saveIosStoreMapping(
  tx: Prisma.TransactionClient,
  input: SaveIosStoreMappingInput
) {
  const profile = await upsertIosStoreProfile(tx, {
    storeAccountName: input.storeAccountName,
  });

  const data = {
    appIconUrl: input.appIconUrl,
    appLink: input.appLink,
    appName: input.appName,
    bundleId: input.bundleId,
    status: input.status,
    storeAccountName: profile.storeAccountName,
    storeProfileId: profile.id,
  };

  if (input.id) {
    return tx.iosStoreMapping.update({
      where: { id: input.id },
      data,
    });
  }

  const existing = await tx.iosStoreMapping.findFirst({
    where: {
      appName: input.appName,
      storeProfileId: profile.id,
    },
    select: { id: true },
  });

  if (existing) {
    return tx.iosStoreMapping.update({
      where: { id: existing.id },
      data,
    });
  }

  return tx.iosStoreMapping.create({
    data,
  });
}

export function deleteIosStoreMapping(id: string) {
  return prisma.iosStoreMapping.delete({ where: { id } });
}
