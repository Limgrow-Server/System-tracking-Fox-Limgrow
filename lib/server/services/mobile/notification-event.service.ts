import "server-only";

import type { Prisma } from "@prisma/client";

import { notificationPrisma, prisma } from "@/lib/prisma";
import { normalizeAppId } from "@/lib/tracking/identity";
import { notificationTopicName } from "@/lib/tracking/notification-topics";
import { badRequest } from "@/lib/server/api/errors";
import {
  clean,
  normalizeAppIdentifier,
  normalizeBundleId,
  normalizeDeviceType,
  normalizeLocale,
  normalizePackageName,
  primaryLocaleCode,
  resolveMobileAppConfig,
  type MobilePlatform,
} from "@/lib/server/services/mobile/mobile-shared";

export type NotificationEventRequest = {
  action?: string;
  appId?: string;
  app_id?: string;
  appVersion?: string;
  bundleId?: string;
  clientEventId?: string;
  deviceType?: string;
  device_type?: string;
  eventType?: string;
  languageCode?: string;
  language_code?: string;
  locale?: string;
  messageId?: string;
  metadata?: unknown;
  notificationId?: string;
  notificationJobId?: string;
  osVersion?: string;
  packageName?: string;
  platform?: MobilePlatform;
  productAppId?: string;
  providerMessageId?: string;
  storeAccountName?: string;
  storeProfileId?: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
type NotificationEventPrisma = Pick<
  typeof prisma,
  "androidStoreMapping" | "iosStoreMapping" | "notificationEvent"
>;

function requestAppId(payload: NotificationEventRequest) {
  return normalizeAppId(payload.appId) || normalizeAppId(payload.app_id);
}

function requestLocale(payload: NotificationEventRequest) {
  return normalizeLocale(payload.locale) || normalizeLocale(payload.languageCode) || normalizeLocale(payload.language_code);
}

function inferPlatform(payload: NotificationEventRequest): MobilePlatform {
  if (payload.platform === "ios" || payload.platform === "android") return payload.platform;
  if (normalizeBundleId(payload.bundleId)) return "ios";
  return "android";
}

function normalizeEventType(value: unknown) {
  const event = clean(value).toLowerCase().replace(/[\s-]+/g, "_");

  if (["open", "opened", "tap", "clicked", "notification_open", "notification_tap", "notification_clicked"].includes(event)) {
    return "notification_opened";
  }

  if (["receive", "received", "delivery", "delivered", "notification_received", "notification_delivered"].includes(event)) {
    return "notification_received";
  }

  if (["impression", "display", "displayed", "shown", "notification_impression", "notification_displayed", "notification_shown"].includes(event)) {
    return "notification_impression";
  }

  return event || "notification_opened";
}

function eventStatus(eventType: string) {
  if (eventType.includes("open")) return "opened";
  if (eventType.includes("impression") || eventType.includes("display") || eventType.includes("shown")) return "impression";
  if (eventType.includes("received") || eventType.includes("delivered")) return "received";
  return "logged";
}

function objectMetadata(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function uuidOrNull(value: unknown) {
  const cleaned = clean(value);
  return uuidPattern.test(cleaned) ? cleaned : null;
}

export async function handleNotificationEventRequest(
  payload: NotificationEventRequest,
  db: NotificationEventPrisma = notificationPrisma,
  trackingDb: NotificationEventPrisma = db === notificationPrisma ? prisma : db,
) {
  const platform = inferPlatform(payload);
  const appId = requestAppId(payload);
  const productAppId = normalizeAppId(payload.productAppId) || appId;
  const packageName = normalizePackageName(payload.packageName);
  const bundleId = normalizeBundleId(payload.bundleId);
  const appIdentifier = normalizeAppIdentifier({
    appId,
    bundleId,
    packageName,
    platform,
    productAppId,
  });
  const deviceType = normalizeDeviceType(payload.deviceType) || normalizeDeviceType(payload.device_type) || null;
  const locale = requestLocale(payload);
  const eventType = normalizeEventType(payload.eventType ?? payload.action);
  const providerMessageId = clean(payload.providerMessageId) || clean(payload.messageId) || null;
  const clientEventId = clean(payload.clientEventId);
  const notificationId = clean(payload.notificationJobId) || clean(payload.notificationId) || providerMessageId || appId || productAppId || packageName || bundleId;

  if (!notificationId) {
    throw badRequest("notification_id_or_app_identifier_required");
  }
  if (!clientEventId) {
    throw badRequest("client_event_id_required");
  }

  const app = await resolveMobileAppConfig(
    {
      appId,
      appName: productAppId,
      bundleId,
      packageName,
      platform,
      productAppId,
      storeAccountName: clean(payload.storeAccountName),
      storeProfileId: clean(payload.storeProfileId),
    },
    trackingDb,
  );
  if (!app) throw badRequest("notification_app_mapping_not_found");
  const localeCode = primaryLocaleCode(locale);
  const topic = notificationTopicName(app.id, localeCode);

  const metadata = {
    ...objectMetadata(payload.metadata),
    appId: app?.appId ?? appId ?? null,
    appIdentifier: appIdentifier || null,
    appMappingId: app.id,
    appName: app.appName,
    appVersion: clean(payload.appVersion) || null,
    bundleId: app.bundleId ?? bundleId ?? null,
    clientEventId,
    deviceType,
    locale: locale || null,
    localeCode,
    osVersion: clean(payload.osVersion) || null,
    packageName: app.packageName ?? packageName ?? null,
    productAppId: productAppId || null,
    source: "mobile_topic",
    topic,
  } satisfies Prisma.InputJsonObject;

  const event = await db.notificationEvent.create({
    data: {
      deviceId: null,
      deviceTokenId: null,
      eventType,
      jobId: uuidOrNull(payload.notificationJobId) || uuidOrNull(payload.notificationId),
      metadata,
      notificationId,
      platform,
      providerMessageId,
      status: eventStatus(eventType),
      targetType: "topic",
      targetValue: topic,
    },
  });

  return {
    ok: true,
    event,
    normalized: {
      appId: app.appId ?? appId ?? null,
      appMappingId: app.id,
      bundleId: app.bundleId ?? bundleId ?? null,
      clientEventId,
      locale: locale || null,
      packageName: app.packageName ?? packageName ?? null,
      platform,
      topic,
    },
  };
}
