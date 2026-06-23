import "server-only";

import { prisma } from "@/lib/prisma";

export function getRecentIosIapTransactions(take = 20) {
  return prisma.iosIapTransaction.findMany({
    orderBy: { verifiedAt: "desc" },
    take,
  });
}
