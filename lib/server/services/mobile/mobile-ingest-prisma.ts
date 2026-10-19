import "server-only";

import { PrismaClient } from "@prisma/client";

const DEFAULT_CONNECTION_LIMIT = 6;
const DEFAULT_POOL_TIMEOUT_SECONDS = 10;

const globalForMobileIngestPrisma = globalThis as unknown as {
  mobileIngestPrisma?: PrismaClient;
};

function intEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function explicitMobileIngestUrlParamInt(name: string) {
  const explicitUrl = process.env.MOBILE_INGEST_DATABASE_URL?.trim();
  if (!explicitUrl) return null;

  try {
    const raw = new URL(explicitUrl).searchParams.get(name);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? Math.floor(parsed) : null;
  } catch {
    return null;
  }
}

export function mobileIngestConnectionLimit() {
  return intEnv(
    "MOBILE_INGEST_DATABASE_CONNECTION_LIMIT",
    explicitMobileIngestUrlParamInt("connection_limit") ?? DEFAULT_CONNECTION_LIMIT,
    1,
    20,
  );
}

export function mobileIngestPoolTimeoutSeconds() {
  return intEnv(
    "MOBILE_INGEST_DATABASE_POOL_TIMEOUT",
    explicitMobileIngestUrlParamInt("pool_timeout") ?? DEFAULT_POOL_TIMEOUT_SECONDS,
    1,
    60,
  );
}

function mobileIngestDatabaseUrl() {
  const explicitUrl = process.env.MOBILE_INGEST_DATABASE_URL?.trim();
  const rawUrl = explicitUrl
    || process.env.NOTIFICATION_DATABASE_URL?.trim()
    || process.env.EVENT_TRACKING_DATABASE_URL?.trim()
    || process.env.DATABASE_URL?.trim();

  if (!rawUrl) return rawUrl;

  const url = new URL(rawUrl);
  const hasConnectionLimitEnv = Boolean(process.env.MOBILE_INGEST_DATABASE_CONNECTION_LIMIT?.trim());
  const hasPoolTimeoutEnv = Boolean(process.env.MOBILE_INGEST_DATABASE_POOL_TIMEOUT?.trim());

  if (!explicitUrl || hasConnectionLimitEnv || !url.searchParams.has("connection_limit")) {
    url.searchParams.set(
      "connection_limit",
      String(mobileIngestConnectionLimit()),
    );
  }
  if (!explicitUrl || hasPoolTimeoutEnv || !url.searchParams.has("pool_timeout")) {
    url.searchParams.set(
      "pool_timeout",
      String(mobileIngestPoolTimeoutSeconds()),
    );
  }

  return url.toString();
}

export const mobileIngestPrisma =
  globalForMobileIngestPrisma.mobileIngestPrisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: mobileIngestDatabaseUrl(),
      },
    },
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

globalForMobileIngestPrisma.mobileIngestPrisma = mobileIngestPrisma;
