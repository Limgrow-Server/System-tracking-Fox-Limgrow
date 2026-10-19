import "server-only";

import { randomUUID } from "node:crypto";

import type {
  ReviewFetchSchedule,
  ReviewFetchRunStatus,
  ReviewFetchScheduleStatus,
} from "@prisma/client";

import { badRequest, notFound } from "@/lib/server/api/errors";
import {
  claimPendingAndroidReviewFetchRuns,
  deleteOldAndroidReviewFetchRuns,
  enqueueScheduledAndroidReviewFetchRuns,
  getActiveAndroidReviewMappings,
  recoverStaleAndroidReviewFetchRuns,
  recoverStaleAndroidReviewSyncStates,
  retryAndroidReviewFetchRun,
} from "@/lib/server/repositories/reviews/android-review.repository";
import {
  claimPendingIosReviewFetchRuns,
  deleteOldIosReviewFetchRuns,
  enqueueScheduledIosReviewFetchRuns,
  getActiveIosReviewMappings,
  recoverStaleIosReviewFetchRuns,
  recoverStaleIosReviewSyncStates,
  retryIosReviewFetchRun,
} from "@/lib/server/repositories/reviews/ios-review.repository";
import {
  claimDueReviewFetchSchedules,
  deleteGlobalReviewFetchSchedule,
  finishReviewFetchScheduleRun,
  getGlobalReviewFetchSchedule,
  markReviewFetchSchedulesMaterialized,
  updateGlobalReviewFetchScheduleStatus,
  upsertGlobalReviewFetchSchedule,
} from "@/lib/server/repositories/reviews/review.repository";
import { cleanText } from "@/lib/server/services/credentials/credential.shared";
import { processClaimedAndroidReviewFetchRun } from "@/lib/server/services/reviews/android-review-fetch.service";
import { processClaimedIosReviewFetchRun } from "@/lib/server/services/reviews/ios-review-fetch.service";
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

  const schedule = await upsertGlobalReviewFetchSchedule({
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
  const current = await getGlobalReviewFetchSchedule();
  if (!current) throw notFound("Review fetch schedule was not found.");

  const schedule = await updateGlobalReviewFetchScheduleStatus({
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
  await deleteGlobalReviewFetchSchedule().catch((error: unknown) => {
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
  const schedules = await claimDueReviewFetchSchedules({
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

  const [androidMappings, iosMappings] = await Promise.all([
    getActiveAndroidReviewMappings(),
    getActiveIosReviewMappings(),
  ]);
  const androidJobs = schedules.flatMap((schedule) => {
    const scheduledFor = schedule.nextRunAt ?? now;

    return androidMappings.map((mapping) => ({
      maxAttempts: SCHEDULED_REVIEW_FETCH_MAX_ATTEMPTS,
      maxResults: SCHEDULED_REVIEW_FETCH_MAX_RESULTS,
      nextAttemptAt: now,
      scheduledFor,
      sourceScheduleId: schedule.id,
      storeMappingId: mapping.id,
    }));
  });
  const iosJobs = schedules.flatMap((schedule) => {
    const scheduledFor = schedule.nextRunAt ?? now;

    return iosMappings.map((mapping) => ({
      maxAttempts: SCHEDULED_REVIEW_FETCH_MAX_ATTEMPTS,
      maxResults: SCHEDULED_REVIEW_FETCH_MAX_RESULTS,
      nextAttemptAt: now,
      scheduledFor,
      sourceScheduleId: schedule.id,
      storeMappingId: mapping.id,
    }));
  });
  const [androidEnqueueResult, iosEnqueueResult] = await Promise.all([
    enqueueScheduledAndroidReviewFetchRuns(androidJobs),
    enqueueScheduledIosReviewFetchRuns(iosJobs),
  ]);

  await markReviewFetchSchedulesMaterialized(
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
    enqueued: androidEnqueueResult.count + iosEnqueueResult.count,
    schedules: [
      ...androidJobs.map((job) => {
        const mapping = androidMappings.find(
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
          platform: "android",
          scheduleId: job.sourceScheduleId,
          scheduledFor: job.scheduledFor.toISOString(),
          storeMappingId: job.storeMappingId,
        };
      }),
      ...iosJobs.map((job) => {
        const mapping = iosMappings.find(
          (candidate) => candidate.id === job.storeMappingId,
        );
        const schedule = schedules.find(
          (candidate) => candidate.id === job.sourceScheduleId,
        );

        return {
          appName: mapping?.appName ?? "Unknown app",
          bundleId: mapping?.bundleId ?? null,
          intervalHours: schedule?.intervalHours ?? DEFAULT_REVIEW_FETCH_INTERVAL_HOURS,
          nextRunAt: schedule
            ? nextIntervalReviewFetchRunAt(
                schedule.intervalHours,
                schedule.nextRunAt ?? now,
                now,
              ).toISOString()
            : null,
          platform: "ios",
          scheduleId: job.sourceScheduleId,
          scheduledFor: job.scheduledFor.toISOString(),
          storeMappingId: job.storeMappingId,
        };
      }),
    ],
  };
}

async function processAndroidReviewFetchJob(
  run: Awaited<ReturnType<typeof claimPendingAndroidReviewFetchRuns>>[number],
) {
  const startedAt = run.startedAt ?? new Date();

  try {
    const result = await processClaimedAndroidReviewFetchRun(run, {
      maxResults: run.maxResults || SCHEDULED_REVIEW_FETCH_MAX_RESULTS,
    });
    const lastStatus = resultStatus(result.status);

    if (run.sourceScheduleId) {
      await finishReviewFetchScheduleRun(run.sourceScheduleId, {
        lastRunAt: startedAt,
        lastStatus,
      });
    }

    return {
      appName: run.storeMapping.appName,
      packageName: run.storeMapping.packageName,
      platform: "android",
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
        platform: "android",
        runId: run.id,
        scheduleId: run.sourceScheduleId,
        status: "retrying",
        storeMappingId: run.storeMappingId,
      };
    }

    if (run.sourceScheduleId) {
      await finishReviewFetchScheduleRun(run.sourceScheduleId, {
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
      platform: "android",
      runId: run.id,
      scheduleId: run.sourceScheduleId,
      status: "failed",
      storeMappingId: run.storeMappingId,
    };
  }
}

async function processIosReviewFetchJob(
  run: Awaited<ReturnType<typeof claimPendingIosReviewFetchRuns>>[number],
) {
  const startedAt = run.startedAt ?? new Date();

  try {
    const result = await processClaimedIosReviewFetchRun(run, {
      maxResults: run.maxResults || SCHEDULED_REVIEW_FETCH_MAX_RESULTS,
    });
    const lastStatus = resultStatus(result.status);

    if (run.sourceScheduleId) {
      await finishReviewFetchScheduleRun(run.sourceScheduleId, {
        lastRunAt: startedAt,
        lastStatus,
      });
    }

    return {
      appName: run.storeMapping.appName,
      bundleId: run.storeMapping.bundleId,
      platform: "ios",
      result,
      runId: run.id,
      scheduleId: run.sourceScheduleId,
      status: lastStatus.toLowerCase(),
      storeMappingId: run.storeMappingId,
    };
  } catch (error) {
    const message = errorMessage(error, "Scheduled iOS review fetch failed.");
    const canRetry =
      retryableReviewFetchError(error) && run.attemptCount < run.maxAttempts;

    if (canRetry) {
      const nextAttemptAt = new Date(Date.now() + RETRY_DELAY_MS);
      await retryIosReviewFetchRun(run.id, {
        errorCode: "fetch_app_store_reviews_retry",
        errorMessage: message,
        nextAttemptAt,
      });

      return {
        appName: run.storeMapping.appName,
        bundleId: run.storeMapping.bundleId,
        error: message,
        nextAttemptAt: nextAttemptAt.toISOString(),
        platform: "ios",
        runId: run.id,
        scheduleId: run.sourceScheduleId,
        status: "retrying",
        storeMappingId: run.storeMappingId,
      };
    }

    if (run.sourceScheduleId) {
      await finishReviewFetchScheduleRun(run.sourceScheduleId, {
        errorCode: "fetch_app_store_reviews_failed",
        errorMessage: message,
        lastRunAt: startedAt,
        lastStatus: "FAILED",
      });
    }

    return {
      appName: run.storeMapping.appName,
      bundleId: run.storeMapping.bundleId,
      error: message,
      platform: "ios",
      runId: run.id,
      scheduleId: run.sourceScheduleId,
      status: "failed",
      storeMappingId: run.storeMappingId,
    };
  }
}

async function processReviewFetchJob(
  run:
    | Awaited<ReturnType<typeof claimPendingAndroidReviewFetchRuns>>[number]
    | Awaited<ReturnType<typeof claimPendingIosReviewFetchRuns>>[number],
) {
  if ("packageName" in run.storeMapping) {
    return processAndroidReviewFetchJob(
      run as Awaited<ReturnType<typeof claimPendingAndroidReviewFetchRuns>>[number],
    );
  }

  return processIosReviewFetchJob(
    run as Awaited<ReturnType<typeof claimPendingIosReviewFetchRuns>>[number],
  );
}

async function runPendingReviewFetchJobs() {
  const processed = [];
  let claimed = 0;

  for (let batch = 0; batch < REVIEW_FETCH_WORKER_MAX_BATCHES; batch += 1) {
    const now = new Date();
    const lockedBy = `review-fetch-worker-${randomUUID()}`;
    const androidJobs = await claimPendingAndroidReviewFetchRuns({
      limit: REVIEW_FETCH_WORKER_CONCURRENCY,
      lockedBy,
      now,
    });
    const iosLimit = Math.max(
      0,
      REVIEW_FETCH_WORKER_CONCURRENCY - androidJobs.length,
    );
    const iosJobs = iosLimit
      ? await claimPendingIosReviewFetchRuns({
          limit: iosLimit,
          lockedBy,
          now,
        })
      : [];
    const jobs = [...androidJobs, ...iosJobs];

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
  const [androidStaleRuns, iosStaleRuns] = await Promise.all([
    recoverStaleAndroidReviewFetchRuns({
      errorCode: "stale_review_fetch_lock",
      errorMessage: "Review fetch worker lock expired before the job finished.",
      nextAttemptAt: now,
      staleBefore: new Date(now.getTime() - RUN_LOCK_TTL_MS),
    }),
    recoverStaleIosReviewFetchRuns({
      errorCode: "stale_review_fetch_lock",
      errorMessage: "Review fetch worker lock expired before the job finished.",
      nextAttemptAt: now,
      staleBefore: new Date(now.getTime() - RUN_LOCK_TTL_MS),
    }),
  ]);
  const [androidStaleSyncStates, iosStaleSyncStates] = await Promise.all([
    recoverStaleAndroidReviewSyncStates({
      errorCode: "stale_review_fetch_sync_state",
      errorMessage: "Review fetch sync state lock expired before cleanup finished.",
      finishedAt: now,
      staleBefore: new Date(now.getTime() - RUN_LOCK_TTL_MS),
    }),
    recoverStaleIosReviewSyncStates({
      errorCode: "stale_review_fetch_sync_state",
      errorMessage: "Review fetch sync state lock expired before cleanup finished.",
      finishedAt: now,
      staleBefore: new Date(now.getTime() - RUN_LOCK_TTL_MS),
    }),
  ]);
  const materialized = await materializeDueReviewFetchSchedules(now);
  const worker = await runPendingReviewFetchJobs();
  const retentionBefore = new Date(
    now.getTime() - FETCH_RUN_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  const [androidRetention, iosRetention] = await Promise.all([
    deleteOldAndroidReviewFetchRuns({
      before: retentionBefore,
    }),
    deleteOldIosReviewFetchRuns({
      before: retentionBefore,
    }),
  ]);

  return {
    checkedAt: now.toISOString(),
    materialized,
    retention: {
      androidDeleted: androidRetention.count,
      deleted: androidRetention.count + iosRetention.count,
      days: FETCH_RUN_RETENTION_DAYS,
      iosDeleted: iosRetention.count,
    },
    stale: {
      runs: {
        android: androidStaleRuns,
        ios: iosStaleRuns,
      },
      syncStates: androidStaleSyncStates.count + iosStaleSyncStates.count,
    },
    worker,
  };
}

