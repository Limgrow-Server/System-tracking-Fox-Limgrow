import "server-only";

import { CredentialStatus, type MappingStatus, type Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { upsertAndroidStoreProfile } from "@/lib/server/repositories/android/store-profile.repository";
import { searchTextVariants } from "@/lib/search";
import { nullableAppId } from "@/lib/tracking/identity";

type SaveAndroidStoreMappingInput = {
  appId: string | null;
  appIconUrl: string | null;
  appLink: string | null;
  adjustAppToken: string | null;
  adjustEventToken: string | null;
  adjustTrialStartedEventToken: string | null;
  firebaseAnalyticsApiSecret?: string | null;
  firebaseAppId: string | null;
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

type AndroidStoreMappingPageOptions = {
  includeTotal?: boolean;
  search?: string;
  skip: number;
  storeProfileId?: string;
  take: number;
};

function androidStoreMappingWhere(options: AndroidStoreMappingPageOptions): Prisma.AndroidStoreMappingWhereInput {
  const where: Prisma.AndroidStoreMappingWhereInput = {};
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
        { adjustAppToken: contains },
        { adjustEventToken: contains },
        { adjustTrialStartedEventToken: contains },
        { firebaseAppId: contains },
        { packageName: contains },
        { storeAccountName: contains },
        { storeProfile: { storeAccountName: contains } },
      ];
    });
  }

  return where;
}

export function getAndroidStoreMappingsPage(options: AndroidStoreMappingPageOptions) {
  const where = androidStoreMappingWhere(options);
  const rows = prisma.androidStoreMapping.findMany({
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
    prisma.androidStoreMapping.count({ where }),
  ]);
}

export async function getAndroidStoreMappingId(id: string) {
  const mapping = await prisma.androidStoreMapping.findUnique({
    where: { id },
    select: { id: true },
  });

  return mapping?.id ?? null;
}

export function getAndroidStoreMappingFirebaseAnalyticsSecret(id: string) {
  return prisma.androidStoreMapping.findUnique({
    where: { id },
    select: {
      firebaseAnalyticsApiSecret: true,
      id: true,
    },
  });
}

export function getAndroidStoreMappingForListingUpload(id: string) {
  return prisma.androidStoreMapping.findUnique({
    where: { id },
    include: {
      storeProfile: {
        include: {
          credentials: {
            where: { status: CredentialStatus.ACTIVE },
            orderBy: { updatedAt: "desc" },
            take: 1,
          },
        },
      },
    },
  });
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
    appId: nullableAppId(input.appId),
    appIconUrl: input.appIconUrl,
    appLink: input.appLink,
    adjustAppToken: input.adjustAppToken,
    adjustEventToken: input.adjustEventToken,
    adjustTrialStartedEventToken: input.adjustTrialStartedEventToken,
    firebaseAppId: input.firebaseAppId,
    appName: input.appName,
    packageName: input.packageName,
    status: input.status,
    storeAccountName: profile.storeAccountName,
    storeProfileId: profile.id,
    ...(input.firebaseAnalyticsApiSecret !== undefined
      ? { firebaseAnalyticsApiSecret: input.firebaseAnalyticsApiSecret }
      : {}),
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

export async function deleteAndroidStoreMapping(id: string) {
  const [rtdnEvents, orders, lifecycleEvents] = await prisma.$transaction([
    prisma.androidIapRtdnEvent.count({ where: { storeMappingId: id } }),
    prisma.androidIapOrder.count({ where: { storeMappingId: id } }),
    prisma.androidIapLifecycleEvent.count({ where: { storeMappingId: id } }),
  ]);
  if (rtdnEvents + orders + lifecycleEvents > 0) {
    await prisma.androidStoreMapping.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });
    return { archived: true };
  }
  await prisma.androidStoreMapping.delete({ where: { id } });
  return { archived: false };
}
