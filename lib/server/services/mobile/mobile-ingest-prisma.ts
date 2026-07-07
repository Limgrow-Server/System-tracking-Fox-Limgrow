import "server-only";

import { PrismaClient } from "@prisma/client";

const DEFAULT_CONNECTION_LIMIT = 2;
const DEFAULT_POOL_TIMEOUT_SECONDS = 2;

const globalForMobileIngestPrisma = globalThis as unknown as {
  mobileIngestPrisma?: PrismaClient;
};

function intEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function mobileIngestDatabaseUrl() {
  const rawUrl =
    process.env.MOBILE_INGEST_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim();

  if (!rawUrl) return rawUrl;

  const url = new URL(rawUrl);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set(
      "connection_limit",
      String(intEnv("MOBILE_INGEST_DATABASE_CONNECTION_LIMIT", DEFAULT_CONNECTION_LIMIT, 1, 5)),
    );
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set(
      "pool_timeout",
      String(intEnv("MOBILE_INGEST_DATABASE_POOL_TIMEOUT", DEFAULT_POOL_TIMEOUT_SECONDS, 1, 30)),
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
