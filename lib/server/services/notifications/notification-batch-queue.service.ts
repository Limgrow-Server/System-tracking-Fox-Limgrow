import "server-only";

import { randomUUID } from "crypto";

import type { BackgroundJobStatus, NotificationJob, Prisma } from "@prisma/client";

import { firstAppId } from "@/lib/tracking/identity";
import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/server/api/errors";
import {
  createBackgroundJob,
  updateBackgroundJobBySourceJob,
} from "@/lib/server/services/background-jobs/background-job.service";
import { sendNotificationPayloadLocal } from "@/lib/server/services/notifications/local-notification-sender.service";
import { deviceTokenWhereForNotificationTarget } from "@/lib/server/services/notifications/notification.service";

const DEFAULT_DIRECT_DEVICE_LIMIT = 500;
const DEFAULT_QUEUE_BATCH_SIZE = 100;
const DEFAULT_QUEUE_CLAIM_LIMIT = 4;
const DEFAULT_QUEUE_MAX_ATTEMPTS = 3;
const DEVICE_SCAN_PAGE_SIZE = 5000;
const BATCH_CREATE_PAGE_SIZE = 100;
const LOCK_TTL_MS = 10 * 60_000;
const QUEUE_TARGET_KIND_KEY = "__notificationQueueTargetKind";
const QUEUE_MATERIALIZED_KEY = "__notificationQueueMaterialized";

type QueueActor =
  | string
  | {
      email: string;
      memberId?: string | null;
    };

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

type NotificationBatchAggregate = {
  error_count: number;
  failed_count: number;
  last_error: string | null;
  pending_count: number;
  sent_count: number;
  total_count: number;
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

function normalizeActor(actor: QueueActor) {
  if (typeof actor === "string") {
    return { email: actor, memberId: null };
  }

  return {
    email: clean(actor.email),
    memberId: clean(actor.memberId),
  };
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((item) => clean(item)).filter(Boolean)));
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

function notificationAppId(payload: Record<string, unknown>) {
  return firstAppId(payload.appId, payload.productAppId, payload.appName);
}

function buildDeviceWhere(payload: Record<string, unknown>): Prisma.DeviceTokenWhereInput {
  if (!firstAppId(payload.appId, payload.productAppId) && !clean(payload.packageName) && !clean(payload.bundleId)) {
    throw badRequest("Device queue requires device ids, app id, package name, or bundle id.");
  }

  return deviceTokenWhereForNotificationTarget(payload, { activeOnly: true });
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
      select: { id: true },
      orderBy: { id: "asc" },
      take: DEVICE_SCAN_PAGE_SIZE,
      ...(cursor ? { cursor, skip: 1 } : {}),
    });

    if (!rows.length) break;
    cursor = { id: rows[rows.length - 1].id };

    for (const row of rows) {
      const tokenId = clean(row.id);
      if (!tokenId) continue;

      currentBatch.push(tokenId);
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
  actor: QueueActor,
) {
  const normalizedActor = normalizeActor(actor);
  const notifications = normalizedNotifications(payload.notifications);
  const firstNotification = primaryNotification(notifications);
  const appId = notificationAppId(payload);
  const deviceIds = stringArray(payload.deviceIds || payload.targetValues);
  const queueTargetKind = deviceIds.length ? "device_id" : "device_token_id";
  const dataPayload = {
    ...jsonObject(payload.data),
    [QUEUE_MATERIALIZED_KEY]: false,
    [QUEUE_TARGET_KIND_KEY]: queueTargetKind,
  };
  const topicBase =
    topicSegment(payload.topicBase) ||
    appId ||
    clean(payload.appName) ||
    clean(payload.productAppId) ||
    (clean(payload.platform) === "ios" ? clean(payload.bundleId) : clean(payload.packageName)) ||
    "notification";
  const job = await prisma.notificationJob.create({
    data: {
      appId,
      appName: clean(payload.appName) || clean(payload.productAppId) || "unknown_app",
      bundleId: clean(payload.bundleId) || null,
      credentialRef: clean(payload.credentialRef) || null,
      dataPayload: dataPayload as Prisma.InputJsonValue,
      imageUrl: clean(payload.imageUrl) || null,
      localePayload: notifications as Prisma.InputJsonValue,
      message: firstNotification.message,
      packageName: clean(payload.packageName) || null,
      platform: clean(payload.platform) || "android",
      requestedBy: normalizedActor.email,
      scheduleId: clean(payload.scheduleId) || null,
      status: "queued",
      storeAccountName: clean(payload.storeAccountName) || null,
      storePlatform: clean(payload.storePlatform) || null,
      storeProfileId: clean(payload.storeProfileId) || null,
      targetType: "device",
      targetValues: deviceIds,
      title: firstNotification.title,
      topicBase,
    },
  });

  const estimatedBatchCount = deviceIds.length
    ? Math.ceil(deviceIds.length / notificationQueueBatchSize())
    : null;
  const backgroundJob = normalizedActor.memberId
    ? await createBackgroundJob({
        appId,
        appName: job.appName,
        createdBy: normalizedActor.email,
        description: deviceIds.length
          ? `${deviceIds.length} selected target(s) will be sent in the background.`
          : "Token batches will be prepared in the background before sending.",
        memberId: normalizedActor.memberId,
        metadata: {
          batchSize: notificationQueueBatchSize(),
          estimatedTargetCount: deviceIds.length || null,
          notificationJobId: job.id,
        },
        platform: job.platform,
        progressTotal: estimatedBatchCount,
        sourceJobId: job.id,
        status: "QUEUED",
        storeAccountName: job.storeAccountName,
        title: `Send notification · ${job.appName}`,
        type: "NOTIFICATION_SEND",
      })
    : null;

  return {
    backgroundJob,
    batchCount: estimatedBatchCount,
    batchSize: notificationQueueBatchSize(),
    job,
    queued: true,
    targetCount: deviceIds.length || null,
  };
}

async function claimNotificationJobsForMaterialization(limit: number) {
  const staleBefore = new Date(Date.now() - LOCK_TTL_MS);
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    with candidates as (
      select jobs.id
      from notification_jobs as jobs
      where (
          jobs.status = 'queued'
          or (jobs.status = 'materializing' and jobs.updated_at < ${staleBefore})
        )
        and jobs.target_type = 'device'
        and not exists (
          select 1
          from notification_job_batches as batches
          where batches.job_id = jobs.id
        )
      order by jobs.created_at asc
      for update skip locked
      limit ${limit}
    )
    update notification_jobs as jobs
    set status = 'materializing',
        updated_at = now()
    from candidates
    where jobs.id = candidates.id
    returning jobs.id::text
  `;
  const ids = rows.map((row) => row.id);

  if (!ids.length) return [];

  return prisma.notificationJob.findMany({
    where: { id: { in: ids } },
    orderBy: { createdAt: "asc" },
  });
}

function materializationPayloadFromJob(job: NotificationJob) {
  const dataPayload = jsonObject(job.dataPayload);

  return {
    appId: job.appId,
    appName: job.appName,
    bundleId: job.bundleId,
    credentialRef: job.credentialRef,
    data: dataPayload,
    deviceIds: job.targetValues,
    imageUrl: job.imageUrl,
    notifications: Array.isArray(job.localePayload) ? job.localePayload : [],
    packageName: job.packageName,
    platform: job.platform,
    productAppId: job.appId,
    scheduleId: job.scheduleId,
    storeAccountName: job.storeAccountName,
    storePlatform: job.storePlatform,
    storeProfileId: job.storeProfileId,
    targetType: "device",
    topicBase: job.topicBase,
  };
}

async function failMaterializedNotificationJob(jobId: string, message: string) {
  const finishedAt = new Date();

  await Promise.all([
    prisma.notificationJob.update({
      where: { id: jobId },
      data: {
        errorCount: 1,
        sentAt: finishedAt,
        status: "failed",
        targetValues: [],
      },
    }),
    updateBackgroundJobBySourceJob({
      finishedAt,
      lastError: message,
      sourceJobId: jobId,
      status: "FAILED",
    }),
  ]);
}

async function materializeNotificationJob(job: NotificationJob) {
  await updateBackgroundJobBySourceJob({
    sourceJobId: job.id,
    startedAt: new Date(),
    status: "RUNNING",
  });

  try {
    const payload = materializationPayloadFromJob(job);
    const explicitDeviceIds = stringArray(job.targetValues);
    const materialized = explicitDeviceIds.length
      ? await materializeExplicitDeviceBatches({
          deviceIds: explicitDeviceIds,
          jobId: job.id,
        })
      : await materializeDatabaseDeviceBatches({ jobId: job.id, payload });

    if (!materialized.targetCount) {
      await failMaterializedNotificationJob(
        job.id,
        "No active FCM tokens matched this notification target.",
      );

      return {
        error: "No active FCM tokens matched this notification target.",
        jobId: job.id,
        status: "failed",
      };
    }

    const dataPayload = {
      ...jsonObject(job.dataPayload),
      [QUEUE_MATERIALIZED_KEY]: true,
    };

    await Promise.all([
      prisma.notificationJob.update({
        where: { id: job.id },
        data: {
          dataPayload: dataPayload as Prisma.InputJsonValue,
          status: "queued",
          targetValues: [],
        },
      }),
      updateBackgroundJobBySourceJob({
        progressCurrent: 0,
        progressTotal: materialized.batchCount,
        sourceJobId: job.id,
        status: "RUNNING",
      }),
    ]);

    return {
      batchCount: materialized.batchCount,
      jobId: job.id,
      status: "materialized",
      targetCount: materialized.targetCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failMaterializedNotificationJob(job.id, message);

    return {
      error: message,
      jobId: job.id,
      status: "failed",
    };
  }
}

async function materializePendingNotificationJobs(limit: number) {
  const jobs = await claimNotificationJobsForMaterialization(limit);
  const materialized = [];

  for (const job of jobs) {
    materialized.push(await materializeNotificationJob(job));
  }

  return materialized;
}

async function claimNotificationBatches(limit: number) {
  const now = new Date();
  const lockedBy = `notification-worker-${randomUUID()}`;

  return prisma.$queryRaw<NotificationBatchRow[]>`
    update notification_job_batches as batches
    set
      status = 'processing',
      locked_at = ${now},
      locked_by = ${lockedBy},
      started_at = coalesce(started_at, ${now}),
      attempt_count = attempt_count + 1,
      updated_at = ${now}
    where batches.id in (
      select candidate_batches.id
      from notification_job_batches as candidate_batches
      join notification_jobs as jobs
        on jobs.id = candidate_batches.job_id
      where candidate_batches.status in ('queued', 'retrying')
        and candidate_batches.next_attempt_at <= ${now}
        and jobs.status <> 'paused'
      order by candidate_batches.next_attempt_at asc, candidate_batches.created_at asc
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

  const rows = await prisma.$queryRaw<Array<{ job_id: string }>>`
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
    returning job_id::text
  `;

  return {
    count: rows.length,
    jobIds: Array.from(new Set(rows.map((row) => row.job_id).filter(Boolean))),
  };
}

function edgePayloadFromJob(job: NotificationJob, batch: NotificationBatchRow) {
  const dataPayload = jsonObject(job.dataPayload);
  const targetKind = clean(dataPayload[QUEUE_TARGET_KIND_KEY]) === "device_token_id"
    ? "device_token_id"
    : "device_id";
  delete dataPayload[QUEUE_MATERIALIZED_KEY];
  delete dataPayload[QUEUE_TARGET_KIND_KEY];

  return {
    appId: job.appId,
    appName: job.appName,
    bundleId: job.bundleId,
    credentialRef: job.credentialRef,
    data: dataPayload,
    deviceIds: targetKind === "device_id" ? batch.target_values : [],
    deviceTokenIds: targetKind === "device_token_id" ? batch.target_values : [],
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
  return sendNotificationPayloadLocal(edgePayloadFromJob(job, batch));
}

async function updateParentJobAggregate(jobId: string) {
  const [parentJob, summaryRows] = await Promise.all([
    prisma.notificationJob.findUnique({
      where: { id: jobId },
      select: { status: true },
    }),
    prisma.$queryRaw<NotificationBatchAggregate[]>`
      select
        count(*)::int as total_count,
        count(*) filter (where status in ('queued', 'retrying', 'processing', 'paused'))::int as pending_count,
        count(*) filter (where status = 'failed')::int as failed_count,
        coalesce(sum(sent_count), 0)::int as sent_count,
        coalesce(sum(error_count), 0)::int as error_count,
        max(last_error) filter (where last_error is not null) as last_error
      from notification_job_batches
      where job_id = ${jobId}::uuid
    `,
  ]);
  if (!parentJob) return;

  const summary = summaryRows[0];
  const total = summary?.total_count ?? 0;
  const pending = summary?.pending_count ?? 0;
  const failed = summary?.failed_count ?? 0;
  const sentCount = summary?.sent_count ?? 0;
  const errorCount = summary?.error_count ?? 0;
  const complete = total > 0 && pending === 0;
  const status = parentJob.status === "paused"
    ? "paused"
    : !complete
    ? "processing"
    : failed > 0 && sentCount === 0
      ? "failed"
      : failed > 0 || errorCount > 0
        ? "sent_with_issues"
        : "sent";
  const backgroundStatus: BackgroundJobStatus = status === "paused"
    ? "QUEUED"
    : !complete
    ? "RUNNING"
    : status === "failed"
      ? "FAILED"
      : status === "sent_with_issues"
        ? "PARTIAL"
        : "SUCCEEDED";
  const finishedAt = complete && status !== "paused" ? new Date() : null;

  await Promise.all([
    prisma.notificationJob.update({
      where: { id: jobId },
      data: {
        errorCount,
        sentAt: finishedAt,
        sentCount,
        status,
        updatedAt: new Date(),
      },
    }),
    updateBackgroundJobBySourceJob({
      finishedAt,
      lastError: complete && status !== "sent" ? summary?.last_error ?? null : null,
      progressCurrent: Math.max(0, total - pending),
      progressTotal: total || null,
      sourceJobId: jobId,
      status: backgroundStatus,
    }),
  ]);
}

export async function pauseNotificationQueueJob(jobId: string) {
  const job = await prisma.notificationJob.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, targetType: true },
  });
  if (!job) throw badRequest("Notification job was not found.");
  if (job.targetType !== "device") {
    throw badRequest("Only device notification jobs can be paused.");
  }
  if (["sent", "sent_with_issues", "failed"].includes(job.status)) {
    throw badRequest("Finished notification jobs cannot be paused.");
  }

  const now = new Date();
  const [updatedBatches] = await prisma.$transaction([
    prisma.notificationJobBatch.updateMany({
      where: {
        jobId,
        status: { in: ["queued", "retrying", "processing"] },
      },
      data: {
        lockedAt: null,
        lockedBy: null,
        nextAttemptAt: now,
        status: "paused",
        updatedAt: now,
      },
    }),
    prisma.notificationJob.update({
      where: { id: jobId },
      data: {
        status: "paused",
        updatedAt: now,
      },
    }),
  ]);

  await updateBackgroundJobBySourceJob({
    finishedAt: null,
    lastError: null,
    sourceJobId: jobId,
    status: "QUEUED",
  });

  return {
    jobId,
    pausedBatchCount: updatedBatches.count,
    status: "paused",
  };
}

export async function resumeNotificationQueueJob(jobId: string) {
  const job = await prisma.notificationJob.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, targetType: true },
  });
  if (!job) throw badRequest("Notification job was not found.");
  if (job.targetType !== "device") {
    throw badRequest("Only device notification jobs can be resumed.");
  }
  if (job.status !== "paused") {
    throw badRequest("Only paused notification jobs can be resumed.");
  }

  const now = new Date();
  const [updatedBatches] = await prisma.$transaction([
    prisma.notificationJobBatch.updateMany({
      where: {
        jobId,
        status: { in: ["paused", "retrying"] },
      },
      data: {
        nextAttemptAt: now,
        status: "queued",
        updatedAt: now,
      },
    }),
    prisma.notificationJob.update({
      where: { id: jobId },
      data: {
        status: "queued",
        updatedAt: now,
      },
    }),
  ]);

  await updateBackgroundJobBySourceJob({
    finishedAt: null,
    lastError: null,
    sourceJobId: jobId,
    status: "RUNNING",
  });

  return {
    jobId,
    resumedBatchCount: updatedBatches.count,
    status: "queued",
  };
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
  if (job.status === "paused") {
    const now = new Date();
    await prisma.notificationJobBatch.update({
      where: { id: batch.id },
      data: {
        lockedAt: null,
        lockedBy: null,
        nextAttemptAt: now,
        status: "paused",
        updatedAt: now,
      },
    });
    await updateParentJobAggregate(batch.job_id);

    return {
      batchId: batch.id,
      status: "paused",
    };
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
  await Promise.all(recovered.jobIds.map((jobId) => updateParentJobAggregate(jobId)));
  const materialized = await materializePendingNotificationJobs(limit);
  const batches = await claimNotificationBatches(limit);
  const processed = [];

  for (const batch of batches) {
    processed.push(await processNotificationBatch(batch));
  }

  return {
    checkedAt: now.toISOString(),
    claimed: batches.length,
    materialized,
    processed,
    recovered: recovered.count,
  };
}
