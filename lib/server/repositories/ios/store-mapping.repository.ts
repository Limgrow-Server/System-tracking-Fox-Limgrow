import "server-only";

import type { MappingStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { upsertIosStoreProfile } from "@/lib/server/repositories/ios/store-profile.repository";
import { searchTextVariants } from "@/lib/search";
import {
  nullableAppId,
  parseAppleAppStoreIdFromUrl,
} from "@/lib/tracking/identity";

type SaveIosStoreMappingInput = {
  appId: string | null;
  appIconUrl: string | null;
  appLink: string | null;
  appName: string;
  bundleId: string;
  firebaseAnalyticsApiSecret?: string | null;
  firebaseAppId: string | null;
  id?: string | null;
  status: MappingStatus;
  storeAccountName: string;
  storeProfileId?: string | null;
};

export function getIosStoreMappings(options?: { take?: number }) {
  const take = options?.take ?? 200;

  return prisma.iosStoreMapping.findMany({
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

type IosStoreMappingPageOptions = {
  includeTotal?: boolean;
  search?: string;
  skip: number;
  storeProfileId?: string;
  take: number;
};

function iosStoreMappingWhere(options: IosStoreMappingPageOptions): Prisma.IosStoreMappingWhereInput {
  const where: Prisma.IosStoreMappingWhereInput = {};
  const search = options.search?.trim();

  if (options.storeProfileId) {
    where.storeProfileId = options.storeProfileId;
  }

  if (search) {
    where.OR = searchTextVariants(search).flatMap((variant) => {
      const contains = { contains: variant, mode: "insensitive" as const };

      return [
        { appName: contains },
        { appId: contains },
        { bundleId: contains },
        { firebaseAppId: contains },
        { storeAccountName: contains },
        { storeProfile: { storeAccountName: contains } },
      ];
    });
  }

  return where;
}

export function getIosStoreMappingsPage(options: IosStoreMappingPageOptions) {
  const where = iosStoreMappingWhere(options);
  const rows = prisma.iosStoreMapping.findMany({
    where,
    include: {
      storeProfile: {
        select: {
          storeAccountName: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    skip: options.skip,
    take: options.take,
  });

  if (options.includeTotal === false) {
    return rows.then((mappings) => [mappings, null] as const);
  }

  return prisma.$transaction([
    rows,
    prisma.iosStoreMapping.count({ where }),
  ]);
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
  const profile = input.storeProfileId
    ? {
        id: input.storeProfileId,
        storeAccountName: input.storeAccountName,
      }
    : await upsertIosStoreProfile(tx, {
        storeAccountName: input.storeAccountName,
      });

  const appleAppId = parseAppleAppStoreIdFromUrl(input.appLink);
  const data = {
    appId: nullableAppId(input.appId),
    appIconUrl: input.appIconUrl,
    appLink: input.appLink,
    appName: input.appName,
    bundleId: input.bundleId,
    firebaseAppId: input.firebaseAppId,
    status: input.status,
    storeAccountName: profile.storeAccountName,
    storeProfileId: profile.id,
    ...(input.firebaseAnalyticsApiSecret !== undefined
      ? { firebaseAnalyticsApiSecret: input.firebaseAnalyticsApiSecret }
      : {}),
    ...(appleAppId ? { appleAppId } : {}),
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

export async function getIosStoreMappingGa4Config(input: {
  bundleId: string;
  storeProfileId?: string | null;
}) {
  const select = {
    firebaseAnalyticsApiSecret: true,
    firebaseAppId: true,
  } satisfies Prisma.IosStoreMappingSelect;

  if (input.storeProfileId) {
    const exact = await prisma.iosStoreMapping.findFirst({
      where: {
        bundleId: input.bundleId,
        storeProfileId: input.storeProfileId,
      },
      select,
    });

    if (exact) return exact;
  }

  return prisma.iosStoreMapping.findFirst({
    where: { bundleId: input.bundleId },
    select,
  });
}
