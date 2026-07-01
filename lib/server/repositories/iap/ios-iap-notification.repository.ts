import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type IosIapNotificationEventInput = {
  appAppleId: string | null;
  bundleId: string | null;
  decodedPayload?: Prisma.InputJsonValue | null;
  environment: string | null;
  notificationType: string;
  notificationUuid: string;
  originalTransactionId?: string | null;
  rawPayload: Prisma.InputJsonValue;
  signedDate?: Date | null;
  status?: string;
  storeProfileId?: string | null;
  subtype?: string | null;
  transactionId?: string | null;
};

export type IosIapTransactionWebhookInput = {
  appTransactionId?: string | null;
  billingPlanType?: string | null;
  bundleId?: string | null;
  currency?: string | null;
  environment: string;
  expiresDate?: Date | null;
  isTrial?: boolean | null;
  offerDiscountType?: string | null;
  offerPeriod?: string | null;
  offerType?: number | null;
  originalTransactionId?: string | null;
  priceMilliunits?: bigint | null;
  productId: string;
  purchaseDate?: Date | null;
  rawReceipt: Prisma.InputJsonValue;
  revenueMicros?: bigint | null;
  revocationDate?: Date | null;
  revocationPercentage?: number | null;
  revocationReason?: number | null;
  revocationType?: string | null;
  state: string;
  storefront?: string | null;
  storefrontId?: string | null;
  storeProfileId?: string | null;
  subscriptionGroupId?: string | null;
  transactionId: string;
  transactionReason?: string | null;
  userId?: string | null;
  verifiedAt: Date;
  webOrderLineItemId?: string | null;
};

function duplicateTarget(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function getIosStoreMappingForNotification(input: {
  appAppleId?: string | null;
  bundleId: string;
}) {
  const conditions: Prisma.IosStoreMappingWhereInput[] = [
    { bundleId: input.bundleId },
  ];

  if (input.appAppleId) {
    conditions.push({ appleAppId: input.appAppleId });
  }

  return prisma.iosStoreMapping.findFirst({
    where: {
      OR: conditions,
      status: "ACTIVE",
    },
    include: {
      storeProfile: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function reserveIosIapNotificationEvent(
  input: IosIapNotificationEventInput,
) {
  const data = {
    appAppleId: input.appAppleId,
    bundleId: input.bundleId,
    decodedPayload: input.decodedPayload ?? undefined,
    environment: input.environment,
    notificationType: input.notificationType,
    notificationUuid: input.notificationUuid,
    originalTransactionId: input.originalTransactionId ?? null,
    rawPayload: input.rawPayload,
    signedDate: input.signedDate ?? null,
    status: input.status ?? "processing",
    storeProfileId: input.storeProfileId ?? null,
    subtype: input.subtype ?? null,
    transactionId: input.transactionId ?? null,
  };

  try {
    const event = await prisma.iosIapNotificationEvent.create({ data });
    return { event, shouldProcess: true };
  } catch (error) {
    if (!duplicateTarget(error)) throw error;

    const existing = await prisma.iosIapNotificationEvent.findUnique({
      where: { notificationUuid: input.notificationUuid },
    });

    if (!existing) throw error;

    if (existing.status !== "failed") {
      return { event: existing, shouldProcess: false };
    }

    const event = await prisma.iosIapNotificationEvent.update({
      where: { id: existing.id },
      data: {
        ...data,
        errorMessage: null,
        processedAt: null,
        status: "processing",
      },
    });
    return { event, shouldProcess: true };
  }
}

export function markIosIapNotificationEventProcessed(
  eventId: string,
  input: {
    decodedPayload?: Prisma.InputJsonValue | null;
    originalTransactionId?: string | null;
    status?: string;
    transactionId?: string | null;
  },
) {
  return prisma.iosIapNotificationEvent.update({
    where: { id: eventId },
    data: {
      decodedPayload: input.decodedPayload ?? undefined,
      errorMessage: null,
      originalTransactionId: input.originalTransactionId ?? undefined,
      processedAt: new Date(),
      status: input.status ?? "processed",
      transactionId: input.transactionId ?? undefined,
    },
  });
}

export function markIosIapNotificationEventFailed(
  eventId: string,
  message: string,
) {
  return prisma.iosIapNotificationEvent.update({
    where: { id: eventId },
    data: {
      errorMessage: message,
      processedAt: new Date(),
      status: "failed",
    },
  });
}

export function upsertIosIapTransactionFromNotification(
  input: IosIapTransactionWebhookInput,
) {
  return prisma.iosIapTransaction.upsert({
    where: { transactionId: input.transactionId },
    create: input,
    update: {
      appTransactionId: input.appTransactionId ?? null,
      billingPlanType: input.billingPlanType ?? null,
      bundleId: input.bundleId ?? null,
      currency: input.currency ?? null,
      environment: input.environment,
      expiresDate: input.expiresDate ?? null,
      isTrial: input.isTrial ?? null,
      offerDiscountType: input.offerDiscountType ?? null,
      offerPeriod: input.offerPeriod ?? null,
      offerType: input.offerType ?? null,
      originalTransactionId: input.originalTransactionId ?? null,
      priceMilliunits: input.priceMilliunits ?? null,
      productId: input.productId,
      purchaseDate: input.purchaseDate ?? null,
      rawReceipt: input.rawReceipt,
      revenueMicros: input.revenueMicros ?? null,
      revocationDate: input.revocationDate ?? null,
      revocationPercentage: input.revocationPercentage ?? null,
      revocationReason: input.revocationReason ?? null,
      revocationType: input.revocationType ?? null,
      state: input.state,
      storefront: input.storefront ?? null,
      storefrontId: input.storefrontId ?? null,
      storeProfileId: input.storeProfileId ?? null,
      subscriptionGroupId: input.subscriptionGroupId ?? null,
      transactionReason: input.transactionReason ?? null,
      userId: input.userId ?? null,
      verifiedAt: input.verifiedAt,
      webOrderLineItemId: input.webOrderLineItemId ?? null,
    },
  });
}
