import "server-only";

import { randomUUID } from "crypto";

import type { NotificationJob, Prisma } from "@prisma/client";

import { searchTextVariants } from "@/lib/search";
import { firstAppId } from "@/lib/tracking/identity";
import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/server/api/errors";

const DEFAULT_DIRECT_DEVICE_LIMIT = 500;
const DEFAULT_QUEUE_BATCH_SIZE = 100;
const DEFAULT_QUEUE_CLAIM_LIMIT = 4;
const DEFAULT_QUEUE_MAX_ATTEMPTS = 3;
const DEVICE_SCAN_PAGE_SIZE = 5000;
const BATCH_CREATE_PAGE_SIZE = 100;
const LOCK_TTL_MS = 10 * 60_000;

type LocaleNotification = {
  message: string;
  title: string;
  topicCode: string;
};

type NotificationBatchRow = {
  attempt_count: number;
  id: string;
  job_id: string;
  max_attempts: number;
  target_values: string[];
};

type EdgeFunctionResult = {
  errorCount?: number;
  platform?: string;
  projectId?: string | null;
  sentCount?: number;
  targetType?: string;
  topicBase?: string;
  results?: Array<Record<string, unknown>>;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function intEnv(name: string, fallback: number, min: number, max: number) {
  const parsed = Number(process.env[name]);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

export function notificationDirectDeviceLimit() {
  return intEnv("NOTIFICATION_DIRECT_DEVICE_LIMIT", DEFAULT_DIRECT_DEVICE_LIMIT, 1, 5000);
}

function notificationQueueBatchSize() {
  return intEnv("NOTIFICATION_QUEUE_BATCH_SIZE", DEFAULT_QUEUE_BATCH_SIZE, 50, 1000);
}

function notificationQueueClaimLimit() {
  return intEnv("NOTIFICATION_QUEUE_CLAIM_LIMIT", DEFAULT_QUEUE_CLAIM_LIMIT, 1, 20);
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => clean(item)).filter(Boolean)));
}

function uniqueSearchValues(values: unknown[]) {
  return Array.from(
    new Set(values.flatMap((value) => searchTextVariants(value)).map(clean).filter(Boolean)),
  );
}

function jsonObject(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function topicSegment(value: unknown) {
  return clean(value)
    .replace(/^\/topics\//i, "")
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9\-_.~%]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizedNotifications(value: unknown): LocaleNotification[] {
  const rows = Array.isArray(value) ? value : [];
  const notifications = rows
    .map((row) => {
      const record = row as Record<string, unknown>;
      return {
        enabled: record.enabled !== false,
        message: clean(record.message),
        title: clean(record.title),
        topicCode: topicSegment(record.topicCode || record.languageCode).toLowerCase(),
      };
    })
    .filter((row) => row.enabled && row.title && row.message && row.topicCode)
    .map(({ message, title, topicCode }) => ({ message, title, topicCode }));

  if (!notifications.length) {
    throw badRequest("At least one notification language is required.");
  }

  return notifications;
}

function primaryNotification(notifications: LocaleNotification[]) {
  return notifications.find((notification) => notification.topicCode === "en") ?? notifications[0];
}

function chunks<T>(items: T[], size: number) {
  const groups: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

function supabaseFunctionUrl(functionName: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "");
  if (!supabaseUrl) throw badRequest("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  return `${supabaseUrl}/functions/v1/${functionName}`;
}

function dispatchSecret() {
  return clean(process.env.NOTIFICATION_DISPATCH_SECRET) || clean(process.env.NOTIFICATION_QUEUE_SECRET);
}

function notificationAppId(payload: Record<string, unknown>) {
  return firstAppId(payload.appId, payload.productAppId, payload.appName);
}

function buildDeviceWhere(payload: Record<string, unknown>): Prisma.DeviceTokenWhereInput {
  const platform = clean(payload.platform) || "android";
  const appId = firstAppId(payload.appId, payload.productAppId);
  const appIds = uniqueSearchValues([appId]);
  const packageName = clean(payload.packageName);
  const bundleId = clean(payload.bundleId);
  const or: Prisma.DeviceTokenWhereInput[] = [];

  if (appIds.length) {
    or.push({ appId: { in: appIds } }, { productAppId: { in: appIds } });
  }
  if (packageName) {
    or.push({ packageName });
  }
  if (bundleId) {
    or.push({ bundleId });
  }
  if (!or.length) {
    throw badRequest("Device queue requires device ids, app id, package name, or bundle id.");
  }

  return {
    platform,
    status: "active",
    OR: or,
  };
}

async function createBatchRows(input: {
  jobId: string;
  rows: Array<{ batchIndex: number; targetValues: string[] }>;
}) {
  if (!input.rows.length) return;

  for (const rowBatch of chunks(input.rows, BATCH_CREATE_PAGE_SIZE)) {
    await prisma.notificationJobBatch.createMany({
      data: rowBatch.map((row) => ({
        batchIndex: row.batchIndex,
        jobId: input.jobId,
        maxAttempts: DEFAULT_QUEUE_MAX_ATTEMPTS,
        targetValues: row.targetValues,
      })),
      skipDuplicates: true,
    });
  }
}

async function materializeExplicitDeviceBatches(input: {
  deviceIds: string[];
  jobId: string;
}) {
  const batchSize = notificationQueueBatchSize();
  const rows = chunks(input.deviceIds, batchSize).map((targetValues, index) => ({
    batchIndex: index,
    targetValues,
  }));

  await createBatchRows({ jobId: input.jobId, rows });

  return {
    batchCount: rows.length,
    targetCount: input.deviceIds.length,
  };
}

async function materializeDatabaseDeviceBatches(input: {
  jobId: string;
  payload: Record<string, unknown>;
}) {
  const batchSize = notificationQueueBatchSize();
  const where = buildDeviceWhere(input.payload);
  const seen = new Set<string>();
  let cursor: { id: string } | undefined;
  let currentBatch: string[] = [];
  let pendingRows: Array<{ batchIndex: number; targetValues: string[] }> = [];
  let batchIndex = 0;
  let targetCount = 0;

  async function flushRows() {
    if (!pendingRows.length) return;
    await createBatchRows({ jobId: input.jobId, rows: pendingRows });
    pendingRows = [];
  }

  while (true) {
    const rows = await prisma.deviceToken.findMany({
      where,
      select: { deviceId: true, id: true },
      orderBy: { id: "asc" },
      take: DEVICE_SCAN_PAGE_SIZE,
      ...(cursor ? { cursor, skip: 1 } : {}),
    });

    if (!rows.length) break;
    cursor = { id: rows[rows.length - 1].id };

    for (const row of rows) {
      const deviceId = clean(row.deviceId);
      if (!deviceId || seen.has(deviceId)) continue;

      seen.add(deviceId);
      currentBatch.push(deviceId);
      targetCount += 1;

      if (currentBatch.length >= batchSize) {
        pendingRows.push({ batchIndex, targetValues: currentBatch });
        batchIndex += 1;
        currentBatch = [];
      }

      if (pendingRows.length >= BATCH_CREATE_PAGE_SIZE) {
        await flushRows();
      }
    }
  }

  if (currentBatch.length) {
    pendingRows.push({ batchIndex, targetValues: currentBatch });
    batchIndex += 1;
  }
  await flushRows();

  return {
    batchCount: batchIndex,
    targetCount,
  };
}

export async function enqueueNotificationDeviceJob(
  payload: Record<string, unknown>,
  actorEmail: string,
) {
  const notifications = normalizedNotifications(payload.notifications);
  const firstNotification = primaryNotification(notifications);
  const appId = notificationAppId(payload);
  const topicBase =
    topicSegment(payload.topicBase) ||
    appId ||
    clean(payload.appName) ||
    clean(payload.productAppId) ||
    (clean(payload.platform) === "ios" ? clean(payload.bundleId) : clean(payload.packageName)) ||
    "notification";
  const deviceIds = stringArray(payload.deviceIds || payload.targetValues);

  const job = await prisma.notificationJob.create({
    data: {
      appId,
      appName: clean(payload.appName) || clean(payload.productAppId) || "unknown_app",
      bundleId: clean(payload.bundleId) || null,
      credentialRef: clean(payload.credentialRef) || null,
      dataPayload: jsonObject(payload.data) as Prisma.InputJsonValue,
      imageUrl: clean(payload.imageUrl) || null,
      localePayload: notifications as Prisma.InputJsonValue,
      message: firstNotification.message,
      packageName: clean(payload.packageName) || null,
      platform: clean(payload.platform) || "android",
      requestedBy: actorEmail,
      scheduleId: clean(payload.scheduleId) || null,
      status: "queued",
      storeAccountName: clean(payload.storeAccountName) || null,
      storePlatform: clean(payload.storePlatform) || null,
      storeProfileId: clean(payload.storeProfileId) || null,
      targetType: "device",
      targetValues: [],
      title: firstNotification.title,
      topicBase,
    },
  });

  try {
    const materialized = deviceIds.length
      ? await materializeExplicitDeviceBatches({ deviceIds, jobId: job.id })
      : await materializeDatabaseDeviceBatches({ jobId: job.id, payload });

    if (!materialized.targetCount) {
      await prisma.notificationJob.update({
        where: { id: job.id },
        data: {
          errorCount: 1,
          status: "failed",
          sentAt: new Date(),
        },
      });
      throw badRequest("No active FCM tokens matched this notification target.");
    }

    return {
      batchCount: materialized.batchCount,
      batchSize: notificationQueueBatchSize(),
      job,
      queued: true,
      targetCount: materialized.targetCount,
    };
  } catch (error) {
    await prisma.notificationJob.update({
      where: { id: job.id },
      data: {
        errorCount: 1,
        status: "failed",
        sentAt: new Date(),
      },
    });
    throw error;
  }
}

async function claimNotificationBatches(limit: number) {
  const now = new Date();
  const lockedBy = `notification-worker-${randomUUID()}`;

  return prisma.$queryRaw<NotificationBatchRow[]>`
    update notification_job_batches
    set
      status = 'processing',
      locked_at = ${now},
      locked_by = ${lockedBy},
      started_at = coalesce(started_at, ${now}),
      attempt_count = attempt_count + 1,
      updated_at = ${now}
    where id in (
      select id
      from notification_job_batches
      where status in ('queued', 'retrying')
        and next_attempt_at <= ${now}
      order by next_attempt_at asc, created_at asc
      for update skip locked
      limit ${limit}
    )
    returning
      id::text,
      job_id::text,
      attempt_count,
      max_attempts,
      target_values
  `;
}

async function recoverStaleNotificationBatches(now: Date) {
  const staleBefore = new Date(now.getTime() - LOCK_TTL_MS);

  return prisma.$executeRaw`
    update notification_job_batches
    set
      status = case when attempt_count >= max_attempts then 'failed' else 'retrying' end,
      last_error = coalesce(last_error, 'Notification batch lock expired before completion.'),
      locked_at = null,
      locked_by = null,
      next_attempt_at = ${now},
      finished_at = case when attempt_count >= max_attempts then ${now} else finished_at end,
      updated_at = ${now}
    where status = 'processing'
      and locked_at < ${staleBefore}
  `;
}

function edgePayloadFromJob(job: NotificationJob, batch: NotificationBatchRow) {
  return {
    appId: job.appId,
    appName: job.appName,
    bundleId: job.bundleId,
    credentialRef: job.credentialRef,
    data: jsonObject(job.dataPayload),
    deviceIds: batch.target_values,
    imageUrl: job.imageUrl,
    jobId: job.id,
    notifications: Array.isArray(job.localePayload) ? job.localePayload : [],
    packageName: job.packageName,
    platform: job.platform,
    productAppId: job.appId,
    queuedBatchId: batch.id,
    scheduleId: job.scheduleId,
    storeAccountName: job.storeAccountName,
    storePlatform: job.storePlatform,
    storeProfileId: job.storeProfileId,
    targetType: "device",
    topicBase: job.topicBase,
  };
}

function compactResultPayload(result: EdgeFunctionResult) {
  const failedResults = Array.isArray(result.results)
    ? result.results
      .filter((item) => item?.ok === false)
      .slice(0, 20)
      .map((item) => ({
        deviceId: clean(item.deviceId) || null,
        error: clean(item.error) || null,
        fcmErrorCode: clean(item.fcmErrorCode) || null,
        status: Number(item.status ?? 0) || null,
        targetType: clean(item.targetType) || null,
        targetValue: clean(item.targetType) === "device" ? clean(item.deviceId) || "device-token-redacted" : clean(item.targetValue),
        topicCode: clean(item.topicCode) || null,
      }))
    : [];

  return {
    errorCount: Number(result.errorCount ?? 0),
    failedResults,
    platform: clean(result.platform) || null,
    projectId: clean(result.projectId) || null,
    sentCount: Number(result.sentCount ?? 0),
    targetType: clean(result.targetType) || null,
    topicBase: clean(result.topicBase) || null,
  };
}

async function callSendNotificationBatch(job: NotificationJob, batch: NotificationBatchRow) {
  const secret = dispatchSecret();
  if (!secret) {
    throw new Error("NOTIFICATION_DISPATCH_SECRET or NOTIFICATION_QUEUE_SECRET is required for queued notification worker.");
  }

  const response = await fetch(supabaseFunctionUrl("send-notification"), {
    method: "POST",
    headers: {
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
      "content-type": "application/json",
      "x-dispatch-secret": secret,
      "x-notification-queue-secret": secret,
    },
    body: JSON.stringify(edgePayloadFromJob(job, batch)),
  });
  const payload = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    result?: EdgeFunctionResult;
  };

  if (!response.ok || !payload.ok || !payload.result) {
    throw new Error(payload.error ?? `send-notification returned HTTP ${response.status}`);
  }

  return payload.result;
}

async function updateParentJobAggregate(jobId: string) {
  const [sum, total, pending, failed] = await Promise.all([
    prisma.notificationJobBatch.aggregate({
      where: { jobId },
      _sum: { sentCount: true, errorCount: true },
    }),
    prisma.notificationJobBatch.count({ where: { jobId } }),
    prisma.notificationJobBatch.count({
      where: {
        jobId,
        status: { in: ["queued", "retrying", "processing"] },
      },
    }),
    prisma.notificationJobBatch.count({ where: { jobId, status: "failed" } }),
  ]);
  const sentCount = sum._sum.sentCount ?? 0;
  const errorCount = sum._sum.errorCount ?? 0;
  const complete = total > 0 && pending === 0;
  const status = !complete
    ? "processing"
    : failed > 0 && sentCount === 0
      ? "failed"
      : failed > 0 || errorCount > 0
        ? "sent_with_issues"
        : "sent";

  await prisma.notificationJob.update({
    where: { id: jobId },
    data: {
      errorCount,
      sentAt: complete ? new Date() : null,
      sentCount,
      status,
      updatedAt: new Date(),
    },
  });
}

async function finishBatchSuccess(batch: NotificationBatchRow, result: EdgeFunctionResult) {
  const sentCount = Number(result.sentCount ?? 0);
  const errorCount = Number(result.errorCount ?? 0);
  const status = errorCount > 0
    ? sentCount > 0 ? "sent_with_issues" : "failed"
    : "sent";

  await prisma.notificationJobBatch.update({
    where: { id: batch.id },
    data: {
      errorCount,
      finishedAt: new Date(),
      lastError: null,
      lockedAt: null,
      lockedBy: null,
      resultPayload: compactResultPayload(result) as Prisma.InputJsonValue,
      sentCount,
      status,
    },
  });
  await updateParentJobAggregate(batch.job_id);
}

async function finishBatchFailure(batch: NotificationBatchRow, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const now = new Date();
  const canRetry = batch.attempt_count < batch.max_attempts;
  const retryDelayMs = Math.min(60 * 60_000, 2 ** Math.max(batch.attempt_count - 1, 0) * 60_000);

  await prisma.notificationJobBatch.update({
    where: { id: batch.id },
    data: {
      finishedAt: canRetry ? null : now,
      lastError: message.slice(0, 2000),
      lockedAt: null,
      lockedBy: null,
      nextAttemptAt: new Date(now.getTime() + retryDelayMs),
      status: canRetry ? "retrying" : "failed",
    },
  });
  await updateParentJobAggregate(batch.job_id);

  return {
    batchId: batch.id,
    error: message,
    retrying: canRetry,
  };
}

async function processNotificationBatch(batch: NotificationBatchRow) {
  const job = await prisma.notificationJob.findUnique({ where: { id: batch.job_id } });
  if (!job) {
    return finishBatchFailure(batch, new Error("Parent notification job was not found."));
  }

  try {
    const result = await callSendNotificationBatch(job, batch);
    await finishBatchSuccess(batch, result);
    return {
      batchId: batch.id,
      errorCount: Number(result.errorCount ?? 0),
      sentCount: Number(result.sentCount ?? 0),
      status: "processed",
    };
  } catch (error) {
    return finishBatchFailure(batch, error);
  }
}

export async function runNotificationBatchQueue(options?: { limit?: number }) {
  const now = new Date();
  const recovered = await recoverStaleNotificationBatches(now);
  const limit = Math.min(Math.max(options?.limit ?? notificationQueueClaimLimit(), 1), 20);
  const batches = await claimNotificationBatches(limit);
  const processed = [];

  for (const batch of batches) {
    processed.push(await processNotificationBatch(batch));
  }

  return {
    checkedAt: now.toISOString(),
    claimed: batches.length,
    processed,
    recovered,
  };
}
