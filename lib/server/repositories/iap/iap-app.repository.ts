import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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
    const contains = { contains: search, mode: "insensitive" as const };
    const searchOr: Prisma.AndroidStoreMappingWhereInput[] = [
      { appName: contains },
      { appId: contains },
      { packageName: contains },
      { storeAccountName: contains },
      { storeProfile: { storeAccountName: contains } },
    ];

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
    const contains = { contains: search, mode: "insensitive" as const };
    const searchOr: Prisma.IosStoreMappingWhereInput[] = [
      { appName: contains },
      { appId: contains },
      { bundleId: contains },
      { storeAccountName: contains },
      { storeProfile: { storeAccountName: contains } },
    ];

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
    const contains = { contains: search, mode: "insensitive" as const };
    where.OR = [
      { orderId: contains },
      { productId: contains },
      { purchaseToken: contains },
      { packageName: contains },
    ];
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
  skip: number;
  state?: string;
  take: number;
  trial?: string;
};

function iosFreeTrialWhere(): Prisma.IosIapTransactionWhereInput {
  return {
    OR: [
      { isTrial: true },
      { offerDiscountType: { equals: "free_trial", mode: "insensitive" } },
      {
        offerType: 1,
        priceMilliunits: BigInt(0),
        revenueMicros: BigInt(0),
      },
    ],
  };
}

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
  const state = options?.state?.trim();
  const trial = options?.trial?.trim();

  if (state && state !== "all") {
    where.state = { equals: state, mode: "insensitive" };
  }

  if (trial === "trial") {
    where.AND = [
      ...(where.AND instanceof Array ? where.AND : []),
      iosFreeTrialWhere(),
    ];
  }

  if (trial === "non_trial") {
    where.AND = [
      ...(where.AND instanceof Array ? where.AND : []),
      { NOT: iosFreeTrialWhere() },
    ];
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

export function getIosTrialAnalyticsTransactions(
  bundleId: string,
  storeProfileId: string | undefined,
) {
  return prisma.iosIapTransaction.findMany({
    where: iosTransactionWhere(bundleId, storeProfileId),
    orderBy: [
      { originalTransactionId: "asc" },
      { purchaseDate: "asc" },
      { verifiedAt: "asc" },
    ],
  });
}

export function getIosIapNotificationEventsByBundleId(
  bundleId: string,
  storeProfileId: string | undefined,
  take = 8,
) {
  return prisma.iosIapNotificationEvent.findMany({
    where: {
      bundleId,
      ...(storeProfileId ? { storeProfileId } : {}),
    },
    orderBy: { receivedAt: "desc" },
    take,
  });
}

export async function getIosIapNotificationEventSummaryByBundleId(
  bundleId: string,
  storeProfileId: string | undefined,
) {
  const where: Prisma.IosIapNotificationEventWhereInput = {
    bundleId,
    ...(storeProfileId ? { storeProfileId } : {}),
  };
  const [counts, latest] = await Promise.all([
    prisma.iosIapNotificationEvent.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.iosIapNotificationEvent.findFirst({
      where,
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true },
    }),
  ]);

  return { counts, latest };
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
