import "server-only";

import { getIosIapTransactions } from "@/lib/server/repositories/ios/iap-transaction.repository";
import type { IosIapTransaction } from "@prisma/client";

export type IosIapDto = {
  id: string;
  transactionId: string;
  originalTransactionId: string | null;
  productId: string;
  userId: string | null;
  bundleId: string | null;
  purchaseDate: string | null;
  expiresDate: string | null;
  state: string;
  revenueMicros: number | null;
  priceMilliunits: number | null;
  currency: string | null;
  isTrial: boolean | null;
  environment: string;
  rawReceipt: unknown;
  verifiedAt: string;
  createdAt: string;
};

export function iosIapTransactionToDto(tx: IosIapTransaction): IosIapDto {
  return {
    id: tx.id,
    transactionId: tx.transactionId,
    originalTransactionId: tx.originalTransactionId,
    productId: tx.productId,
    userId: tx.userId,
    bundleId: tx.bundleId,
    purchaseDate: tx.purchaseDate ? tx.purchaseDate.toISOString() : null,
    expiresDate: tx.expiresDate ? tx.expiresDate.toISOString() : null,
    state: tx.state,
    revenueMicros: tx.revenueMicros !== null ? Number(tx.revenueMicros) : null,
    priceMilliunits: tx.priceMilliunits !== null ? Number(tx.priceMilliunits) : null,
    currency: tx.currency,
    isTrial: tx.isTrial,
    environment: tx.environment,
    rawReceipt: tx.rawReceipt,
    verifiedAt: tx.verifiedAt.toISOString(),
    createdAt: tx.createdAt.toISOString(),
  };
}

export async function getIosIapDtos(options?: { take?: number }) {
  const transactions = await getIosIapTransactions(options);
  return transactions.map(iosIapTransactionToDto);
}
