import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type RepositoryTransaction = Prisma.TransactionClient;

export function runRepositoryTransaction<T>(
  callback: (tx: RepositoryTransaction) => Promise<T>
) {
  return prisma.$transaction(callback);
}
