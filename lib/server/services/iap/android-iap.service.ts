import "server-only";

import {
  getAndroidIapTransactions,
  getAndroidStoreProfilesWithMappings,
} from "@/lib/server/repositories/android/iap.repository";
import type { IapAndroid, AndroidStoreProfile } from "@prisma/client";

export type IapAndroidRecord = IapAndroid & {
  storeProfile: AndroidStoreProfile | null;
};

export type AndroidAppSummary = {
  id: string;
  appName: string;
  packageName: string;
  appIconUrl: string | null;
  appLink: string | null;
};

export type AndroidStoreProfileSummary = {
  id: string;
  storeAccountName: string;
  avatarUrl: string | null;
  linkStore: string | null;
  apps: AndroidAppSummary[];
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
  rawReceipt: unknown;
  verifiedAt: string;
  createdAt: string;
  updatedAt: string;
  storeAccountName: string | null;
};

export function iapAndroidToDto(tx: IapAndroidRecord): IapAndroidDto {
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
    rawReceipt: tx.rawReceipt,
    verifiedAt: tx.verifiedAt.toISOString(),
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
    storeAccountName: tx.storeProfile?.storeAccountName ?? null,
  };
}

export async function getAndroidIapDtos(options?: { take?: number }) {
  const transactions = await getAndroidIapTransactions(options);
  return transactions.map(iapAndroidToDto);
}

export async function getAndroidStoreProfileSummaries(): Promise<AndroidStoreProfileSummary[]> {
  const profiles = await getAndroidStoreProfilesWithMappings();
  
  return profiles.map((p) => ({
    id: p.id,
    storeAccountName: p.storeAccountName,
    avatarUrl: p.avatarUrl,
    linkStore: p.linkStore,
    apps: p.mappings.map((m) => ({
      id: m.id,
      appName: m.appName,
      packageName: m.packageName,
      appIconUrl: m.appIconUrl,
      appLink: m.appLink,
    })),
  }));
}
