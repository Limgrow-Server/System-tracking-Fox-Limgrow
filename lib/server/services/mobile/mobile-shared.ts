import "server-only";

import { MappingStatus, Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeAppId } from "@/lib/tracking/identity";

export type MobilePlatform = "android" | "ios";
export type StorePlatform = "google_play" | "apple_app_store";

export type MobileAppConfig = {
  appIconUrl: string | null;
  appId: string | null;
  appLink: string | null;
  appName: string;
  bundleId: string | null;
  id: string;
  packageName: string | null;
  platform: MobilePlatform;
  status: string;
  storeAccountName: string;
  storePlatform: StorePlatform;
  storeProfileId: string;
};

export type MobileAppLookup = {
  appId?: string | null;
  appName?: string | null;
  bundleId?: string | null;
  packageName?: string | null;
  platform: MobilePlatform;
  productAppId?: string | null;
  storeAccountName?: string | null;
  storeProfileId?: string | null;
};

type MobileAppConfigPrisma = Pick<typeof prisma, "androidStoreMapping" | "iosStoreMapping">;

export function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function nullableString(value: unknown) {
  const cleaned = clean(value);
  return cleaned || null;
}

export function normalizePackageName(value: unknown) {
  return clean(value).toLowerCase();
}

export function normalizeBundleId(value: unknown) {
  return clean(value);
}

export function normalizeDeviceId(value: unknown) {
  return clean(value);
}

export function normalizeDeviceType(value: unknown) {
  return clean(value)
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/gi, "")
    .toLowerCase();
}

export function normalizeFirebaseProjectId(value: unknown) {
  return clean(value);
}

export function normalizeLocale(value: unknown) {
  const cleaned = clean(value).replace(/_/g, "-").toLowerCase();
  return cleaned.replace(/[^a-z0-9-]/g, "");
}

export function primaryLocaleCode(value: unknown) {
  return normalizeLocale(value).split("-")[0] || "";
}

export function normalizeAppIdentifier(input: {
  appId?: unknown;
  bundleId?: unknown;
  packageName?: unknown;
  platform?: unknown;
  productAppId?: unknown;
}) {
  if (input.platform === "android") {
    return normalizePackageName(input.packageName)
      || normalizeAppId(input.productAppId)
      || normalizeAppId(input.appId);
  }

  if (input.platform === "ios") {
    return normalizeBundleId(input.bundleId)
      || normalizeAppId(input.productAppId)
      || normalizeAppId(input.appId);
  }

  return normalizePackageName(input.packageName)
    || normalizeBundleId(input.bundleId)
    || normalizeAppId(input.productAppId)
    || normalizeAppId(input.appId);
}

function appIdLookup(input: MobileAppLookup) {
  return normalizeAppId(input.appId) || normalizeAppId(input.productAppId);
}

function appNameLookup(input: MobileAppLookup) {
  return clean(input.appName) || clean(input.productAppId);
}

function storePlatformFor(platform: MobilePlatform): StorePlatform {
  return platform === "android" ? "google_play" : "apple_app_store";
}

function normalizeAndroidApp(row: {
  appIconUrl: string | null;
  appId: string | null;
  appLink: string | null;
  appName: string;
  id: string;
  packageName: string;
  status: MappingStatus;
  storeAccountName: string;
  storeProfileId: string;
}): MobileAppConfig {
  return {
    appIconUrl: row.appIconUrl,
    appId: row.appId,
    appLink: row.appLink,
    appName: row.appName,
    bundleId: null,
    id: row.id,
    packageName: row.packageName,
    platform: "android",
    status: row.status,
    storeAccountName: row.storeAccountName,
    storePlatform: "google_play",
    storeProfileId: row.storeProfileId,
  };
}

function normalizeIosApp(row: {
  appIconUrl: string | null;
  appId: string | null;
  appLink: string | null;
  appName: string;
  bundleId: string;
  id: string;
  status: MappingStatus;
  storeAccountName: string;
  storeProfileId: string;
}): MobileAppConfig {
  return {
    appIconUrl: row.appIconUrl,
    appId: row.appId,
    appLink: row.appLink,
    appName: row.appName,
    bundleId: row.bundleId,
    id: row.id,
    packageName: null,
    platform: "ios",
    status: row.status,
    storeAccountName: row.storeAccountName,
    storePlatform: "apple_app_store",
    storeProfileId: row.storeProfileId,
  };
}

function androidWhereCandidates(input: MobileAppLookup) {
  const appId = appIdLookup(input);
  const appName = appNameLookup(input);
  const packageName = normalizePackageName(input.packageName);
  const storeAccountName = clean(input.storeAccountName);
  const storeProfileId = clean(input.storeProfileId);
  const candidates: Prisma.AndroidStoreMappingWhereInput[] = [];

  if (storeProfileId) {
    if (packageName) candidates.push({ packageName, storeProfileId });
    if (appId) candidates.push({ appId, storeProfileId });
    if (appName) candidates.push({ appName, storeProfileId });
  }

  if (storeAccountName) {
    if (packageName) candidates.push({ packageName, storeAccountName });
    if (appId) candidates.push({ appId, storeAccountName });
    if (appName) candidates.push({ appName, storeAccountName });
  }

  if (packageName) candidates.push({ packageName });
  if (appId) candidates.push({ appId });
  if (storeAccountName) candidates.push({ storeAccountName });
  if (appName) candidates.push({ appName });

  return candidates;
}

function iosWhereCandidates(input: MobileAppLookup) {
  const appId = appIdLookup(input);
  const appName = appNameLookup(input);
  const bundleId = normalizeBundleId(input.bundleId);
  const storeAccountName = clean(input.storeAccountName);
  const storeProfileId = clean(input.storeProfileId);
  const candidates: Prisma.IosStoreMappingWhereInput[] = [];

  if (storeProfileId) {
    if (bundleId) candidates.push({ bundleId, storeProfileId });
    if (appId) candidates.push({ appId, storeProfileId });
    if (appName) candidates.push({ appName, storeProfileId });
  }

  if (storeAccountName) {
    if (bundleId) candidates.push({ bundleId, storeAccountName });
    if (appId) candidates.push({ appId, storeAccountName });
    if (appName) candidates.push({ appName, storeAccountName });
  }

  if (bundleId) candidates.push({ bundleId });
  if (appId) candidates.push({ appId });
  if (storeAccountName) candidates.push({ storeAccountName });
  if (appName) candidates.push({ appName });

  return candidates;
}

export async function resolveMobileAppConfig(
  input: MobileAppLookup,
  db: MobileAppConfigPrisma = prisma,
) {
  if (input.platform === "android") {
    for (const where of androidWhereCandidates(input)) {
      const row = await db.androidStoreMapping.findFirst({
        orderBy: { updatedAt: "desc" },
        select: {
          appIconUrl: true,
          appId: true,
          appLink: true,
          appName: true,
          id: true,
          packageName: true,
          status: true,
          storeAccountName: true,
          storeProfileId: true,
        },
        where: { ...where, status: MappingStatus.ACTIVE },
      });

      if (row) return normalizeAndroidApp(row);
    }
  } else {
    for (const where of iosWhereCandidates(input)) {
      const row = await db.iosStoreMapping.findFirst({
        orderBy: { updatedAt: "desc" },
        select: {
          appIconUrl: true,
          appId: true,
          appLink: true,
          appName: true,
          bundleId: true,
          id: true,
          status: true,
          storeAccountName: true,
          storeProfileId: true,
        },
        where: { ...where, status: MappingStatus.ACTIVE },
      });

      if (row) return normalizeIosApp(row);
    }
  }

  return null;
}

export function inferredStorePlatform(platform: MobilePlatform): StorePlatform {
  return storePlatformFor(platform);
}
