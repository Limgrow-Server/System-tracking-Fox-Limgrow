import "server-only";

import { createHash } from "crypto";

import type { DeviceToken, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeAppId } from "@/lib/tracking/identity";
import { badRequest } from "@/lib/server/api/errors";
import {
  clean,
  inferredStorePlatform,
  normalizeAppIdentifier,
  normalizeBundleId,
  normalizeDeviceId,
  normalizeDeviceType,
  normalizeFirebaseProjectId,
  normalizeLocale,
  normalizePackageName,
  nullableString,
  resolveMobileAppConfig,
  type MobilePlatform,
  type StorePlatform,
} from "@/lib/server/services/mobile/mobile-shared";

export type DeviceTokenRequest = {
  action?: "register" | "heartbeat" | "unregister" | "mark_invalid";
  appId?: string;
  app_id?: string;
  appVersion?: string;
  bundleId?: string;
  deviceId?: string;
  deviceManufacturer?: string;
  deviceModel?: string;
  deviceType?: string;
  device_type?: string;
  errorCode?: string;
  errorDetail?: string;
  fcmToken?: string;
  firebaseAppId?: string;
  firebaseProjectId?: string;
  languageCode?: string;
  language_code?: string;
  locale?: string;
  osVersion?: string;
  packageName?: string;
  platform?: MobilePlatform;
  productAppId?: string;
  storeAccountName?: string;
  storePlatform?: StorePlatform;
  storeProfileId?: string;
};

const LAST_SEEN_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_REGISTER_COOLDOWN_MS = 6 * 60 * 60 * 1000;

const deviceTokenSelect = {
  appId: true,
  appIdentifier: true,
  appVersion: true,
  bundleId: true,
  createdAt: true,
  deviceId: true,
  deviceManufacturer: true,
  deviceModel: true,
  deviceType: true,
  firebaseAppId: true,
  firebaseProjectId: true,
  fcmToken: true,
  id: true,
  lastSeenAt: true,
  locale: true,
  osVersion: true,
  packageName: true,
  platform: true,
  productAppId: true,
  status: true,
  storeAccountName: true,
  storePlatform: true,
  tokenHash: true,
  updatedAt: true,
  userId: true,
} satisfies Prisma.DeviceTokenSelect;

type DeviceTokenRow = Prisma.DeviceTokenGetPayload<{ select: typeof deviceTokenSelect }>;

type DeviceTokenRowInput = {
  appId: string | null;
  appIdentifier: string | null;
  appVersion: string | null;
  bundleId: string | null;
  deviceId: string;
  deviceManufacturer: string | null;
  deviceModel: string | null;
  deviceType: string | null;
  fcmToken: string;
  firebaseAppId: string | null;
  firebaseProjectId: string | null;
  lastSeenAt: Date;
  locale: string | null;
  osVersion: string | null;
  packageName: string | null;
  platform: MobilePlatform;
  productAppId: string | null;
  status: string;
  storeAccountName: string | null;
  storePlatform: StorePlatform;
  tokenHash: string;
  updatedAt: Date;
  userId: string;
};

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function positiveIntEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function requestAppId(payload: DeviceTokenRequest) {
  return normalizeAppId(payload.appId) || normalizeAppId(payload.app_id);
}

function requestLocale(payload: DeviceTokenRequest) {
  return normalizeLocale(payload.locale) || normalizeLocale(payload.languageCode) || normalizeLocale(payload.language_code);
}

function comparable(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isLastSeenStale(value: unknown, nowMs: number) {
  const timestamp = Date.parse(comparable(value));
  return !Number.isFinite(timestamp)
    || nowMs - timestamp >= LAST_SEEN_REFRESH_INTERVAL_MS;
}

function isFreshRegistration(row: DeviceTokenRow, nowMs: number, cooldownMs: number) {
  const seenAt = row.lastSeenAt ?? row.updatedAt;
  const timestamp = seenAt instanceof Date ? seenAt.getTime() : Date.parse(comparable(seenAt));
  return Number.isFinite(timestamp) && nowMs - timestamp < cooldownMs;
}

function existingTokenMatchesRequest(
  row: DeviceTokenRow,
  payload: DeviceTokenRequest,
  expectedPlatform: MobilePlatform,
) {
  if (row.platform !== expectedPlatform) return false;
  if (row.status !== "active") return false;

  const appId = requestAppId(payload);
  const productAppId = normalizeAppId(payload.productAppId);
  const rowAppId = normalizeAppId(row.appId);
  const rowProductAppId = normalizeAppId(row.productAppId);

  if (appId && rowAppId !== appId && rowProductAppId !== appId) return false;
  if (productAppId && rowProductAppId !== productAppId && rowAppId !== productAppId) return false;

  if (expectedPlatform === "android") {
    const packageName = normalizePackageName(payload.packageName);
    const rowPackageName = normalizePackageName(row.packageName);
    if (packageName && rowPackageName !== packageName && row.appIdentifier !== packageName) return false;
  } else {
    const bundleId = normalizeBundleId(payload.bundleId);
    const rowBundleId = normalizeBundleId(row.bundleId);
    if (bundleId && rowBundleId !== bundleId && row.appIdentifier !== bundleId) return false;
  }

  return true;
}

function validateAppIdentifier(payload: DeviceTokenRequest, expectedPlatform: MobilePlatform) {
  if (requestAppId(payload)) return null;
  if (normalizeAppId(payload.productAppId)) return null;
  if (expectedPlatform === "android" && normalizePackageName(payload.packageName)) return null;
  if (expectedPlatform === "ios" && normalizeBundleId(payload.bundleId)) return null;
  return expectedPlatform === "android" ? "app_id_or_package_name_required" : "app_id_or_bundle_id_required";
}

function changedUpdatePayload(
  existing: DeviceTokenRow,
  row: DeviceTokenRowInput,
  now: Date,
  nowMs: number,
) {
  const updatePayload: Prisma.DeviceTokenUpdateInput = {};
  const trackedColumns: Array<keyof DeviceTokenRowInput> = [
    "appId",
    "appIdentifier",
    "appVersion",
    "bundleId",
    "deviceId",
    "deviceManufacturer",
    "deviceModel",
    "deviceType",
    "firebaseAppId",
    "firebaseProjectId",
    "locale",
    "osVersion",
    "packageName",
    "platform",
    "productAppId",
    "storeAccountName",
    "storePlatform",
    "userId",
  ];

  for (const column of trackedColumns) {
    if (comparable(existing[column]) !== comparable(row[column])) {
      updatePayload[column] = row[column] as never;
    }
  }

  if (existing.status !== "active") {
    updatePayload.status = "active";
  }

  if (isLastSeenStale(existing.lastSeenAt, nowMs)) {
    updatePayload.lastSeenAt = now;
  }

  if (Object.keys(updatePayload).length) {
    updatePayload.updatedAt = now;
  }

  return updatePayload;
}

function deviceToResponse(device: DeviceToken | DeviceTokenRow) {
  return {
    id: device.id,
    user_id: device.userId,
    app_id: device.appId,
    device_id: device.deviceId,
    platform: device.platform,
    firebase_app_id: device.firebaseAppId,
    firebase_project_id: device.firebaseProjectId,
    app_identifier: device.appIdentifier,
    app_version: device.appVersion,
    os_version: device.osVersion,
    locale: device.locale,
    status: device.status,
    last_seen_at: device.lastSeenAt.toISOString(),
    store_platform: device.storePlatform,
    store_account_name: device.storeAccountName,
    product_app_id: device.productAppId,
    package_name: device.packageName,
    bundle_id: device.bundleId,
    device_type: device.deviceType,
    device_model: device.deviceModel,
    device_manufacturer: device.deviceManufacturer,
    created_at: device.createdAt.toISOString(),
    updated_at: device.updatedAt.toISOString(),
  };
}

async function writeInvalidEvent(
  payload: DeviceTokenRequest,
  platform: MobilePlatform,
  deviceId: string | null,
) {
  await prisma.notificationEvent.create({
    data: {
      deviceId,
      errorCode: clean(payload.errorCode) || "client_mark_invalid",
      errorDetail: clean(payload.errorDetail) || null,
      eventType: "token_invalid",
      metadata: {
        appId: requestAppId(payload) || null,
        bundleId: normalizeBundleId(payload.bundleId) || null,
        packageName: normalizePackageName(payload.packageName) || null,
        productAppId: normalizeAppId(payload.productAppId) || null,
      },
      notificationId: requestAppId(payload)
        || normalizeAppId(payload.productAppId)
        || normalizePackageName(payload.packageName)
        || normalizeBundleId(payload.bundleId)
        || `device-token-${platform}`,
      platform,
    },
  });
}

async function markReplacedDeviceTokens(
  row: Pick<DeviceTokenRowInput, "appId" | "appIdentifier" | "bundleId" | "deviceId" | "packageName" | "productAppId">,
  tokenHash: string,
  expectedPlatform: MobilePlatform,
  now: Date,
) {
  const orClauses: Prisma.DeviceTokenWhereInput[] = [];
  if (row.appId) orClauses.push({ appId: row.appId });
  if (row.productAppId) orClauses.push({ productAppId: row.productAppId });
  if (row.appIdentifier) orClauses.push({ appIdentifier: row.appIdentifier });
  if (row.packageName) orClauses.push({ packageName: row.packageName });
  if (row.bundleId) orClauses.push({ bundleId: row.bundleId });
  if (!orClauses.length) return 0;

  const result = await prisma.deviceToken.updateMany({
    data: {
      status: "replaced",
      updatedAt: now,
    },
    where: {
      OR: orClauses,
      deviceId: row.deviceId,
      platform: expectedPlatform,
      status: "active",
      tokenHash: { not: tokenHash },
    },
  });

  return result.count;
}

export async function handleDeviceTokenRequest(
  payload: DeviceTokenRequest,
  expectedPlatform: MobilePlatform,
) {
  const action = payload.action ?? "register";
  const appId = requestAppId(payload);
  const fcmToken = clean(payload.fcmToken);
  const requestedDeviceId = normalizeDeviceId(payload.deviceId);

  if (payload.platform && payload.platform !== expectedPlatform) {
    throw badRequest(`use_device_token_${payload.platform}_endpoint`);
  }

  const identifierError = validateAppIdentifier(payload, expectedPlatform);
  if (identifierError) throw badRequest(identifierError);

  if ((action === "register" || action === "heartbeat") && !appId) {
    throw badRequest("app_id_required");
  }

  if (action === "register" && !fcmToken) {
    throw badRequest("fcm_token_required");
  }

  const tokenHash = fcmToken ? sha256Hex(fcmToken) : null;
  const deviceId = requestedDeviceId || (tokenHash ? tokenHash.slice(0, 24) : "");
  const nowMs = Date.now();
  const now = new Date(nowMs);

  if ((action === "register" || action === "heartbeat") && tokenHash) {
    const cooldownMs = positiveIntEnv("DEVICE_TOKEN_REGISTER_COOLDOWN_MS", DEFAULT_REGISTER_COOLDOWN_MS);
    const existing = await prisma.deviceToken.findUnique({
      select: deviceTokenSelect,
      where: { tokenHash },
    });

    if (
      existing
      && isFreshRegistration(existing, nowMs, cooldownMs)
      && existingTokenMatchesRequest(existing, payload, expectedPlatform)
    ) {
      return {
        ok: true,
        action,
        platform: expectedPlatform,
        device: deviceToResponse(existing),
        fastPath: true,
        skippedWrite: true,
        app: {
          appId,
          appIdentifier: existing.appIdentifier,
          productAppId: existing.productAppId,
          packageName: existing.packageName,
          bundleId: existing.bundleId,
          firebaseProjectId: existing.firebaseProjectId,
        },
      };
    }
  }

  const integration = await resolveMobileAppConfig({
    appId,
    appName: normalizeAppId(payload.productAppId) || appId,
    bundleId: normalizeBundleId(payload.bundleId),
    packageName: normalizePackageName(payload.packageName),
    platform: expectedPlatform,
    productAppId: normalizeAppId(payload.productAppId) || appId,
    storeAccountName: clean(payload.storeAccountName),
    storeProfileId: clean(payload.storeProfileId),
  });

  if (action === "unregister" || action === "mark_invalid") {
    if (!tokenHash && !deviceId) {
      throw badRequest("token_or_device_required");
    }

    const devices = await prisma.deviceToken.updateManyAndReturn({
      data: {
        lastSeenAt: now,
        status: action === "unregister" ? "unregistered" : "invalid",
        updatedAt: now,
      },
      select: deviceTokenSelect,
      where: {
        platform: expectedPlatform,
        ...(tokenHash ? { tokenHash } : { deviceId }),
      },
      limit: 1,
    });

    if (action === "mark_invalid") {
      await writeInvalidEvent(payload, expectedPlatform, deviceId || null);
    }

    return {
      ok: true,
      action,
      platform: expectedPlatform,
      devices: devices.map(deviceToResponse),
    };
  }

  if (!tokenHash) {
    throw badRequest("fcm_token_required");
  }

  const integrationAppId = normalizeAppId(integration?.appId);
  const resolvedAppId = integrationAppId || appId;
  const productAppId = integrationAppId || normalizeAppId(payload.productAppId) || resolvedAppId;
  const storePlatform = payload.storePlatform ?? integration?.storePlatform ?? inferredStorePlatform(expectedPlatform);
  const packageName = expectedPlatform === "android"
    ? normalizePackageName(payload.packageName) || normalizePackageName(integration?.packageName) || null
    : null;
  const bundleId = expectedPlatform === "ios"
    ? normalizeBundleId(payload.bundleId) || normalizeBundleId(integration?.bundleId) || null
    : null;
  const appIdentifier = normalizeAppIdentifier({
    appId,
    bundleId,
    packageName,
    platform: expectedPlatform,
    productAppId,
  }) || null;
  const deviceType = normalizeDeviceType(payload.deviceType) || normalizeDeviceType(payload.device_type) || null;
  const userId = `app:${resolvedAppId}:device:${deviceId || tokenHash.slice(0, 12)}`;

  const row: DeviceTokenRowInput = {
    appId: resolvedAppId,
    appIdentifier,
    appVersion: clean(payload.appVersion) || null,
    bundleId,
    deviceId,
    deviceManufacturer: clean(payload.deviceManufacturer) || null,
    deviceModel: clean(payload.deviceModel) || null,
    deviceType,
    fcmToken,
    firebaseAppId: nullableString(payload.firebaseAppId),
    firebaseProjectId: normalizeFirebaseProjectId(payload.firebaseProjectId) || null,
    lastSeenAt: now,
    locale: requestLocale(payload) || null,
    osVersion: clean(payload.osVersion) || null,
    packageName,
    platform: expectedPlatform,
    productAppId,
    status: "active",
    storeAccountName: integration?.storeAccountName ?? null,
    storePlatform,
    tokenHash,
    updatedAt: now,
    userId,
  };

  const existing = await prisma.deviceToken.findUnique({
    select: deviceTokenSelect,
    where: { tokenHash },
  });

  let device: DeviceTokenRow;
  let skipped = false;

  if (existing) {
    const updatePayload = changedUpdatePayload(existing, row, now, nowMs);

    if (Object.keys(updatePayload).length) {
      device = await prisma.deviceToken.update({
        data: updatePayload,
        select: deviceTokenSelect,
        where: { id: existing.id },
      });
    } else {
      device = existing;
      skipped = true;
    }
  } else {
    device = await prisma.deviceToken.create({
      data: row,
      select: deviceTokenSelect,
    });
  }

  const replacedTokenCount = await markReplacedDeviceTokens(row, tokenHash, expectedPlatform, now);

  return {
    ok: true,
    action,
    platform: expectedPlatform,
    device: deviceToResponse(device),
    skipped,
    replacedTokenCount,
    app: {
      appId,
      appIdentifier,
      productAppId,
      packageName: row.packageName,
      bundleId: row.bundleId,
      firebaseProjectId: row.firebaseProjectId,
    },
  };
}
