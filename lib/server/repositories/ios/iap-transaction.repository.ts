import "server-only";

import { prisma } from "@/lib/prisma";

export function getIosIapTransactions(options?: { take?: number }) {
  return prisma.iosIapTransaction.findMany({
    orderBy: { verifiedAt: "desc" },
    take: options?.take,
  });
}

export function getRecentIosIapTransactions(take = 20) {
  return prisma.iosIapTransaction.findMany({
    orderBy: { verifiedAt: "desc" },
    take,
  });
}
