import "server-only";

import type { IosStoreMapping, MappingStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { upsertIosStoreProfile } from "@/lib/server/repositories/ios/store-profile.repository";

function isMissingAppIdColumn(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("42703") || message.includes("column") && message.includes("app_id") && message.includes("does not exist");
}

type SaveIosStoreMappingInput = {
  appId: string | null;
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

  async function withAppId(mapping: IosStoreMapping) {
    try {
      await tx.$executeRaw`
        UPDATE "ios_store_mappings"
        SET "app_id" = ${input.appId}
        WHERE "id" = ${mapping.id}::uuid
      `;
    } catch (error) {
      if (!isMissingAppIdColumn(error)) throw error;
    }
    return { ...mapping, appId: input.appId };
  }

  if (input.id) {
    const mapping = await tx.iosStoreMapping.update({
      where: { id: input.id },
      data,
    });
    return withAppId(mapping);
  }

  const existing = await tx.iosStoreMapping.findFirst({
    where: {
      storeProfileId: profile.id,
      appName: input.appName,
    },
    select: { id: true },
  });

  if (existing) {
    const mapping = await tx.iosStoreMapping.update({
      where: { id: existing.id },
      data,
    });
    return withAppId(mapping);
  }

  const mapping = await tx.iosStoreMapping.create({
    data,
  });
  return withAppId(mapping);
}

export function deleteIosStoreMapping(id: string) {
  return prisma.iosStoreMapping.delete({ where: { id } });
}
