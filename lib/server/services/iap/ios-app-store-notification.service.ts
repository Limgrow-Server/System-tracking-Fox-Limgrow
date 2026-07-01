import "server-only";

import { readFileSync } from "node:fs";

import {
  Environment,
  NotificationTypeV2,
  OfferDiscountType,
  SignedDataVerifier,
  VerificationException,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import { Prisma } from "@prisma/client";

import { ApiError, badRequest } from "@/lib/server/api/errors";
import {
  getIosStoreMappingForNotification,
  markIosIapNotificationEventFailed,
  markIosIapNotificationEventProcessed,
  reserveIosIapNotificationEvent,
  upsertIosIapTransactionFromNotification,
} from "@/lib/server/repositories/iap/ios-iap-notification.repository";

type JsonRecord = Record<string, unknown>;

type AppStoreNotificationPayload = {
  signedPayload?: unknown;
};

const TRACKED_NOTIFICATION_TYPES = new Set<string>([
  NotificationTypeV2.DID_RENEW,
  NotificationTypeV2.EXPIRED,
  NotificationTypeV2.REFUND,
  NotificationTypeV2.REFUND_REVERSED,
  NotificationTypeV2.REVOKE,
  NotificationTypeV2.SUBSCRIBED,
]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function splitConfigList(value: string) {
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pemCertificateBuffers(value: string) {
  const normalized = value.replace(/\\n/g, "\n");
  return (
    normalized.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g)
      ?.map((certificate) => Buffer.from(certificate))
      ?? []
  );
}

function appleRootCertificates() {
  const certificates: Buffer[] = [];

  for (const filePath of splitConfigList(process.env.APPLE_APP_STORE_ROOT_CERTIFICATE_PATHS ?? "")) {
    certificates.push(readFileSync(filePath));
  }

  for (const encoded of splitConfigList(process.env.APPLE_APP_STORE_ROOT_CERTIFICATES_BASE64 ?? "")) {
    certificates.push(Buffer.from(encoded, "base64"));
  }

  certificates.push(...pemCertificateBuffers(process.env.APPLE_APP_STORE_ROOT_CERTIFICATES_PEM ?? ""));

  if (!certificates.length) {
    throw new ApiError(
      "Missing Apple root certificates. Configure APPLE_APP_STORE_ROOT_CERTIFICATE_PATHS, APPLE_APP_STORE_ROOT_CERTIFICATES_BASE64, or APPLE_APP_STORE_ROOT_CERTIFICATES_PEM.",
      500,
    );
  }

  return certificates;
}

function appleEnvironment(value: unknown) {
  const normalized = clean(value).toLowerCase();
  if (normalized === "sandbox") return Environment.SANDBOX;
  if (normalized === "production") return Environment.PRODUCTION;

  throw badRequest("Unsupported App Store notification environment.");
}

function dbEnvironment(value: unknown) {
  return appleEnvironment(value) === Environment.SANDBOX ? "sandbox" : "production";
}

function boolFromEnv(value: string | undefined, fallback: boolean) {
  if (!value) return fallback;
  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
}

function base64UrlDecode(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function decodeNotificationPayloadUnsafe(signedPayload: string) {
  const [, payload] = signedPayload.split(".");
  if (!payload) throw badRequest("Invalid App Store notification signedPayload.");

  try {
    return JSON.parse(base64UrlDecode(payload)) as JsonRecord;
  } catch {
    throw badRequest("Invalid App Store notification payload.");
  }
}

function notificationData(value: unknown) {
  const data = isRecord(value) ? value.data : null;
  return isRecord(data) ? data : {};
}

function numberString(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return clean(value) || null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function intValue(value: unknown) {
  const valueNumber = numberValue(value);
  return valueNumber === null ? null : Math.trunc(valueNumber);
}

function dateFromMillis(value: unknown) {
  const valueNumber = numberValue(value);
  return valueNumber === null ? null : new Date(valueNumber);
}

function bigIntFromNumber(value: unknown) {
  const valueNumber = numberValue(value);
  return valueNumber === null ? null : BigInt(Math.trunc(valueNumber));
}

function verifierFor(input: {
  appAppleId: string | null;
  bundleId: string;
  environment: Environment;
}) {
  const appAppleId =
    input.environment === Environment.PRODUCTION
      ? Number.parseInt(input.appAppleId ?? "", 10)
      : undefined;

  if (input.environment === Environment.PRODUCTION && !Number.isFinite(appAppleId)) {
    throw new ApiError(
      "Production App Store notifications require appleAppId on the iOS app mapping.",
      500,
    );
  }

  return new SignedDataVerifier(
    appleRootCertificates(),
    boolFromEnv(process.env.APPLE_APP_STORE_ENABLE_ONLINE_CHECKS, true),
    input.environment,
    input.bundleId,
    appAppleId,
  );
}

function notificationSignedDate(notification: ResponseBodyV2DecodedPayload) {
  return dateFromMillis(notification.signedDate);
}

function transactionState(
  notificationType: string,
  transaction: JWSTransactionDecodedPayload,
) {
  if (notificationType === NotificationTypeV2.REFUND) return "refunded";
  if (notificationType === NotificationTypeV2.REVOKE) return "revoked";
  if (transaction.revocationDate) {
    return clean(transaction.revocationType) === "FAMILY_REVOKE" ? "revoked" : "refunded";
  }

  const expiresAt = dateFromMillis(transaction.expiresDate)?.getTime() ?? null;
  if (notificationType === NotificationTypeV2.EXPIRED) return "expired";
  if (expiresAt !== null && expiresAt <= Date.now()) return "expired";

  return "purchased";
}

function isTrialTransaction(transaction: JWSTransactionDecodedPayload) {
  return (
    clean(transaction.offerDiscountType) === OfferDiscountType.FREE_TRIAL ||
    (intValue(transaction.offerType) === 1 && numberValue(transaction.price) === 0)
  );
}

function transactionInput(input: {
  bundleId: string;
  notification: ResponseBodyV2DecodedPayload;
  notificationType: string;
  signedPayload: string;
  signedTransactionInfo: string;
  storeProfileId: string | null;
  transaction: JWSTransactionDecodedPayload;
}) {
  const priceMilliunits = bigIntFromNumber(input.transaction.price);
  const revenueMicros = priceMilliunits === null ? null : priceMilliunits * BigInt(1000);
  const transactionId = clean(input.transaction.transactionId);

  if (!transactionId) {
    throw badRequest("App Store notification transactionId is required.");
  }

  return {
    appTransactionId: clean(input.transaction.appTransactionId) || null,
    billingPlanType: clean(input.transaction.billingPlanType) || null,
    bundleId: clean(input.transaction.bundleId) || input.bundleId,
    currency: clean(input.transaction.currency) || null,
    environment: dbEnvironment(input.transaction.environment ?? input.notification.data?.environment),
    expiresDate: dateFromMillis(input.transaction.expiresDate),
    isTrial: isTrialTransaction(input.transaction),
    offerDiscountType: clean(input.transaction.offerDiscountType) || null,
    offerPeriod: clean(input.transaction.offerPeriod) || null,
    offerType: intValue(input.transaction.offerType),
    originalTransactionId: clean(input.transaction.originalTransactionId) || null,
    priceMilliunits,
    productId: clean(input.transaction.productId) || "unknown_product",
    purchaseDate: dateFromMillis(input.transaction.purchaseDate),
    rawReceipt: jsonValue({
      decodedNotification: input.notification,
      decodedTransactionInfo: input.transaction,
      notificationType: input.notificationType,
      notificationUUID: input.notification.notificationUUID,
      signedPayload: input.signedPayload,
      signedTransactionInfo: input.signedTransactionInfo,
      source: "app_store_server_notification",
      subtype: input.notification.subtype ?? null,
    }),
    revenueMicros,
    revocationDate: dateFromMillis(input.transaction.revocationDate),
    revocationPercentage: intValue(input.transaction.revocationPercentage),
    revocationReason: intValue(input.transaction.revocationReason),
    revocationType: clean(input.transaction.revocationType) || null,
    state: transactionState(input.notificationType, input.transaction),
    storefront: clean(input.transaction.storefront) || null,
    storefrontId: clean(input.transaction.storefrontId) || null,
    storeProfileId: input.storeProfileId,
    subscriptionGroupId: clean(input.transaction.subscriptionGroupIdentifier) || null,
    transactionId,
    transactionReason: clean(input.transaction.transactionReason) || null,
    userId: clean(input.transaction.appAccountToken) || null,
    verifiedAt: new Date(),
    webOrderLineItemId: clean(input.transaction.webOrderLineItemId) || null,
  };
}

function errorMessage(error: unknown) {
  if (error instanceof VerificationException) {
    return `App Store notification verification failed with status ${error.status}.`;
  }

  return error instanceof Error ? error.message : "App Store notification processing failed.";
}

export async function processAppStoreServerNotification(
  payload: AppStoreNotificationPayload,
) {
  const signedPayload = clean(payload.signedPayload);
  if (!signedPayload) {
    throw badRequest("App Store notification signedPayload is required.");
  }

  const unsafeDecoded = decodeNotificationPayloadUnsafe(signedPayload);
  const unsafeData = notificationData(unsafeDecoded);
  const bundleId = clean(unsafeData.bundleId);
  const appAppleId = numberString(unsafeData.appAppleId);
  const environment = appleEnvironment(unsafeData.environment);

  if (!bundleId) {
    throw badRequest("App Store notification bundleId is required.");
  }

  const mapping = await getIosStoreMappingForNotification({ appAppleId, bundleId });
  if (!mapping) {
    throw badRequest("No active iOS app mapping matches this App Store notification.");
  }

  if (appAppleId && mapping.appleAppId && mapping.appleAppId !== appAppleId) {
    throw badRequest("App Store notification appAppleId does not match the iOS app mapping.");
  }

  const verifier = verifierFor({
    appAppleId: mapping.appleAppId,
    bundleId: mapping.bundleId,
    environment,
  });

  let eventId: string | null = null;

  try {
    const notification = await verifier.verifyAndDecodeNotification(signedPayload);
    const notificationUuid = clean(notification.notificationUUID);
    const notificationType = clean(notification.notificationType) || "UNKNOWN";
    const subtype = clean(notification.subtype) || null;

    if (!notificationUuid) {
      throw badRequest("App Store notificationUUID is required.");
    }

    const reservation = await reserveIosIapNotificationEvent({
      appAppleId,
      bundleId,
      decodedPayload: jsonValue(notification),
      environment: dbEnvironment(notification.data?.environment ?? unsafeData.environment),
      notificationType,
      notificationUuid,
      rawPayload: jsonValue({ signedPayload }),
      signedDate: notificationSignedDate(notification),
      storeProfileId: mapping.storeProfileId,
      subtype,
    });
    eventId = reservation.event.id;

    if (!reservation.shouldProcess) {
      return {
        duplicate: true,
        eventId,
        notificationType,
        status: reservation.event.status,
      };
    }

    if (!TRACKED_NOTIFICATION_TYPES.has(notificationType)) {
      await markIosIapNotificationEventProcessed(eventId, {
        decodedPayload: jsonValue(notification),
        status: "ignored",
      });

      return {
        eventId,
        ignored: true,
        notificationType,
        reason: "notification_type_out_of_scope",
        status: "ignored",
      };
    }

    const signedTransactionInfo = clean(notification.data?.signedTransactionInfo);
    if (!signedTransactionInfo) {
      await markIosIapNotificationEventProcessed(eventId, {
        decodedPayload: jsonValue(notification),
        status: "ignored",
      });

      return {
        eventId,
        ignored: true,
        notificationType,
        reason: "missing_signed_transaction_info",
        status: "ignored",
      };
    }

    const transaction = await verifier.verifyAndDecodeTransaction(signedTransactionInfo);
    const input = transactionInput({
      bundleId,
      notification,
      notificationType,
      signedPayload,
      signedTransactionInfo,
      storeProfileId: mapping.storeProfileId,
      transaction,
    });
    const savedTransaction = await upsertIosIapTransactionFromNotification(input);

    await markIosIapNotificationEventProcessed(eventId, {
      decodedPayload: jsonValue({
        ...notification,
        decodedTransactionInfo: transaction,
      }),
      originalTransactionId: input.originalTransactionId,
      status: "processed",
      transactionId: input.transactionId,
    });

    return {
      eventId,
      notificationType,
      originalTransactionId: savedTransaction.originalTransactionId,
      state: savedTransaction.state,
      status: "processed",
      transactionId: savedTransaction.transactionId,
    };
  } catch (error) {
    if (eventId) {
      await markIosIapNotificationEventFailed(eventId, errorMessage(error)).catch(() => null);
    }

    if (error instanceof ApiError) throw error;
    if (error instanceof VerificationException) {
      throw new ApiError(errorMessage(error), 400);
    }
    throw error;
  }
}
