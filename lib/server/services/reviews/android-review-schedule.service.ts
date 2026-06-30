import "server-only";

import { randomUUID } from "node:crypto";

import type {
  ReviewFetchSchedule,
  ReviewFetchRunStatus,
  ReviewFetchScheduleStatus,
} from "@prisma/client";

import { badRequest, notFound } from "@/lib/server/api/errors";
import {
  claimDueAndroidReviewFetchSchedules,
  claimPendingAndroidReviewFetchRuns,
  deleteGlobalAndroidReviewFetchSchedule,
  deleteOldAndroidReviewFetchRuns,
  enqueueScheduledAndroidReviewFetchRuns,
  finishAndroidReviewFetchScheduleRun,
  getActiveAndroidReviewMappings,
  getGlobalAndroidReviewFetchSchedule,
  markAndroidReviewFetchSchedulesMaterialized,
  recoverStaleAndroidReviewFetchRuns,
  recoverStaleAndroidReviewSyncStates,
  retryAndroidReviewFetchRun,
  updateGlobalAndroidReviewFetchScheduleStatus,
  upsertGlobalAndroidReviewFetchSchedule,
} from "@/lib/server/repositories/reviews/android-review.repository";
import { cleanText } from "@/lib/server/services/credentials/credential.shared";
import { processClaimedAndroidReviewFetchRun } from "@/lib/server/services/reviews/android-review-fetch.service";
import type { ReviewFetchScheduleDto } from "@/lib/tracking/page-data";

const DEFAULT_REVIEW_FETCH_INTERVAL_HOURS = 8;
const MIN_REVIEW_FETCH_INTERVAL_HOURS = 1;
const MAX_REVIEW_FETCH_INTERVAL_HOURS = 24;
const SCHEDULED_REVIEW_FETCH_MAX_RESULTS = 100;
const SCHEDULED_REVIEW_FETCH_MAX_ATTEMPTS = 3;
const SCHEDULE_LOCK_TTL_MS = 15 * 60 * 1000;
const RUN_LOCK_TTL_MS = 15 * 60 * 1000;
const FETCH_RUN_RETENTION_DAYS = 7;
const REVIEW_FETCH_WORKER_CONCURRENCY = 5;
const REVIEW_FETCH_WORKER_MAX_BATCHES = 10;
const RETRY_DELAY_MS = 5 * 60 * 1000;

export type SaveReviewFetchSchedulePayload = {
  intervalHours?: unknown;
  status?: unknown;
};

export type UpdateReviewFetchScheduleStatusPayload = {
  status?: unknown;
};

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function normalizeIntervalHours(value: unknown) {
  const parsed = Number(value ?? DEFAULT_REVIEW_FETCH_INTERVAL_HOURS);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw badRequest("Schedule interval must be a whole number of hours.");
  }
  if (
    parsed < MIN_REVIEW_FETCH_INTERVAL_HOURS ||
    parsed > MAX_REVIEW_FETCH_INTERVAL_HOURS
  ) {
    throw badRequest(
      `Schedule interval must be between ${MIN_REVIEW_FETCH_INTERVAL_HOURS} and ${MAX_REVIEW_FETCH_INTERVAL_HOURS} hours.`,
    );
  }

  return parsed;
}

function normalizeScheduleStatus(value: unknown): ReviewFetchScheduleStatus {
  const status = cleanText(value).toLowerCase();
  if (!status || status === "active") return "ACTIVE";
  if (status === "paused") return "PAUSED";
  throw badRequest("Schedule status must be active or paused.");
}

function nextIntervalReviewFetchRunAt(
  intervalHours: number,
  scheduledFor: Date,
  now = new Date(),
) {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  let nextRunAt = new Date(scheduledFor.getTime() + intervalMs);

  while (nextRunAt.getTime() <= now.getTime()) {
    nextRunAt = new Date(nextRunAt.getTime() + intervalMs);
  }

  return nextRunAt;
}

export function reviewFetchScheduleDto(
  schedule: ReviewFetchSchedule | null,
): ReviewFetchScheduleDto | null {
  if (!schedule) return null;

  return {
    id: schedule.id,
    intervalHours: schedule.intervalHours,
    lastErrorCode: schedule.lastErrorCode,
    lastErrorMessage: schedule.lastErrorMessage,
    lastRunAt: iso(schedule.lastRunAt),
    lastStatus: schedule.lastStatus ? schedule.lastStatus.toLowerCase() : null,
    nextRunAt: iso(schedule.nextRunAt),
    runCount: schedule.runCount,
    status: schedule.status.toLowerCase(),
    updatedAt: schedule.updatedAt.toISOString(),
    updatedBy: schedule.updatedBy,
  };
}

function normalizeScheduleSettings(payload: SaveReviewFetchSchedulePayload) {
  return {
    intervalHours: normalizeIntervalHours(payload.intervalHours),
    status: normalizeScheduleStatus(payload.status),
  };
}

export async function saveReviewFetchSchedule(
  payload: SaveReviewFetchSchedulePayload,
  authEmail: string,
) {
  const normalized = normalizeScheduleSettings(payload);
  const now = new Date();

  const schedule = await upsertGlobalAndroidReviewFetchSchedule({
    createdBy: authEmail,
    intervalHours: normalized.intervalHours,
    nextRunAt: now,
    status: normalized.status,
    updatedBy: authEmail,
  });

  return {
    message: "Review fetch schedule has been saved.",
    schedule: reviewFetchScheduleDto(schedule),
  };
}

export async function updateReviewFetchScheduleStatus(
  payload: UpdateReviewFetchScheduleStatusPayload,
  authEmail: string,
) {
  const status = normalizeScheduleStatus(payload.status);
  const current = await getGlobalAndroidReviewFetchSchedule();
  if (!current) throw notFound("Review fetch schedule was not found.");

  const schedule = await updateGlobalAndroidReviewFetchScheduleStatus({
    nextRunAt: status === "ACTIVE" ? new Date() : undefined,
    status,
    updatedBy: authEmail,
  });

  return {
    message: "Review fetch schedule status has been updated.",
    schedule: reviewFetchScheduleDto(schedule),
  };
}

export async function removeReviewFetchSchedule() {
  await deleteGlobalAndroidReviewFetchSchedule().catch((error: unknown) => {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2025"
    ) {
      throw notFound("Review fetch schedule was not found.");
    }
    throw error;
  });

  return {
    deleted: true,
    message: "Review fetch schedule has been deleted.",
  };
}

function resultStatus(value: string): ReviewFetchRunStatus {
  if (value === "partial") return "PARTIAL";
  if (value === "succeeded") return "SUCCEEDED";
  return "FAILED";
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function retryableReviewFetchError(error: unknown) {
  const message = errorMessage(error, "").toLowerCase();
  if (
    message.includes("permission_denied") ||
    message.includes("service_disabled") ||
    message.includes("invalid") ||
    message.includes("not found")
  ) {
    return false;
  }

  return (
    message.includes("429") ||
    message.includes("rate") ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("temporarily") ||
    message.includes("unavailable") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504")
  );
}

async function materializeDueReviewFetchSchedules(now: Date) {
  const lockedBy = `review-fetch-scheduler-${randomUUID()}`;
  const schedules = await claimDueAndroidReviewFetchSchedules({
    lockedBy,
    lockStaleBefore: new Date(now.getTime() - SCHEDULE_LOCK_TTL_MS),
    now,
  });
  if (!schedules.length) {
    return {
      claimed: 0,
      enqueued: 0,
      schedules: [],
    };
  }

  const mappings = await getActiveAndroidReviewMappings();
  const jobs = schedules.flatMap((schedule) => {
    const scheduledFor = schedule.nextRunAt ?? now;

    return mappings.map((mapping) => ({
      maxAttempts: SCHEDULED_REVIEW_FETCH_MAX_ATTEMPTS,
      maxResults: SCHEDULED_REVIEW_FETCH_MAX_RESULTS,
      nextAttemptAt: now,
      scheduledFor,
      sourceScheduleId: schedule.id,
      storeMappingId: mapping.id,
    }));
  });
  const enqueueResult = await enqueueScheduledAndroidReviewFetchRuns(jobs);

  await markAndroidReviewFetchSchedulesMaterialized(
    schedules.map((schedule) => ({
      nextRunAt: nextIntervalReviewFetchRunAt(
        schedule.intervalHours,
        schedule.nextRunAt ?? now,
        now,
      ),
      scheduleId: schedule.id,
    })),
  );

  return {
    claimed: schedules.length,
    enqueued: enqueueResult.count,
    schedules: jobs.map((job) => {
      const mapping = mappings.find(
        (candidate) => candidate.id === job.storeMappingId,
      );
      const schedule = schedules.find(
        (candidate) => candidate.id === job.sourceScheduleId,
      );

      return {
        appName: mapping?.appName ?? "Unknown app",
        intervalHours: schedule?.intervalHours ?? DEFAULT_REVIEW_FETCH_INTERVAL_HOURS,
        nextRunAt: schedule
          ? nextIntervalReviewFetchRunAt(
              schedule.intervalHours,
              schedule.nextRunAt ?? now,
              now,
            ).toISOString()
          : null,
        packageName: mapping?.packageName ?? null,
        scheduleId: job.sourceScheduleId,
        scheduledFor: job.scheduledFor.toISOString(),
        storeMappingId: job.storeMappingId,
      };
    }),
  };
}

async function processReviewFetchJob(
  run: Awaited<ReturnType<typeof claimPendingAndroidReviewFetchRuns>>[number],
) {
  const startedAt = run.startedAt ?? new Date();

  try {
    const result = await processClaimedAndroidReviewFetchRun(run, {
      maxResults: run.maxResults || SCHEDULED_REVIEW_FETCH_MAX_RESULTS,
    });
    const lastStatus = resultStatus(result.status);

    if (run.sourceScheduleId) {
      await finishAndroidReviewFetchScheduleRun(run.sourceScheduleId, {
        lastRunAt: startedAt,
        lastStatus,
      });
    }

    return {
      appName: run.storeMapping.appName,
      packageName: run.storeMapping.packageName,
      result,
      runId: run.id,
      scheduleId: run.sourceScheduleId,
      status: lastStatus.toLowerCase(),
      storeMappingId: run.storeMappingId,
    };
  } catch (error) {
    const message = errorMessage(error, "Scheduled review fetch failed.");
    const canRetry =
      retryableReviewFetchError(error) && run.attemptCount < run.maxAttempts;

    if (canRetry) {
      const nextAttemptAt = new Date(Date.now() + RETRY_DELAY_MS);
      await retryAndroidReviewFetchRun(run.id, {
        errorCode: "fetch_google_play_reviews_retry",
        errorMessage: message,
        nextAttemptAt,
      });

      return {
        appName: run.storeMapping.appName,
        error: message,
        nextAttemptAt: nextAttemptAt.toISOString(),
        packageName: run.storeMapping.packageName,
        runId: run.id,
        scheduleId: run.sourceScheduleId,
        status: "retrying",
        storeMappingId: run.storeMappingId,
      };
    }

    if (run.sourceScheduleId) {
      await finishAndroidReviewFetchScheduleRun(run.sourceScheduleId, {
        errorCode: "fetch_google_play_reviews_failed",
        errorMessage: message,
        lastRunAt: startedAt,
        lastStatus: "FAILED",
      });
    }

    return {
      appName: run.storeMapping.appName,
      error: message,
      packageName: run.storeMapping.packageName,
      runId: run.id,
      scheduleId: run.sourceScheduleId,
      status: "failed",
      storeMappingId: run.storeMappingId,
    };
  }
}

async function runPendingReviewFetchJobs() {
  const processed = [];
  let claimed = 0;

  for (let batch = 0; batch < REVIEW_FETCH_WORKER_MAX_BATCHES; batch += 1) {
    const now = new Date();
    const lockedBy = `review-fetch-worker-${randomUUID()}`;
    const jobs = await claimPendingAndroidReviewFetchRuns({
      limit: REVIEW_FETCH_WORKER_CONCURRENCY,
      lockedBy,
      now,
    });
    if (!jobs.length) break;

    claimed += jobs.length;
    processed.push(...(await Promise.all(jobs.map(processReviewFetchJob))));
  }

  return {
    claimed,
    processed,
  };
}

export async function runDueReviewFetchSchedules() {
  const now = new Date();
  const staleRuns = await recoverStaleAndroidReviewFetchRuns({
    errorCode: "stale_review_fetch_lock",
    errorMessage: "Review fetch worker lock expired before the job finished.",
    nextAttemptAt: now,
    staleBefore: new Date(now.getTime() - RUN_LOCK_TTL_MS),
  });
  const staleSyncStates = await recoverStaleAndroidReviewSyncStates({
    errorCode: "stale_review_fetch_sync_state",
    errorMessage: "Review fetch sync state lock expired before cleanup finished.",
    finishedAt: now,
    staleBefore: new Date(now.getTime() - RUN_LOCK_TTL_MS),
  });
  const materialized = await materializeDueReviewFetchSchedules(now);
  const worker = await runPendingReviewFetchJobs();
  const retention = await deleteOldAndroidReviewFetchRuns({
    before: new Date(now.getTime() - FETCH_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000),
  });

  return {
    checkedAt: now.toISOString(),
    materialized,
    retention: {
      deleted: retention.count,
      days: FETCH_RUN_RETENTION_DAYS,
    },
    stale: {
      runs: staleRuns,
      syncStates: staleSyncStates.count,
    },
    worker,
  };
}
