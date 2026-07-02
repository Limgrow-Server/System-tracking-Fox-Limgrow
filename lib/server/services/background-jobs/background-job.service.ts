import "server-only";

import type {
  BackgroundJob,
  BackgroundJobStatus,
  BackgroundJobType,
  Prisma,
  ReviewFetchRunStatus,
} from "@prisma/client";

import type { ConsoleSession } from "@/lib/auth/rbac";
import { prisma } from "@/lib/prisma";

const ACTIVE_JOB_STATUSES: BackgroundJobStatus[] = ["QUEUED", "RUNNING"];
const RECENT_JOB_AGE_MS = 48 * 60 * 60 * 1000;

type CreateBackgroundJobInput = {
  appId?: string | null;
  appName?: string | null;
  createdBy: string;
  description?: string | null;
  lastError?: string | null;
  memberId: string;
  metadata?: Prisma.InputJsonValue;
  platform?: string | null;
  progressCurrent?: number;
  progressTotal?: number | null;
  sourceJobId?: string | null;
  sourceRunIds?: string[];
  startedAt?: Date | null;
  status?: BackgroundJobStatus;
  storeAccountName?: string | null;
  title: string;
  type: BackgroundJobType;
};

export type BackgroundJobTracking = {
  id: string;
  app_id: string | null;
  app_name: string | null;
  created_at: string;
  created_by: string;
  description: string | null;
  finished_at: string | null;
  last_error: string | null;
  metadata: unknown;
  platform: string | null;
  progress_current: number;
  progress_total: number | null;
  result_url: string | null;
  source_job_id: string | null;
  source_run_ids: string[];
  started_at: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "partial";
  store_account_name: string | null;
  title: string;
  type: "notification_send" | "review_fetch";
  updated_at: string;
};

function backgroundStatusToTracking(status: BackgroundJobStatus): BackgroundJobTracking["status"] {
  switch (status) {
    case "FAILED":
      return "failed";
    case "PARTIAL":
      return "partial";
    case "RUNNING":
      return "running";
    case "SUCCEEDED":
      return "succeeded";
    case "QUEUED":
    default:
      return "queued";
  }
}

function backgroundTypeToTracking(type: BackgroundJobType): BackgroundJobTracking["type"] {
  return type === "REVIEW_FETCH" ? "review_fetch" : "notification_send";
}

function trackingStatusToBackground(status: BackgroundJobTracking["status"]): BackgroundJobStatus {
  switch (status) {
    case "failed":
      return "FAILED";
    case "partial":
      return "PARTIAL";
    case "running":
      return "RUNNING";
    case "succeeded":
      return "SUCCEEDED";
    case "queued":
    default:
      return "QUEUED";
  }
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function isFinalStatus(status: BackgroundJobTracking["status"]) {
  return status === "succeeded" || status === "failed" || status === "partial";
}

function metadataRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function metadataString(value: unknown, key: string) {
  const field = metadataRecord(value)[key];
  return typeof field === "string" && field.trim() ? field.trim() : null;
}

function backgroundJobResultUrl(job: BackgroundJob) {
  if (job.type === "NOTIFICATION_SEND") {
    const notificationJobId =
      job.sourceJobId ?? metadataString(job.metadata, "notificationJobId");
    return notificationJobId
      ? `/notifications/history/${encodeURIComponent(notificationJobId)}`
      : "/notifications/history";
  }

  const mappingId =
    metadataString(job.metadata, "storeMappingId") ??
    metadataString(job.metadata, "mappingId");
  if (mappingId) return `/comments/${encodeURIComponent(mappingId)}`;

  return metadataString(job.metadata, "scope") === "all" ? "/comments" : null;
}

function mergeMetadata(
  current: unknown,
  next: Record<string, string | number | null>,
): Prisma.InputJsonObject {
  return {
    ...metadataRecord(current),
    ...next,
  } as Prisma.InputJsonObject;
}

function metadataChanged(current: unknown, next: unknown) {
  return JSON.stringify(metadataRecord(current)) !== JSON.stringify(metadataRecord(next));
}

function hasReviewResultUrl(job: BackgroundJob) {
  return Boolean(backgroundJobResultUrl(job));
}

function toTracking(job: BackgroundJob): BackgroundJobTracking {
  return {
    id: job.id,
    app_id: job.appId,
    app_name: job.appName,
    created_at: job.createdAt.toISOString(),
    created_by: job.createdBy,
    description: job.description,
    finished_at: iso(job.finishedAt),
    last_error: job.lastError,
    metadata: job.metadata,
    platform: job.platform,
    progress_current: job.progressCurrent,
    progress_total: job.progressTotal,
    result_url: backgroundJobResultUrl(job),
    source_job_id: job.sourceJobId,
    source_run_ids: job.sourceRunIds,
    started_at: iso(job.startedAt),
    status: backgroundStatusToTracking(job.status),
    store_account_name: job.storeAccountName,
    title: job.title,
    type: backgroundTypeToTracking(job.type),
    updated_at: job.updatedAt.toISOString(),
  };
}

export async function createBackgroundJob(input: CreateBackgroundJobInput) {
  const job = await prisma.backgroundJob.create({
    data: {
      appId: input.appId ?? null,
      appName: input.appName ?? null,
      createdBy: input.createdBy,
      description: input.description ?? null,
      lastError: input.lastError ?? null,
      memberId: input.memberId,
      metadata: input.metadata ?? {},
      platform: input.platform ?? null,
      progressCurrent: input.progressCurrent ?? 0,
      progressTotal: input.progressTotal ?? null,
      sourceJobId: input.sourceJobId ?? null,
      sourceRunIds: input.sourceRunIds ?? [],
      startedAt: input.startedAt ?? null,
      status: input.status ?? "QUEUED",
      storeAccountName: input.storeAccountName ?? null,
      title: input.title,
      type: input.type,
    },
  });

  return toTracking(job);
}

export async function attachBackgroundJobReviewRuns(input: {
  backgroundJobId: string;
  sourceRunIds: string[];
}) {
  if (!input.sourceRunIds.length) return null;

  const job = await prisma.backgroundJob.update({
    where: { id: input.backgroundJobId },
    data: {
      progressTotal: input.sourceRunIds.length,
      sourceRunIds: input.sourceRunIds,
      status: "QUEUED",
    },
  });

  return toTracking(job);
}

function notificationStatusToBackground(status: string): BackgroundJobTracking["status"] {
  switch (status) {
    case "failed":
      return "failed";
    case "sent":
      return "succeeded";
    case "sent_with_issues":
      return "partial";
    case "processing":
    case "materializing":
      return "running";
    case "queued":
    case "retrying":
    default:
      return "queued";
  }
}

async function hydrateNotificationJobs(jobs: BackgroundJob[]) {
  const sourceJobIds = jobs
    .map((job) => job.sourceJobId)
    .filter((id): id is string => Boolean(id));

  if (!sourceJobIds.length) return new Map<string, Partial<BackgroundJobTracking>>();

  const [notificationJobs, batchGroups] = await Promise.all([
    prisma.notificationJob.findMany({
      where: { id: { in: sourceJobIds } },
      select: {
        errorCount: true,
        id: true,
        sentAt: true,
        sentCount: true,
        status: true,
        updatedAt: true,
      },
    }),
    prisma.notificationJobBatch.groupBy({
      by: ["jobId", "status"],
      where: { jobId: { in: sourceJobIds } },
      _count: { _all: true },
    }),
  ]);

  const batchesByJob = new Map<string, { done: number; total: number }>();
  for (const batch of batchGroups) {
    const current = batchesByJob.get(batch.jobId) ?? { done: 0, total: 0 };
    const count = batch._count._all;
    current.total += count;
    if (!["queued", "retrying", "processing"].includes(batch.status)) {
      current.done += count;
    }
    batchesByJob.set(batch.jobId, current);
  }

  const hydrated = new Map<string, Partial<BackgroundJobTracking>>();
  for (const notificationJob of notificationJobs) {
    const batches = batchesByJob.get(notificationJob.id);
    const baseStatus = notificationStatusToBackground(notificationJob.status);
    const total = batches?.total ?? null;
    const status =
      baseStatus === "queued" && total && (batches?.done ?? 0) < total
        ? "running"
        : baseStatus;
    const current = isFinalStatus(status)
      ? total ?? 1
      : batches?.done ?? 0;

    hydrated.set(notificationJob.id, {
      finished_at: isFinalStatus(status) ? iso(notificationJob.sentAt ?? notificationJob.updatedAt) : null,
      last_error:
        status === "failed"
          ? "Notification worker finished with no successful targets."
          : null,
      progress_current: current,
      progress_total: total,
      status,
      updated_at: notificationJob.updatedAt.toISOString(),
    });
  }

  return hydrated;
}

function reviewRunStatusToTracking(status: ReviewFetchRunStatus): BackgroundJobTracking["status"] {
  switch (status) {
    case "FAILED":
      return "failed";
    case "PARTIAL":
      return "partial";
    case "RUNNING":
      return "running";
    case "SUCCEEDED":
      return "succeeded";
    case "PENDING":
    default:
      return "queued";
  }
}

async function hydrateReviewJobs(jobs: BackgroundJob[]) {
  const runIds = Array.from(
    new Set(jobs.flatMap((job) => job.sourceRunIds).filter(Boolean)),
  );

  if (!runIds.length) return new Map<string, Partial<BackgroundJobTracking>>();

  const runs = await prisma.reviewFetchRun.findMany({
    where: { id: { in: runIds } },
    select: {
      errorMessage: true,
      appTarget: {
        select: {
          androidStoreMappingId: true,
          iosStoreMappingId: true,
        },
      },
      finishedAt: true,
      id: true,
      startedAt: true,
      status: true,
      platform: true,
      updatedAt: true,
    },
  });
  const runById = new Map(runs.map((run) => [run.id, run]));
  const hydrated = new Map<string, Partial<BackgroundJobTracking>>();

  for (const job of jobs) {
    const jobRuns = job.sourceRunIds.flatMap((id) => {
      const run = runById.get(id);
      return run ? [run] : [];
    });

    if (!jobRuns.length) continue;

    const statuses = jobRuns.map((run) => reviewRunStatusToTracking(run.status));
    const total = jobRuns.length;
    const done = statuses.filter(isFinalStatus).length;
    const hasRunning = statuses.some((status) => status === "running");
    const hasQueued = statuses.some((status) => status === "queued");
    const hasSucceeded = statuses.some((status) => status === "succeeded");
    const hasPartial = statuses.some((status) => status === "partial");
    const hasFailed = statuses.some((status) => status === "failed");
    const status: BackgroundJobTracking["status"] = hasRunning
      ? "running"
      : hasQueued
        ? "queued"
        : hasPartial || (hasFailed && hasSucceeded)
          ? "partial"
          : hasFailed
            ? "failed"
            : "succeeded";
    const newestRun = jobRuns.reduce((latest, run) =>
      run.updatedAt > latest.updatedAt ? run : latest,
    );
    const firstStartedAt = jobRuns
      .map((run) => run.startedAt)
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => left.getTime() - right.getTime())[0];
    const latestFinishedAt = jobRuns
      .map((run) => run.finishedAt)
      .filter((value): value is Date => Boolean(value))
      .sort((left, right) => right.getTime() - left.getTime())[0];
    const failedRun = jobRuns.find((run) => run.errorMessage);
    const mappingIds = Array.from(
      new Set(
        jobRuns
          .map((run) =>
            run.platform === "IOS"
              ? run.appTarget.iosStoreMappingId
              : run.appTarget.androidStoreMappingId,
          )
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const metadata =
      mappingIds.length === 1
        ? mergeMetadata(job.metadata, {
            mappingId: mappingIds[0],
            storeMappingId: mappingIds[0],
          })
        : mappingIds.length > 1
          ? mergeMetadata(job.metadata, { scope: "all" })
          : undefined;

    hydrated.set(job.id, {
      finished_at: isFinalStatus(status) ? iso(latestFinishedAt ?? newestRun.updatedAt) : null,
      last_error: failedRun?.errorMessage ?? null,
      progress_current: done,
      progress_total: total,
      started_at: iso(firstStartedAt),
      status,
      ...(metadata ? { metadata } : {}),
      updated_at: newestRun.updatedAt.toISOString(),
    });
  }

  return hydrated;
}

async function persistHydratedJob(
  job: BackgroundJob,
  hydrated: Partial<BackgroundJobTracking>,
) {
  const nextStatus = hydrated.status
    ? trackingStatusToBackground(hydrated.status)
    : job.status;
  const nextProgressCurrent = hydrated.progress_current ?? job.progressCurrent;
  const nextProgressTotal =
    hydrated.progress_total === undefined
      ? job.progressTotal
      : hydrated.progress_total;
  const nextLastError =
    hydrated.last_error === undefined ? job.lastError : hydrated.last_error;
  const nextMetadata =
    hydrated.metadata === undefined ? job.metadata : hydrated.metadata;
  const nextStartedAt = hydrated.started_at
    ? new Date(hydrated.started_at)
    : job.startedAt;
  const nextFinishedAt = hydrated.finished_at
    ? new Date(hydrated.finished_at)
    : null;

  const changed =
    nextStatus !== job.status ||
    nextProgressCurrent !== job.progressCurrent ||
    nextProgressTotal !== job.progressTotal ||
    nextLastError !== job.lastError ||
    metadataChanged(job.metadata, nextMetadata) ||
    Number(nextStartedAt) !== Number(job.startedAt) ||
    Number(nextFinishedAt) !== Number(job.finishedAt);

  if (!changed) return job;

  return prisma.backgroundJob.update({
    where: { id: job.id },
    data: {
      finishedAt: nextFinishedAt,
      lastError: nextLastError,
      metadata: nextMetadata as Prisma.InputJsonValue,
      progressCurrent: nextProgressCurrent,
      progressTotal: nextProgressTotal,
      startedAt: nextStartedAt,
      status: nextStatus,
    },
  });
}

export async function listBackgroundJobsForSession(session: ConsoleSession) {
  const recentCutoff = new Date(Date.now() - RECENT_JOB_AGE_MS);
  const jobs = await prisma.backgroundJob.findMany({
    where: {
      memberId: session.memberId,
      OR: [
        { status: { in: ACTIVE_JOB_STATUSES } },
        { updatedAt: { gte: recentCutoff } },
      ],
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: 30,
  });

  const activeJobs = jobs.filter((job) => ACTIVE_JOB_STATUSES.includes(job.status));
  const reviewJobsNeedingDestination = jobs.filter((job) =>
    job.type === "REVIEW_FETCH" && !hasReviewResultUrl(job),
  );
  const reviewHydrationTargets = Array.from(
    new Map(
      [...activeJobs.filter((job) => job.type === "REVIEW_FETCH"), ...reviewJobsNeedingDestination]
        .map((job) => [job.id, job]),
    ).values(),
  );

  const [notificationHydration, reviewHydration] = await Promise.all([
    hydrateNotificationJobs(activeJobs.filter((job) => job.type === "NOTIFICATION_SEND")),
    hydrateReviewJobs(reviewHydrationTargets),
  ]);

  const refreshedJobs = await Promise.all(
    jobs.map((job) => {
      const hydrated =
        job.type === "NOTIFICATION_SEND"
          ? notificationHydration.get(job.sourceJobId ?? "")
          : reviewHydration.get(job.id);
      return hydrated ? persistHydratedJob(job, hydrated) : job;
    }),
  );

  const data = refreshedJobs
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
    .map(toTracking);
  const activeCount = data.filter((job) =>
    job.status === "queued" || job.status === "running",
  ).length;

  return {
    activeCount,
    data,
    total: data.length,
    updatedAt: new Date().toISOString(),
  };
}

export async function updateBackgroundJobBySourceJob(input: {
  finishedAt?: Date | null;
  lastError?: string | null;
  progressCurrent?: number;
  progressTotal?: number | null;
  sourceJobId: string;
  status?: BackgroundJobStatus;
}) {
  const data: Prisma.BackgroundJobUpdateManyMutationInput = {};

  if (input.progressCurrent !== undefined) {
    data.progressCurrent = input.progressCurrent;
  }
  if (input.progressTotal !== undefined) {
    data.progressTotal = input.progressTotal;
  }
  if (input.status) {
    data.status = input.status;
    if (input.status === "RUNNING") {
      data.startedAt = new Date();
    }
  }
  if (input.lastError !== undefined) {
    data.lastError = input.lastError;
  }
  if (input.finishedAt !== undefined) {
    data.finishedAt = input.finishedAt;
  }

  if (!Object.keys(data).length) return { count: 0 };

  return prisma.backgroundJob.updateMany({
    where: { sourceJobId: input.sourceJobId },
    data,
  });
}

export function backgroundJobLabel(job: BackgroundJobTracking) {
  if (job.type === "notification_send") {
    return job.app_name ? `Notification · ${job.app_name}` : "Notification send";
  }

  return job.app_name ? `Comment fetch · ${job.app_name}` : "Comment fetch";
}
