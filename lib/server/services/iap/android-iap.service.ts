import "server-only";

import type { AndroidStoreProfile, IapAndroid } from "@prisma/client";

export type IapAndroidRecord = Omit<IapAndroid, "rawReceipt"> & {
  rawReceipt?: unknown | null;
  storeProfile: Pick<AndroidStoreProfile, "storeAccountName"> | null;
};

export type IapAndroidDto = {
  id: string;
  storeProfileId: string | null;
  packageName: string;
  productId: string;
  purchaseKind: string;
  purchaseToken: string;
  orderId: string | null;
  linkedPurchaseToken: string | null;
  state: string;
  acknowledged: boolean;
  consumed: boolean | null;
  autoRenewing: boolean | null;
  purchaseDate: string | null;
  expiresDate: string | null;
  revenueMicros: number | null;
  currency: string | null;
  regionCode: string | null;
  basePlanId: string | null;
  offerId: string | null;
  isTestPurchase: boolean;
  rawReceipt: unknown | null;
  verifiedAt: string;
  createdAt: string;
  updatedAt: string;
  storeAccountName: string | null;
};

export function iapAndroidToDto(
  tx: IapAndroidRecord,
  options?: { includeRawReceipt?: boolean },
): IapAndroidDto {
  return {
    id: tx.id,
    storeProfileId: tx.storeProfileId,
    packageName: tx.packageName,
    productId: tx.productId,
    purchaseKind: tx.purchaseKind,
    purchaseToken: tx.purchaseToken,
    orderId: tx.orderId,
    linkedPurchaseToken: tx.linkedPurchaseToken,
    state: tx.state,
    acknowledged: tx.acknowledged,
    consumed: tx.consumed,
    autoRenewing: tx.autoRenewing,
    purchaseDate: tx.purchaseDate ? tx.purchaseDate.toISOString() : null,
    expiresDate: tx.expiresDate ? tx.expiresDate.toISOString() : null,
    revenueMicros: tx.revenueMicros !== null ? Number(tx.revenueMicros) : null,
    currency: tx.currency,
    regionCode: tx.regionCode,
    basePlanId: tx.basePlanId,
    offerId: tx.offerId,
    isTestPurchase: tx.isTestPurchase,
    rawReceipt: options?.includeRawReceipt ? tx.rawReceipt : null,
    verifiedAt: tx.verifiedAt.toISOString(),
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
    storeAccountName: tx.storeProfile?.storeAccountName ?? null,
  };
}
