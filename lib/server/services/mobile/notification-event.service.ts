import "server-only";

import { createHash } from "crypto";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeAppId } from "@/lib/tracking/identity";
import { badRequest } from "@/lib/server/api/errors";
import {
  clean,
  normalizeAppIdentifier,
  normalizeBundleId,
  normalizeDeviceId,
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
  deviceId?: string;
  deviceType?: string;
  device_type?: string;
  eventType?: string;
  fcmToken?: string;
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
const LAST_SEEN_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;

const deviceEventSelect = {
  appIdentifier: true,
  appId: true,
  bundleId: true,
  deviceId: true,
  deviceType: true,
  fcmToken: true,
  id: true,
  lastSeenAt: true,
  locale: true,
  packageName: true,
  platform: true,
  productAppId: true,
  status: true,
  tokenHash: true,
} satisfies Prisma.DeviceTokenSelect;

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

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

function isLastSeenStale(value: unknown, nowMs: number) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(clean(value));
  return !Number.isFinite(timestamp)
    || nowMs - timestamp >= LAST_SEEN_REFRESH_INTERVAL_MS;
}

async function findDeviceToken(
  payload: NotificationEventRequest,
  platform: MobilePlatform,
  tokenHash: string | null,
) {
  if (tokenHash) {
    const device = await prisma.deviceToken.findUnique({
      select: deviceEventSelect,
      where: { tokenHash },
    });
    if (device?.platform === platform) return device;
  }

  const deviceId = normalizeDeviceId(payload.deviceId);
  if (!deviceId) return null;

  const appId = requestAppId(payload) || normalizeAppId(payload.productAppId);
  const packageName = normalizePackageName(payload.packageName);
  const bundleId = normalizeBundleId(payload.bundleId);
  const appIdentifier = platform === "android" && packageName
    ? packageName
    : platform === "ios" && bundleId
      ? bundleId
      : "";
  const where: Prisma.DeviceTokenWhereInput = {
    deviceId,
    platform,
  };

  if (appIdentifier) {
    where.appIdentifier = appIdentifier;
  } else if (appId) {
    where.OR = [{ appId }, { productAppId: appId }];
  } else if (platform === "android" && packageName) {
    where.packageName = packageName;
  } else if (platform === "ios" && bundleId) {
    where.bundleId = bundleId;
  }

  return prisma.deviceToken.findFirst({
    orderBy: { lastSeenAt: "desc" },
    select: deviceEventSelect,
    where,
  });
}

async function touchDeviceToken(
  device: Prisma.DeviceTokenGetPayload<{ select: typeof deviceEventSelect }> | null,
  locale: string,
) {
  if (!device?.id) return;

  const nowMs = Date.now();
  const data: Prisma.DeviceTokenUpdateInput = {};

  if (isLastSeenStale(device.lastSeenAt, nowMs)) {
    data.lastSeenAt = new Date(nowMs);
  }

  if (locale && locale !== clean(device.locale)) {
    data.locale = locale;
  }

  if (!Object.keys(data).length) return;

  data.updatedAt = new Date(nowMs);

  await prisma.deviceToken.update({
    data,
    where: { id: device.id },
  });
}

export async function handleNotificationEventRequest(payload: NotificationEventRequest) {
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
  const notificationId = clean(payload.notificationJobId) || clean(payload.notificationId) || providerMessageId || appId || productAppId || packageName || bundleId;

  if (!notificationId) {
    throw badRequest("notification_id_or_app_identifier_required");
  }

  const app = await resolveMobileAppConfig({
    appId,
    appName: productAppId,
    bundleId,
    packageName,
    platform,
    productAppId,
    storeAccountName: clean(payload.storeAccountName),
    storeProfileId: clean(payload.storeProfileId),
  });
  const fcmToken = clean(payload.fcmToken);
  const tokenHash = fcmToken ? sha256Hex(fcmToken) : null;
  const device = await findDeviceToken(payload, platform, tokenHash);
  const deviceId = clean(device?.deviceId) || normalizeDeviceId(payload.deviceId) || null;

  await touchDeviceToken(device, locale);

  const metadata = {
    ...objectMetadata(payload.metadata),
    appId: app?.appId ?? appId ?? null,
    appIdentifier: appIdentifier || clean(device?.appIdentifier) || null,
    appMappingId: app?.id ?? null,
    appName: app?.appName ?? null,
    appVersion: clean(payload.appVersion) || null,
    bundleId: app?.bundleId ?? bundleId ?? null,
    deviceType: deviceType || clean(device?.deviceType) || null,
    deviceTokenId: clean(device?.id) || null,
    locale: locale || clean(device?.locale) || null,
    localeCode: primaryLocaleCode(locale || clean(device?.locale)),
    osVersion: clean(payload.osVersion) || null,
    packageName: app?.packageName ?? packageName ?? null,
    productAppId: productAppId || clean(device?.productAppId) || null,
    source: "mobile",
    tokenHash,
  } satisfies Prisma.InputJsonObject;

  const event = await prisma.notificationEvent.create({
    data: {
      deviceId,
      deviceTokenId: clean(device?.id) || null,
      eventType,
      jobId: uuidOrNull(payload.notificationJobId) || uuidOrNull(payload.notificationId),
      metadata,
      notificationId,
      platform,
      providerMessageId,
      status: eventStatus(eventType),
      targetType: "device",
      targetValue: deviceId,
    },
  });

  return {
    ok: true,
    event,
    matchedDevice: Boolean(device),
    normalized: {
      appId: app?.appId ?? appId ?? null,
      bundleId: app?.bundleId ?? bundleId ?? null,
      deviceId,
      locale: locale || clean(device?.locale) || null,
      packageName: app?.packageName ?? packageName ?? null,
      platform,
    },
  };
}
