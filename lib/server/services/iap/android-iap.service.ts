import "server-only";

import type {
  AndroidIapDeliveryJob,
  AndroidStoreProfile,
  IapAndroid,
} from "@prisma/client";
import type { IapOutboundDeliveryDto } from "@/lib/tracking/types";

type IapAndroidListField =
  | "acknowledged"
  | "autoRenewing"
  | "basePlanId"
  | "consumed"
  | "createdAt"
  | "currency"
  | "expiresDate"
  | "id"
  | "isTestPurchase"
  | "linkedPurchaseToken"
  | "offerId"
  | "orderId"
  | "packageName"
  | "productId"
  | "purchaseDate"
  | "purchaseKind"
  | "purchaseToken"
  | "regionCode"
  | "revenueMicros"
  | "state"
  | "storeProfileId"
  | "updatedAt"
  | "verifiedAt";

type IapAndroidTrackingField =
  | "hadFreeTrial"
  | "ingestionSource"
  | "isTrial"
  | "lastNotificationAt"
  | "offerPhase"
  | "trialEndsAt"
  | "trialStartedAt";

type AndroidDeliveryListField =
  | "deliveredAt"
  | "deliveryAttempts"
  | "destination"
  | "eventName"
  | "id"
  | "lastError"
  | "lockedAt"
  | "maxAttempts"
  | "publishAttempts"
  | "publishedAt"
  | "responseStatus"
  | "result"
  | "status"
  | "updatedAt";

type AndroidDeliveryRecord = Pick<
  AndroidIapDeliveryJob,
  AndroidDeliveryListField
>;

export type IapAndroidRecord = Pick<IapAndroid, IapAndroidListField> &
  Partial<Pick<IapAndroid, IapAndroidTrackingField>> & {
    deliveries?: IapOutboundDeliveryDto[] | null;
    lifecycleEvents?: Array<{
      deliveryJobs: AndroidDeliveryRecord[];
      eventType: string;
    }> | null;
    rawReceipt?: unknown | null;
    storeProfile: Pick<AndroidStoreProfile, "storeAccountName"> | null;
  };

function skipReason(result: unknown) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return null;
  const record = result as Record<string, unknown>;
  const provider =
    record.provider &&
    typeof record.provider === "object" &&
    !Array.isArray(record.provider)
      ? (record.provider as Record<string, unknown>)
      : {};
  const reason = record.reason ?? provider.reason;
  return typeof reason === "string" ? reason : null;
}

function deliveryToDto(job: AndroidDeliveryRecord): IapOutboundDeliveryDto {
  return {
    attempts: job.deliveryAttempts,
    deliveredAt: job.deliveredAt?.toISOString() ?? null,
    deliveryAttempts: job.deliveryAttempts,
    destination: job.destination,
    error: job.lastError,
    eventName: job.eventName,
    id: job.id,
    lastError: job.lastError,
    maxAttempts: job.maxAttempts,
    processingAt: job.lockedAt?.toISOString() ?? null,
    publishAttempts: job.publishAttempts,
    publishedAt: job.publishedAt?.toISOString() ?? null,
    responseStatus: job.responseStatus,
    sentAt: job.deliveredAt?.toISOString() ?? null,
    skipReason: skipReason(job.result),
    status: job.status,
    updatedAt: job.updatedAt.toISOString(),
  };
}

function trialConversionStatus(tx: IapAndroidRecord) {
  const state = tx.state.trim().toLowerCase();
  if (state === "in_grace_period" || state === "grace_period") {
    return "grace_period";
  }
  if (state === "on_hold" || state === "account_hold") return "account_hold";
  if (state === "canceled" || state === "cancelled") return "canceled";
  if (["expired", "revoked", "refunded"].includes(state)) return "expired";
  if (tx.isTrial) return "trial_active";
  if (
    tx.lifecycleEvents?.some(
      (event) => event.eventType === "trial_converted",
    ) ||
    (tx.hadFreeTrial && Number(tx.revenueMicros ?? 0) > 0)
  ) {
    return "converted_to_paid";
  }
  return null;
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
  ingestionSource?: string | null;
  billingPhase?: string | null;
  offerPhase?: string | null;
  isTrial?: boolean | null;
  hadFreeTrial?: boolean | null;
  trialStartedAt?: string | null;
  trialEndsAt?: string | null;
  trialConversionStatus?: string | null;
  lastRtdnEventAt?: string | null;
  lastNotificationAt?: string | null;
  deliveries?: IapOutboundDeliveryDto[] | null;
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
  const deliveries =
    tx.deliveries ??
    tx.lifecycleEvents?.flatMap((event) =>
      event.deliveryJobs.map(deliveryToDto),
    ) ??
    null;
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
    ingestionSource: tx.ingestionSource ?? null,
    billingPhase: tx.offerPhase ?? null,
    offerPhase: tx.offerPhase ?? null,
    isTrial: tx.isTrial ?? null,
    hadFreeTrial: tx.hadFreeTrial ?? null,
    trialStartedAt: tx.trialStartedAt?.toISOString() ?? null,
    trialEndsAt: tx.trialEndsAt?.toISOString() ?? null,
    trialConversionStatus: trialConversionStatus(tx),
    lastRtdnEventAt: tx.lastNotificationAt?.toISOString() ?? null,
    lastNotificationAt: tx.lastNotificationAt?.toISOString() ?? null,
    deliveries,
    rawReceipt: options?.includeRawReceipt ? tx.rawReceipt : null,
    verifiedAt: tx.verifiedAt.toISOString(),
    createdAt: tx.createdAt.toISOString(),
    updatedAt: tx.updatedAt.toISOString(),
    storeAccountName: tx.storeProfile?.storeAccountName ?? null,
  };
}
