import "server-only";

import type { AndroidStoreProfile, IapAndroid } from "@prisma/client";

export type IapAndroidDeliveryDto = {
  id: string;
  destination: string;
  eventName: string | null;
  status: string;
  attempts?: number | null;
  publishAttempts: number | null;
  deliveryAttempts: number | null;
  maxAttempts: number | null;
  responseStatus: number | null;
  error?: string | null;
  lastError: string | null;
  result?: unknown | null;
  skipReason?: string | null;
  publishedAt?: string | null;
  processingAt?: string | null;
  sentAt?: string | null;
  deliveredAt: string | null;
  updatedAt: string | null;
};

export type IapAndroidRecord = Omit<IapAndroid, "rawReceipt"> & {
  deliveries?: IapAndroidDeliveryDto[] | null;
  rawReceipt?: unknown | null;
  storeProfile: Pick<AndroidStoreProfile, "storeAccountName"> | null;
};

function moneyToMicros(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const unitsValue = record.units;
  const nanosValue = record.nanos;
  const units =
    typeof unitsValue === "string" || typeof unitsValue === "number"
      ? Number(unitsValue)
      : 0;
  const nanos =
    typeof nanosValue === "string" || typeof nanosValue === "number"
      ? Number(nanosValue)
      : 0;

  if (!Number.isFinite(units) || !Number.isFinite(nanos)) return null;
  const micros = Math.round(units * 1_000_000 + nanos / 1_000);
  return Number.isFinite(micros) ? micros : null;
}

function rawReceiptRevenueMicros(rawReceipt: unknown) {
  if (!rawReceipt || typeof rawReceipt !== "object" || Array.isArray(rawReceipt)) {
    return null;
  }

  const receipt = rawReceipt as Record<string, unknown>;
  const lineItems = Array.isArray(receipt.lineItems)
    ? receipt.lineItems
    : [];
  for (const lineItem of lineItems) {
    if (!lineItem || typeof lineItem !== "object" || Array.isArray(lineItem)) {
      continue;
    }
    const item = lineItem as Record<string, unknown>;
    const autoRenewingPlan = item.autoRenewingPlan;
    if (autoRenewingPlan && typeof autoRenewingPlan === "object") {
      const recurringPrice = (autoRenewingPlan as Record<string, unknown>)
        .recurringPrice;
      const micros = moneyToMicros(recurringPrice);
      if (micros !== null && micros > 0) return micros;
    }
  }

  const productLineItems = Array.isArray(receipt.productLineItem)
    ? receipt.productLineItem
    : [];
  for (const productLineItem of productLineItems) {
    if (
      !productLineItem ||
      typeof productLineItem !== "object" ||
      Array.isArray(productLineItem)
    ) {
      continue;
    }
    const offerDetails = (productLineItem as Record<string, unknown>)
      .productOfferDetails;
    if (!offerDetails || typeof offerDetails !== "object") continue;
    const microsValue = (offerDetails as Record<string, unknown>)
      .priceAmountMicros;
    const micros = Number(microsValue);
    if (Number.isFinite(micros) && micros > 0) return micros;
  }

  const legacyMicros = Number(receipt.priceAmountMicros);
  return Number.isFinite(legacyMicros) && legacyMicros > 0
    ? legacyMicros
    : null;
}

function effectiveRevenueMicros(tx: IapAndroidRecord) {
  const stored = tx.revenueMicros === null ? null : Number(tx.revenueMicros);
  if (stored !== null && Number.isFinite(stored) && stored > 0) return stored;
  return rawReceiptRevenueMicros(tx.rawReceipt) ?? stored;
}

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
  deliveries?: IapAndroidDeliveryDto[] | null;
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
    revenueMicros: effectiveRevenueMicros(tx),
    currency: tx.currency,
    regionCode: tx.regionCode,
    basePlanId: tx.basePlanId,
    offerId: tx.offerId,
    isTestPurchase: tx.isTestPurchase,
    deliveries: tx.deliveries ?? null,
    rawReceipt: options?.includeRawReceipt ? tx.rawReceipt : null,
    verifiedAt: tx.verifiedAt.toISOString(),
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
    storeAccountName: tx.storeProfile?.storeAccountName ?? null,
  };
}
