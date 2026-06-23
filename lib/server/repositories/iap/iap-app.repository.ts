import "server-only";
import { prisma } from "@/lib/prisma";

export async function getAllActiveStoreMappings() {
  const [androidMappings, iosMappings] = await Promise.all([
    prisma.androidStoreMapping.findMany({
      where: { status: "ACTIVE" },
    }),
    prisma.iosStoreMapping.findMany({
      where: { status: "ACTIVE" },
    }),
  ]);

  return { androidMappings, iosMappings };
}

export async function getAndroidMappingById(id: string) {
  return prisma.androidStoreMapping.findUnique({
    where: { id },
  });
}

export async function getIosMappingById(id: string) {
  return prisma.iosStoreMapping.findUnique({
    where: { id },
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
