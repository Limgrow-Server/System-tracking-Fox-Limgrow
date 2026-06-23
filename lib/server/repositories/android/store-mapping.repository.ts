import "server-only";

import type { AndroidStoreMapping, MappingStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { upsertAndroidStoreProfile } from "@/lib/server/repositories/android/store-profile.repository";

function isMissingAppIdColumn(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("42703") || message.includes("column") && message.includes("app_id") && message.includes("does not exist");
}

type SaveAndroidStoreMappingInput = {
  appId: string | null;
  appIconUrl: string | null;
  appLink: string | null;
  appName: string;
  id?: string | null;
  packageName: string;
  status: MappingStatus;
  storeAccountName: string;
};

export function getAndroidStoreMappings(options?: { take?: number }) {
  const take = options?.take ?? 200;

  return prisma.androidStoreMapping.findMany({
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
  const profile = await upsertAndroidStoreProfile(tx, {
    storeAccountName: input.storeAccountName,
  });

  const data = {
    appIconUrl: input.appIconUrl,
    appLink: input.appLink,
    appName: input.appName,
    packageName: input.packageName,
    status: input.status,
    storeAccountName: profile.storeAccountName,
    storeProfileId: profile.id,
  };

  async function withAppId(mapping: AndroidStoreMapping) {
    try {
      await tx.$executeRaw`
        UPDATE "android_store_mappings"
        SET "app_id" = ${input.appId}
        WHERE "id" = ${mapping.id}::uuid
      `;
    } catch (error) {
      if (!isMissingAppIdColumn(error)) throw error;
    }
    return { ...mapping, appId: input.appId };
  }

  if (input.id) {
    const mapping = await tx.androidStoreMapping.update({
      where: { id: input.id },
      data,
    });
    return withAppId(mapping);
  }

  const existing = await tx.androidStoreMapping.findFirst({
    where: {
      storeProfileId: profile.id,
      appName: input.appName,
    },
    select: { id: true },
  });

  if (existing) {
    const mapping = await tx.androidStoreMapping.update({
      where: { id: existing.id },
      data,
    });
    return withAppId(mapping);
  }

  const mapping = await tx.androidStoreMapping.create({
    data,
  });
  return withAppId(mapping);
}

export function deleteAndroidStoreMapping(id: string) {
  return prisma.androidStoreMapping.delete({ where: { id } });
}
