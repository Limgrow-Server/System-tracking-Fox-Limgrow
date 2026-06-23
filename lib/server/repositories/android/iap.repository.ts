import "server-only";
import { prisma } from "@/lib/prisma";

export function getAndroidIapTransactions(options?: { take?: number }) {
  const take = options?.take ?? 200;

  return prisma.iapAndroid.findMany({
    orderBy: { verifiedAt: "desc" },
    take,
    include: {
      storeProfile: true,
    },
  });
}

export function getAndroidStoreProfilesWithMappings() {
  return prisma.androidStoreProfile.findMany({
    where: { status: "ACTIVE" },
    orderBy: { storeAccountName: "asc" },
    include: {
      mappings: {
        where: { status: "ACTIVE" },
        orderBy: { appName: "asc" },
        select: {
          id: true,
          appName: true,
          packageName: true,
          appIconUrl: true,
          appLink: true,
        },
      },
    },
  });
}
