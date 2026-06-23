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
