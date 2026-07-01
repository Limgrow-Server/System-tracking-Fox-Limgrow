import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { searchTextVariants } from "@/lib/search";

type IapAppMappingOptions = {
  search?: string;
  storeAccountName?: string;
};

function androidMappingWhere(
  options?: IapAppMappingOptions,
): Prisma.AndroidStoreMappingWhereInput {
  const where: Prisma.AndroidStoreMappingWhereInput = { status: "ACTIVE" };
  const search = options?.search?.trim();
  const storeAccountName = options?.storeAccountName?.trim();

  if (storeAccountName) {
    where.OR = [
      { storeAccountName: { equals: storeAccountName, mode: "insensitive" } },
      {
        storeProfile: {
          storeAccountName: { equals: storeAccountName, mode: "insensitive" },
        },
      },
    ];
  }

  if (search) {
    const searchOr: Prisma.AndroidStoreMappingWhereInput[] = searchTextVariants(search).flatMap((variant) => {
      const contains = { contains: variant, mode: "insensitive" as const };

      return [
        { appName: contains },
        { appId: contains },
        { packageName: contains },
        { storeAccountName: contains },
        { storeProfile: { storeAccountName: contains } },
      ];
    });

    where.AND = [...(where.AND instanceof Array ? where.AND : []), { OR: searchOr }];
  }

  return where;
}

function iosMappingWhere(
  options?: IapAppMappingOptions,
): Prisma.IosStoreMappingWhereInput {
  const where: Prisma.IosStoreMappingWhereInput = { status: "ACTIVE" };
  const search = options?.search?.trim();
  const storeAccountName = options?.storeAccountName?.trim();

  if (storeAccountName) {
    where.OR = [
      { storeAccountName: { equals: storeAccountName, mode: "insensitive" } },
      {
        storeProfile: {
          storeAccountName: { equals: storeAccountName, mode: "insensitive" },
        },
      },
    ];
  }

  if (search) {
    const searchOr: Prisma.IosStoreMappingWhereInput[] = searchTextVariants(search).flatMap((variant) => {
      const contains = { contains: variant, mode: "insensitive" as const };

      return [
        { appName: contains },
        { appId: contains },
        { bundleId: contains },
        { storeAccountName: contains },
        { storeProfile: { storeAccountName: contains } },
      ];
    });

    where.AND = [...(where.AND instanceof Array ? where.AND : []), { OR: searchOr }];
  }

  return where;
}

export async function getAllActiveStoreMappings(options?: IapAppMappingOptions) {
  const [androidMappings, iosMappings] = await Promise.all([
    prisma.androidStoreMapping.findMany({
      where: androidMappingWhere(options),
      include: {
        storeProfile: {
          select: { storeAccountName: true },
        },
      },
      orderBy: { appName: "asc" },
    }),
    prisma.iosStoreMapping.findMany({
      where: iosMappingWhere(options),
      include: {
        storeProfile: {
          select: { storeAccountName: true },
        },
      },
      orderBy: { appName: "asc" },
    }),
  ]);

  return { androidMappings, iosMappings };
}

export async function getAndroidMappingById(id: string) {
  return prisma.androidStoreMapping.findUnique({
    where: { id },
    include: {
      storeProfile: {
        select: { storeAccountName: true },
      },
    },
  });
}

export async function getIosMappingById(id: string) {
  return prisma.iosStoreMapping.findUnique({
    where: { id },
    include: {
      storeProfile: {
        select: { storeAccountName: true },
      },
    },
  });
}

export async function getAndroidTransactionsByPackageAndProfile(packageName: string, storeProfileId: string) {
  return prisma.iapAndroid.findMany({
    where: { packageName, storeProfileId },
    orderBy: { verifiedAt: "desc" },
    take: 300,
    include: {
      storeProfile: true,
    },
  });
}

type AndroidTransactionPageOptions = {
  kind?: string;
  page: number;
  pageSize: number;
  search?: string;
  skip: number;
  state?: string;
  take: number;
};

function androidTransactionWhere(
  packageName: string,
  storeProfileId: string,
  options?: Partial<AndroidTransactionPageOptions>,
): Prisma.IapAndroidWhereInput {
  const where: Prisma.IapAndroidWhereInput = { packageName, storeProfileId };
  const search = options?.search?.trim();
  const state = options?.state?.trim();
  const kind = options?.kind?.trim();

  if (search) {
    where.OR = searchTextVariants(search).flatMap((variant) => {
      const contains = { contains: variant, mode: "insensitive" as const };

      return [
        { orderId: contains },
        { productId: contains },
        { purchaseToken: contains },
        { packageName: contains },
      ];
    });
  }

  if (state && state !== "all") {
    where.state = { equals: state, mode: "insensitive" };
  }

  if (kind && kind !== "all") {
    where.purchaseKind = { equals: kind, mode: "insensitive" };
  }

  return where;
}

export async function getAndroidTransactionsByPackageAndProfilePage(
  packageName: string,
  storeProfileId: string,
  options: AndroidTransactionPageOptions,
) {
  const where = androidTransactionWhere(packageName, storeProfileId, options);

  return prisma.$transaction([
    prisma.iapAndroid.findMany({
      where,
      orderBy: { verifiedAt: "desc" },
      skip: options.skip,
      take: options.take,
      include: {
        storeProfile: true,
      },
    }),
    prisma.iapAndroid.count({ where }),
  ]);
}

export function getAndroidTransactionsByPackageAndProfileMetrics(
  packageName: string,
  storeProfileId: string,
  options: Partial<AndroidTransactionPageOptions>,
) {
  return prisma.iapAndroid.findMany({
    where: androidTransactionWhere(packageName, storeProfileId, options),
    orderBy: { verifiedAt: "desc" },
    include: {
      storeProfile: true,
    },
  });
}

export async function getAndroidTransactionStatesByPackageAndProfile(
  packageName: string,
  storeProfileId: string,
) {
  const rows = await prisma.iapAndroid.groupBy({
    by: ["state"],
    where: androidTransactionWhere(packageName, storeProfileId),
    orderBy: { state: "asc" },
  });

  return rows.map((row) => row.state);
}

export async function getIosTransactionsByBundleId(
  bundleId: string,
  storeProfileId?: string,
) {
  return prisma.iosIapTransaction.findMany({
    where: {
      bundleId,
      ...(storeProfileId
        ? { OR: [{ storeProfileId }, { storeProfileId: null }] }
        : {}),
    },
    orderBy: { verifiedAt: "desc" },
    take: 300,
  });
}

type IosTransactionPageOptions = {
  page: number;
  pageSize: number;
  search?: string;
  skip: number;
  state?: string;
  take: number;
};

function iosTransactionWhere(
  bundleId: string,
  storeProfileId?: string,
  options?: Partial<IosTransactionPageOptions>,
): Prisma.IosIapTransactionWhereInput {
  const where: Prisma.IosIapTransactionWhereInput = {
    bundleId,
    ...(storeProfileId
      ? { OR: [{ storeProfileId }, { storeProfileId: null }] }
      : {}),
  };
  const search = options?.search?.trim();
  const state = options?.state?.trim();

  if (search) {
    const searchOr: Prisma.IosIapTransactionWhereInput[] = searchTextVariants(search).flatMap((variant) => {
      const contains = { contains: variant, mode: "insensitive" as const };

      return [
        { transactionId: contains },
        { originalTransactionId: contains },
        { productId: contains },
        { bundleId: contains },
        { userId: contains },
      ];
    });

    where.AND = [
      ...(where.AND instanceof Array ? where.AND : []),
      { OR: searchOr },
    ];
  }

  if (state && state !== "all") {
    where.state = { equals: state, mode: "insensitive" };
  }

  return where;
}

export async function getIosTransactionsByBundleIdPage(
  bundleId: string,
  storeProfileId: string | undefined,
  options: IosTransactionPageOptions,
) {
  const where = iosTransactionWhere(bundleId, storeProfileId, options);

  return prisma.$transaction([
    prisma.iosIapTransaction.findMany({
      where,
      orderBy: { verifiedAt: "desc" },
      skip: options.skip,
      take: options.take,
    }),
    prisma.iosIapTransaction.count({ where }),
  ]);
}

export function getIosTransactionsByBundleIdMetrics(
  bundleId: string,
  storeProfileId: string | undefined,
  options: Partial<IosTransactionPageOptions>,
) {
  return prisma.iosIapTransaction.findMany({
    where: iosTransactionWhere(bundleId, storeProfileId, options),
    orderBy: { verifiedAt: "desc" },
  });
}

export async function getIosTransactionStatesByBundleId(
  bundleId: string,
  storeProfileId?: string,
) {
  const rows = await prisma.iosIapTransaction.groupBy({
    by: ["state"],
    where: iosTransactionWhere(bundleId, storeProfileId),
    orderBy: { state: "asc" },
  });

  return rows.map((row) => row.state);
}
