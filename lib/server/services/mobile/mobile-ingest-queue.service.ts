import "server-only";

import { createHash, randomUUID } from "crypto";
import { appendFile, mkdir, readFile, rename, unlink } from "node:fs/promises";
import path from "node:path";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { normalizeAppId } from "@/lib/tracking/identity";
import { badRequest } from "@/lib/server/api/errors";
import {
  handleDeviceTokenRequest,
  type DeviceTokenRequest,
} from "@/lib/server/services/mobile/device-token.service";
import {
  clean,
  normalizeBundleId,
  normalizeDeviceId,
  normalizePackageName,
  type MobilePlatform,
} from "@/lib/server/services/mobile/mobile-shared";
import {
  handleNotificationEventRequest,
  type NotificationEventRequest,
} from "@/lib/server/services/mobile/notification-event.service";

type MobileIngestEndpoint = "device_token" | "notification_event";

type ClaimRow = {
  action: string | null;
  attempt_count: number;
  endpoint: MobileIngestEndpoint;
  id: string;
  max_attempts: number;
  payload: Prisma.JsonValue;
  platform: string | null;
};

const DEFAULT_MOBILE_INGEST_BATCH_SIZE = 200;
const DEFAULT_MOBILE_INGEST_CONCURRENCY = 4;
const DEFAULT_MOBILE_INGEST_LOCK_TTL_MS = 10 * 60_000;
const DEFAULT_MOBILE_INGEST_MAX_ATTEMPTS = 5;
const DEFAULT_MOBILE_INGEST_SPOOL_DRAIN_LIMIT = 200;

type EnqueuedMobileIngestEvent = {
  id: string;
  spooled?: boolean;
};

type MobileIngestQueueInput = {
  action?: string | null;
  dedupeKey: string;
  endpoint: MobileIngestEndpoint;
  payload: Prisma.InputJsonValue;
  platform?: string | null;
};

type SpoolRow = MobileIngestQueueInput & {
  id: string;
  spooledAt: string;
};

function intEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function mobileIngestBatchSize() {
  return intEnv("MOBILE_INGEST_BATCH_SIZE", DEFAULT_MOBILE_INGEST_BATCH_SIZE, 10, 1000);
}

function mobileIngestConcurrency() {
  return intEnv("MOBILE_INGEST_CONCURRENCY", DEFAULT_MOBILE_INGEST_CONCURRENCY, 1, 16);
}

function mobileIngestMaxAttempts() {
  return intEnv("MOBILE_INGEST_MAX_ATTEMPTS", DEFAULT_MOBILE_INGEST_MAX_ATTEMPTS, 1, 20);
}

function mobileIngestLockTtlMs() {
  return intEnv("MOBILE_INGEST_LOCK_TTL_MS", DEFAULT_MOBILE_INGEST_LOCK_TTL_MS, 60_000, 60 * 60_000);
}

function mobileIngestSpoolDrainLimit() {
  return intEnv(
    "MOBILE_INGEST_SPOOL_DRAIN_LIMIT",
    DEFAULT_MOBILE_INGEST_SPOOL_DRAIN_LIMIT,
    1,
    5000,
  );
}

function mobileIngestSpoolPath() {
  return path.resolve(
    process.env.MOBILE_INGEST_SPOOL_PATH?.trim()
      || path.join(process.cwd(), ".runtime", "mobile-ingest-events.jsonl"),
  );
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requestAppId(payload: Record<string, unknown>) {
  return normalizeAppId(payload.appId) || normalizeAppId(payload.app_id);
}

function eventPlatform(payload: Record<string, unknown>): MobilePlatform {
  if (payload.platform === "ios" || payload.platform === "android") return payload.platform;
  if (normalizeBundleId(payload.bundleId)) return "ios";
  return "android";
}

function tokenHashFromPayload(payload: Record<string, unknown>) {
  const fcmToken = clean(payload.fcmToken);
  return fcmToken ? sha256Hex(fcmToken) : "";
}

function deviceTokenDedupeKey(payload: DeviceTokenRequest, platform: MobilePlatform) {
  const record = payload as Record<string, unknown>;
  const action = clean(payload.action) || "register";
  const tokenHash = tokenHashFromPayload(record);
  const appScope = [
    requestAppId(record),
    normalizeAppId(payload.productAppId),
    platform === "android" ? normalizePackageName(payload.packageName) : normalizeBundleId(payload.bundleId),
  ].filter(Boolean).join(":");
  const target = tokenHash || normalizeDeviceId(payload.deviceId) || randomUUID();

  return `device-token:${platform}:${action}:${appScope || "unknown"}:${target}`;
}

function validateDeviceTokenIngest(payload: DeviceTokenRequest, platform: MobilePlatform) {
  if (payload.platform && payload.platform !== platform) {
    throw badRequest(`use_device_token_${payload.platform}_endpoint`);
  }

  const record = payload as Record<string, unknown>;
  const action = payload.action ?? "register";
  const hasIdentifier =
    requestAppId(record)
    || normalizeAppId(payload.productAppId)
    || (platform === "android" ? normalizePackageName(payload.packageName) : normalizeBundleId(payload.bundleId));

  if (!hasIdentifier) {
    throw badRequest(platform === "android" ? "app_id_or_package_name_required" : "app_id_or_bundle_id_required");
  }

  if ((action === "register" || action === "heartbeat") && !requestAppId(record)) {
    throw badRequest("app_id_required");
  }

  if (action === "register" && !clean(payload.fcmToken)) {
    throw badRequest("fcm_token_required");
  }
}

function notificationEventType(value: unknown) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_") || "notification_opened";
}

function notificationEventDedupeKey(payload: NotificationEventRequest) {
  const record = payload as Record<string, unknown>;
  const platform = eventPlatform(record);
  const eventType = notificationEventType(payload.eventType ?? payload.action);
  const tokenHash = tokenHashFromPayload(record);
  const notificationId =
    clean(payload.notificationJobId)
    || clean(payload.notificationId)
    || clean(payload.providerMessageId)
    || clean(payload.messageId)
    || requestAppId(record)
    || normalizeAppId(payload.productAppId)
    || normalizePackageName(payload.packageName)
    || normalizeBundleId(payload.bundleId)
    || "unknown";
  const target = tokenHash || normalizeDeviceId(payload.deviceId) || randomUUID();

  return `notification-event:${platform}:${eventType}:${notificationId}:${target}`;
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isConnectionPoolError(error: unknown) {
  const message = errorMessage(error);
  return (
    message.includes("Timed out fetching a new connection from the connection pool")
    || message.includes("Unable to start a transaction in the given time")
  );
}

async function spoolMobileIngestEvent(input: MobileIngestQueueInput): Promise<EnqueuedMobileIngestEvent> {
  const filePath = mobileIngestSpoolPath();
  const id = `spool-${randomUUID()}`;
  const row: SpoolRow = {
    ...input,
    id,
    spooledAt: new Date().toISOString(),
  };

  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(row)}\n`, "utf8");

  return { id, spooled: true };
}

async function enqueueMobileIngestEvent(
  input: MobileIngestQueueInput,
  options: { allowSpool?: boolean } = {},
): Promise<EnqueuedMobileIngestEvent> {
  const now = new Date();

  try {
    return await prisma.mobileIngestEvent.upsert({
      create: {
        action: input.action || null,
        dedupeKey: input.dedupeKey,
        endpoint: input.endpoint,
        maxAttempts: mobileIngestMaxAttempts(),
        payload: input.payload,
        platform: input.platform || null,
        status: "queued",
      },
      update: {
        action: input.action || null,
        attemptCount: 0,
        lastError: null,
        lockedAt: null,
        lockedBy: null,
        maxAttempts: mobileIngestMaxAttempts(),
        nextAttemptAt: now,
        payload: input.payload,
        platform: input.platform || null,
        processedAt: null,
        resultPayload: {},
        status: "queued",
        updatedAt: now,
      },
      where: { dedupeKey: input.dedupeKey },
    });
  } catch (error) {
    if (options.allowSpool !== false && isConnectionPoolError(error)) {
      return spoolMobileIngestEvent(input);
    }

    throw error;
  }
}

export async function enqueueDeviceTokenIngest(
  payload: DeviceTokenRequest,
  platform: MobilePlatform,
) {
  validateDeviceTokenIngest(payload, platform);

  const action = payload.action ?? "register";
  const event = await enqueueMobileIngestEvent({
    action,
    dedupeKey: deviceTokenDedupeKey(payload, platform),
    endpoint: "device_token",
    payload: payload as Prisma.InputJsonObject,
    platform,
  });

  return {
    ok: true,
    accepted: true,
    action,
    platform,
    queued: true,
    requestId: event.id,
    spooled: event.spooled === true,
  };
}

export async function enqueueNotificationEventIngest(payload: NotificationEventRequest) {
  const platform = eventPlatform(payload as Record<string, unknown>);
  const action = clean(payload.eventType) || clean(payload.action) || "notification_opened";
  const event = await enqueueMobileIngestEvent({
    action,
    dedupeKey: notificationEventDedupeKey(payload),
    endpoint: "notification_event",
    payload: payload as Prisma.InputJsonObject,
    platform,
  });

  return {
    ok: true,
    accepted: true,
    action,
    platform,
    queued: true,
    requestId: event.id,
    spooled: event.spooled === true,
  };
}

function parseSpoolLine(line: string): SpoolRow | null {
  try {
    const row = JSON.parse(line) as Partial<SpoolRow>;
    if (!row || typeof row !== "object") return null;
    if (row.endpoint !== "device_token" && row.endpoint !== "notification_event") return null;
    const dedupeKey = clean(row.dedupeKey);
    if (!dedupeKey) return null;
    if (!row.payload || typeof row.payload !== "object") return null;

    return {
      action: clean(row.action) || null,
      dedupeKey,
      endpoint: row.endpoint,
      id: clean(row.id) || `spool-${randomUUID()}`,
      payload: row.payload as Prisma.InputJsonValue,
      platform: clean(row.platform) || null,
      spooledAt: clean(row.spooledAt) || new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function drainMobileIngestSpool() {
  const filePath = mobileIngestSpoolPath();
  const processingPath = `${filePath}.${process.pid}.${Date.now()}.${randomUUID()}.processing`;

  try {
    await rename(filePath, processingPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { drained: 0, retained: 0 };
    throw error;
  }

  let retainedLines: string[] = [];
  let drained = 0;

  try {
    const content = await readFile(processingPath, "utf8");
    const lines = content.split("\n").filter((line) => line.trim());
    const drainLimit = mobileIngestSpoolDrainLimit();
    const activeLines = lines.slice(0, drainLimit);
    retainedLines = lines.slice(drainLimit);

    for (const line of activeLines) {
      const row = parseSpoolLine(line);
      if (!row) {
        continue;
      }

      try {
        await enqueueMobileIngestEvent(row, { allowSpool: false });
        drained += 1;
      } catch {
        retainedLines.push(line);
      }
    }
  } finally {
    await unlink(processingPath).catch(() => undefined);
  }

  if (retainedLines.length) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, `${retainedLines.join("\n")}\n`, "utf8");
  }

  return { drained, retained: retainedLines.length };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(concurrency, 1), items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }));

  return results;
}

async function recoverStaleMobileIngestEvents(now: Date) {
  const staleBefore = new Date(now.getTime() - mobileIngestLockTtlMs());
  const result = await prisma.mobileIngestEvent.updateMany({
    data: {
      lastError: "Mobile ingest worker lock expired before the event finished.",
      lockedAt: null,
      lockedBy: null,
      nextAttemptAt: now,
      status: "retrying",
      updatedAt: now,
    },
    where: {
      lockedAt: { lt: staleBefore },
      status: "processing",
    },
  });

  return result.count;
}

async function claimMobileIngestEvents(limit: number, lockedBy: string) {
  return prisma.$queryRaw<ClaimRow[]>`
    UPDATE public.mobile_ingest_events AS events
    SET
      attempt_count = events.attempt_count + 1,
      locked_at = now(),
      locked_by = ${lockedBy},
      status = 'processing',
      updated_at = now()
    WHERE events.id IN (
      SELECT id
      FROM public.mobile_ingest_events
      WHERE status IN ('queued', 'retrying')
        AND next_attempt_at <= now()
      ORDER BY updated_at ASC, created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      events.action,
      events.attempt_count,
      events.endpoint,
      events.id,
      events.max_attempts,
      events.payload,
      events.platform
  `;
}

function jsonPayload(value: Prisma.JsonValue) {
  return jsonRecord(value) as Record<string, unknown>;
}

function retryDelayMs(attemptCount: number) {
  return Math.min(60_000, 1000 * 2 ** Math.max(attemptCount - 1, 0));
}

function resultSummary(result: unknown) {
  const record = jsonRecord(result);
  return {
    action: clean(record.action) || null,
    matchedDevice: typeof record.matchedDevice === "boolean" ? record.matchedDevice : null,
    platform: clean(record.platform) || clean(jsonRecord(record.normalized).platform) || null,
    replacedTokenCount: Number.isFinite(Number(record.replacedTokenCount))
      ? Number(record.replacedTokenCount)
      : null,
  };
}

async function markProcessed(row: ClaimRow, result: unknown) {
  await prisma.mobileIngestEvent.update({
    data: {
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      processedAt: new Date(),
      resultPayload: resultSummary(result),
      status: "processed",
    },
    where: { id: row.id },
  });
}

async function markFailed(row: ClaimRow, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const canRetry = row.attempt_count < row.max_attempts;
  const now = new Date();

  await prisma.mobileIngestEvent.update({
    data: {
      lastError: message.slice(0, 2000),
      lockedAt: null,
      lockedBy: null,
      nextAttemptAt: canRetry
        ? new Date(now.getTime() + retryDelayMs(row.attempt_count))
        : now,
      status: canRetry ? "retrying" : "failed",
    },
    where: { id: row.id },
  });

  return {
    error: message.slice(0, 300),
    id: row.id,
    status: canRetry ? "retrying" : "failed",
  };
}

async function processMobileIngestEvent(row: ClaimRow) {
  try {
    const payload = jsonPayload(row.payload);
    const result = row.endpoint === "device_token"
      ? await handleDeviceTokenRequest(
          payload as DeviceTokenRequest,
          row.platform === "ios" ? "ios" : "android",
        )
      : await handleNotificationEventRequest(payload as NotificationEventRequest);

    await markProcessed(row, result);

    return {
      endpoint: row.endpoint,
      id: row.id,
      status: "processed",
    };
  } catch (error) {
    return markFailed(row, error);
  }
}

export async function runMobileIngestQueue(options: { limit?: number } = {}) {
  const checkedAt = new Date();
  const spool = await drainMobileIngestSpool();
  const recovered = await recoverStaleMobileIngestEvents(checkedAt);
  const limit = Math.min(Math.max(options.limit ?? mobileIngestBatchSize(), 1), 1000);
  const lockedBy = `mobile-ingest-worker-${randomUUID()}`;
  const claimed = await claimMobileIngestEvents(limit, lockedBy);
  const processed = await mapWithConcurrency(
    claimed,
    mobileIngestConcurrency(),
    processMobileIngestEvent,
  );

  return {
    checkedAt,
    claimed: claimed.length,
    processed,
    recovered,
    spool,
  };
}

export async function getMobileIngestQueueStats() {
  const rows = await prisma.mobileIngestEvent.groupBy({
    by: ["endpoint", "status"],
    _count: { _all: true },
  });

  return rows.map((row) => ({
    endpoint: row.endpoint,
    status: row.status,
    total: row._count._all,
  }));
}
