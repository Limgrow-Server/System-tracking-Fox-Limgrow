import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  eventTrackingPrisma?: PrismaClient;
  notificationPrisma?: PrismaClient;
};

function databaseUrl(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return undefined;
}

function createPrismaClient(url?: string) {
  return new PrismaClient({
    ...(url ? { datasources: { db: { url } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const eventTrackingDatabaseUrl = databaseUrl("EVENT_TRACKING_DATABASE_URL", "DATABASE_URL");
const notificationDatabaseUrl = databaseUrl("NOTIFICATION_DATABASE_URL");

export const eventTrackingPrisma =
  globalForPrisma.eventTrackingPrisma ??
  createPrismaClient(eventTrackingDatabaseUrl);

// Keep `prisma` as the tracking client so existing IAP/event/review code remains compatible.
export const prisma = eventTrackingPrisma;

// Without a notification URL, reuse the tracking client for backward compatibility.
export const notificationPrisma =
  globalForPrisma.notificationPrisma ??
  (notificationDatabaseUrl
    ? createPrismaClient(notificationDatabaseUrl)
    : eventTrackingPrisma);

globalForPrisma.eventTrackingPrisma = eventTrackingPrisma;
globalForPrisma.notificationPrisma = notificationPrisma;
