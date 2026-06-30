import "server-only";

import {
  type AndroidStoreMapping,
  Prisma,
  type ReviewFetchRun,
  type ReviewFetchRunStatus,
  type ReviewFetchScanMode,
  type ReviewFetchSchedule,
  type ReviewFetchScheduleStatus,
  type ReviewFetchStopReason,
  type ReviewFetchTrigger,
  type ReviewReplyTemplate,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type AndroidReviewUpsertInput = {
  androidOsVersion: number | null;
  appVersionCode: number | null;
  appVersionName: string | null;
  authorName: string | null;
  developerReplyText: string | null;
  developerReplyUpdatedAt: Date | null;
  device: string | null;
  deviceMetadata: Prisma.InputJsonValue | null;
  fetchedAt: Date;
  originalText: string | null;
  rating: number | null;
  rawReview: Prisma.InputJsonValue;
  reviewId: string;
  reviewerLanguage: string | null;
  reviewText: string | null;
  storeMappingId: string;
  thumbsDownCount: number | null;
  thumbsUpCount: number | null;
  userCommentUpdatedAt: Date | null;
};

export type AndroidReviewFingerprint = {
  developerReplyText: string | null;
  developerReplyUpdatedAt: Date | null;
  rating: number | null;
  reviewId: string;
  reviewText: string | null;
  userCommentUpdatedAt: Date | null;
};

type AndroidReviewFetchScheduleUpsertInput = {
  createdBy: string;
  intervalHours: number;
  nextRunAt: Date;
  status: ReviewFetchScheduleStatus;
  updatedBy: string;
};

function nullableJson(value: Prisma.InputJsonValue | null) {
  return value === null ? Prisma.DbNull : value;
}

const REVIEW_FETCH_GLOBAL_SCOPE = "global";

export type AndroidReviewReplyTemplateRecord = Pick<
  ReviewReplyTemplate,
  | "id"
  | "isActive"
  | "rating"
  | "replyText"
  | "updatedAt"
  | "updatedBy"
> & {
  storeMappingId: string;
};

export type ClaimedAndroidReviewFetchRunRecord = ReviewFetchRun & {
  sourceSchedule: ReviewFetchSchedule | null;
  storeMapping: AndroidStoreMapping;
  storeMappingId: string;
};

async function androidReviewAppTargetId(storeMappingId: string) {
  const target = await prisma.reviewAppTarget.findUnique({
    where: { androidStoreMappingId: storeMappingId },
    select: { id: true },
  });

  if (!target) {
    throw new Error(`Review app target was not found for Android mapping ${storeMappingId}.`);
  }

  return target.id;
}

async function androidReviewAppTargetIdByMappingId(storeMappingIds: string[]) {
  const uniqueStoreMappingIds = Array.from(new Set(storeMappingIds));
  if (!uniqueStoreMappingIds.length) return new Map<string, string>();

  const targets = await prisma.reviewAppTarget.findMany({
    where: {
      androidStoreMappingId: { in: uniqueStoreMappingIds },
      platform: "ANDROID",
    },
    select: {
      androidStoreMappingId: true,
      id: true,
    },
  });

  return new Map(
    targets
      .filter((target) => target.androidStoreMappingId)
      .map((target) => [target.androidStoreMappingId!, target.id]),
  );
}

function reviewReplyTemplateRecord(
  template: ReviewReplyTemplate & {
    appTarget: { androidStoreMappingId: string | null };
  },
): AndroidReviewReplyTemplateRecord | null {
  const storeMappingId = template.appTarget.androidStoreMappingId;
  if (!storeMappingId) return null;

  return {
    id: template.id,
    isActive: template.isActive,
    rating: template.rating,
    replyText: template.replyText,
    storeMappingId,
    updatedAt: template.updatedAt,
    updatedBy: template.updatedBy,
  };
}

export function getActiveAndroidReviewMappings() {
  return prisma.androidStoreMapping.findMany({
    where: { status: "ACTIVE" },
    include: {
      reviewTarget: {
        include: {
          syncState: true,
        },
      },
      storeProfile: true,
      _count: { select: { reviews: true } },
    },
    orderBy: { appName: "asc" },
  });
}

export function getAndroidReviewMappingById(mappingId: string) {
  return prisma.androidStoreMapping.findUnique({
    where: { id: mappingId },
    include: {
      reviewTarget: {
        include: {
          syncState: true,
        },
      },
      storeProfile: true,
      _count: { select: { reviews: true } },
    },
  });
}

export function getAndroidReviewRatingGroups(mappingIds: string[]) {
  if (!mappingIds.length) return Promise.resolve([]);

  return prisma.androidStoreReview.groupBy({
    by: ["storeMappingId", "rating"],
    where: {
      storeMappingId: { in: mappingIds },
      rating: { not: null },
    },
    _count: { _all: true },
  });
}

export function getAndroidReviewReplyGroups(mappingIds: string[]) {
  if (!mappingIds.length) return Promise.resolve([]);

  return prisma.androidStoreReview.groupBy({
    by: ["storeMappingId"],
    where: {
      storeMappingId: { in: mappingIds },
      developerReplyText: { not: null },
    },
    _count: { _all: true },
  });
}

export function getAndroidReviewsForMapping(mappingId: string, take = 300) {
  return prisma.androidStoreReview.findMany({
    where: { storeMappingId: mappingId },
    orderBy: [{ userCommentUpdatedAt: "desc" }, { fetchedAt: "desc" }],
    take,
  });
}

type AndroidReviewPageOptions = {
  rating?: string;
  reply?: string;
  search?: string;
  skip: number;
  storeMappingId: string;
  take: number;
};

function androidReviewWhere(
  options: AndroidReviewPageOptions,
): Prisma.AndroidStoreReviewWhereInput {
  const where: Prisma.AndroidStoreReviewWhereInput = {
    storeMappingId: options.storeMappingId,
  };
  const search = options.search?.trim();
  const rating = Number.parseInt(options.rating ?? "", 10);

  if (Number.isInteger(rating) && rating >= 1 && rating <= 5) {
    where.rating = rating;
  }

  if (options.reply === "pending") {
    where.developerReplyText = null;
  } else if (options.reply === "replied") {
    where.developerReplyText = { not: null };
  }

  if (search) {
    const contains = { contains: search, mode: "insensitive" as const };
    where.OR = [
      { authorName: contains },
      { originalText: contains },
      { reviewId: contains },
      { reviewText: contains },
    ];
  }

  return where;
}

export function getAndroidReviewsForMappingPage(
  options: AndroidReviewPageOptions,
) {
  const where = androidReviewWhere(options);

  return prisma.$transaction([
    prisma.androidStoreReview.findMany({
      where,
      orderBy: [{ userCommentUpdatedAt: "desc" }, { fetchedAt: "desc" }],
      skip: options.skip,
      take: options.take,
    }),
    prisma.androidStoreReview.count({ where }),
  ]);
}

export function getLatestAndroidReviewForMapping(mappingId: string) {
  return prisma.androidStoreReview.findFirst({
    where: { storeMappingId: mappingId },
    orderBy: [{ userCommentUpdatedAt: "desc" }, { fetchedAt: "desc" }],
    select: {
      fetchedAt: true,
      userCommentUpdatedAt: true,
    },
  });
}

export function getAndroidReviewFetchRuns(mappingId: string, take = 10) {
  return prisma.reviewFetchRun.findMany({
    where: {
      appTarget: { androidStoreMappingId: mappingId },
      platform: "ANDROID",
    },
    orderBy: [{ createdAt: "desc" }],
    take,
  });
}

export function getAndroidReviewFingerprints(
  storeMappingId: string,
  reviewIds: string[],
) {
  if (!reviewIds.length) return Promise.resolve([]);

  return prisma.androidStoreReview.findMany({
    where: {
      reviewId: { in: reviewIds },
      storeMappingId,
    },
    select: {
      developerReplyText: true,
      developerReplyUpdatedAt: true,
      rating: true,
      reviewId: true,
      reviewText: true,
      userCommentUpdatedAt: true,
    },
  });
}

export function getGlobalAndroidReviewFetchSchedule() {
  return prisma.reviewFetchSchedule.findUnique({
    where: { scope: REVIEW_FETCH_GLOBAL_SCOPE },
  });
}

function upsertAndroidReviewFetchScheduleQuery(
  input: AndroidReviewFetchScheduleUpsertInput,
) {
  return prisma.reviewFetchSchedule.upsert({
    where: { scope: REVIEW_FETCH_GLOBAL_SCOPE },
    create: {
      createdBy: input.createdBy,
      intervalHours: input.intervalHours,
      nextRunAt: input.nextRunAt,
      scope: REVIEW_FETCH_GLOBAL_SCOPE,
      status: input.status,
      updatedBy: input.updatedBy,
    },
    update: {
      intervalHours: input.intervalHours,
      lastErrorCode: null,
      lastErrorMessage: null,
      lockedAt: null,
      lockedBy: null,
      nextRunAt: input.nextRunAt,
      status: input.status,
      updatedBy: input.updatedBy,
    },
  });
}

export function upsertGlobalAndroidReviewFetchSchedule(
  input: AndroidReviewFetchScheduleUpsertInput,
) {
  return upsertAndroidReviewFetchScheduleQuery(input);
}

export function updateGlobalAndroidReviewFetchScheduleStatus(
  input: {
    nextRunAt?: Date;
    status: ReviewFetchScheduleStatus;
    updatedBy: string;
  },
) {
  return prisma.reviewFetchSchedule.update({
    where: { scope: REVIEW_FETCH_GLOBAL_SCOPE },
    data: {
      lockedAt: null,
      lockedBy: null,
      nextRunAt: input.nextRunAt,
      status: input.status,
      updatedBy: input.updatedBy,
    },
  });
}

export function deleteGlobalAndroidReviewFetchSchedule() {
  return prisma.reviewFetchSchedule.delete({
    where: { scope: REVIEW_FETCH_GLOBAL_SCOPE },
  });
}

export async function claimDueAndroidReviewFetchSchedules(input: {
  limit?: number;
  lockedBy: string;
  lockStaleBefore: Date;
  now: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const dueSchedules = await tx.reviewFetchSchedule.findMany({
      where: {
        nextRunAt: { lte: input.now },
        status: "ACTIVE",
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: input.lockStaleBefore } },
        ],
      },
      orderBy: { nextRunAt: "asc" },
      select: { id: true },
      take: input.limit,
    });
    const ids = dueSchedules.map((schedule) => schedule.id);
    if (!ids.length) return [];

    await tx.reviewFetchSchedule.updateMany({
      where: {
        id: { in: ids },
        nextRunAt: { lte: input.now },
        status: "ACTIVE",
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: input.lockStaleBefore } },
        ],
      },
      data: {
        lockedAt: input.now,
        lockedBy: input.lockedBy,
      },
    });

    return tx.reviewFetchSchedule.findMany({
      where: { id: { in: ids }, lockedBy: input.lockedBy },
      orderBy: { nextRunAt: "asc" },
    });
  });
}

export async function enqueueScheduledAndroidReviewFetchRuns(
  inputs: Array<{
    maxAttempts: number;
    maxResults: number;
    nextAttemptAt: Date;
    scheduledFor: Date;
    sourceScheduleId: string;
    storeMappingId: string;
  }>,
) {
  if (!inputs.length) return Promise.resolve({ count: 0 });

  const targetIdByMappingId = await androidReviewAppTargetIdByMappingId(
    inputs.map((input) => input.storeMappingId),
  );
  const data = inputs.flatMap((input) => {
    const reviewAppTargetId = targetIdByMappingId.get(input.storeMappingId);
    if (!reviewAppTargetId) return [];

    return {
      maxAttempts: input.maxAttempts,
      maxResults: input.maxResults,
      nextAttemptAt: input.nextAttemptAt,
      platform: "ANDROID" as const,
      reviewAppTargetId,
      scheduledFor: input.scheduledFor,
      scanMode: "INCREMENTAL" as const,
      sourceScheduleId: input.sourceScheduleId,
      status: "PENDING" as const,
      triggerType: "SCHEDULED" as const,
    };
  });

  if (!data.length) return { count: 0 };

  return prisma.reviewFetchRun.createMany({
    data,
    skipDuplicates: true,
  });
}

export async function enqueueManualAndroidReviewFetchRuns(
  inputs: Array<{
    maxAttempts: number;
    maxResults: number;
    nextAttemptAt: Date;
    scanMode: ReviewFetchScanMode;
    scheduledFor: Date;
    storeMappingId: string;
  }>,
) {
  if (!inputs.length) {
    return {
      count: 0,
      skippedCount: 0,
      skippedStoreMappingIds: [] as string[],
    };
  }

  const storeMappingIds = inputs.map((input) => input.storeMappingId);
  const activeFullRuns = await prisma.reviewFetchRun.findMany({
    where: {
      appTarget: { androidStoreMappingId: { in: storeMappingIds } },
      platform: "ANDROID",
      scanMode: "FULL",
      status: { in: ["PENDING", "RUNNING"] },
    },
    select: {
      appTarget: {
        select: {
          androidStoreMappingId: true,
        },
      },
    },
  });
  const activeFullStoreMappingIds = new Set(
    activeFullRuns
      .map((run) => run.appTarget.androidStoreMappingId)
      .filter((storeMappingId): storeMappingId is string =>
        Boolean(storeMappingId),
      ),
  );
  const enqueueInputs = inputs.filter(
    (input) => !activeFullStoreMappingIds.has(input.storeMappingId),
  );
  const targetIdByMappingId = await androidReviewAppTargetIdByMappingId(
    enqueueInputs.map((input) => input.storeMappingId),
  );
  const data = enqueueInputs.flatMap((input) => {
    const reviewAppTargetId = targetIdByMappingId.get(input.storeMappingId);
    if (!reviewAppTargetId) return [];

    return {
      maxAttempts: input.maxAttempts,
      maxResults: input.maxResults,
      nextAttemptAt: input.nextAttemptAt,
      platform: "ANDROID" as const,
      reviewAppTargetId,
      scheduledFor: input.scheduledFor,
      scanMode: input.scanMode,
      status: "PENDING" as const,
      triggerType: "MANUAL" as const,
    };
  });

  const result = data.length
    ? await prisma.reviewFetchRun.createMany({ data })
    : { count: 0 };

  return {
    count: result.count,
    skippedCount: activeFullStoreMappingIds.size,
    skippedStoreMappingIds: Array.from(activeFullStoreMappingIds),
  };
}

export function markAndroidReviewFetchSchedulesMaterialized(
  inputs: Array<{
    nextRunAt: Date;
    scheduleId: string;
  }>,
) {
  if (!inputs.length) return Promise.resolve([]);

  return prisma.$transaction(
    inputs.map((input) =>
      prisma.reviewFetchSchedule.update({
        where: { id: input.scheduleId },
        data: {
          lockedAt: null,
          lockedBy: null,
          nextRunAt: input.nextRunAt,
        },
      }),
    ),
  );
}

export function finishAndroidReviewFetchScheduleRun(
  scheduleId: string,
  input: {
    errorCode?: string | null;
    errorMessage?: string | null;
    lastRunAt: Date;
    lastStatus: ReviewFetchRunStatus;
    nextRunAt?: Date;
  },
) {
  return prisma.reviewFetchSchedule.update({
    where: { id: scheduleId },
    data: {
      lastErrorCode: input.errorCode ?? null,
      lastErrorMessage: input.errorMessage ?? null,
      lastRunAt: input.lastRunAt,
      lastStatus: input.lastStatus,
      lockedAt: null,
      lockedBy: null,
      nextRunAt: input.nextRunAt,
      runCount: { increment: 1 },
    },
  });
}

export async function claimPendingAndroidReviewFetchRuns(input: {
  limit: number;
  lockedBy: string;
  now: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.reviewFetchRun.findMany({
      where: {
        appTarget: { androidStoreMappingId: { not: null } },
        platform: "ANDROID",
        status: "PENDING",
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: input.now } }],
      },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
      select: {
        appTarget: { select: { androidStoreMappingId: true } },
        id: true,
      },
      take: input.limit * 3,
    });
    const claimedStoreMappingIds = new Set<string>();
    const ids = [];
    for (const candidate of candidates) {
      const storeMappingId = candidate.appTarget.androidStoreMappingId;
      if (!storeMappingId || claimedStoreMappingIds.has(storeMappingId)) {
        continue;
      }
      claimedStoreMappingIds.add(storeMappingId);
      ids.push(candidate.id);
      if (ids.length >= input.limit) break;
    }
    if (!ids.length) return [];

    await tx.reviewFetchRun.updateMany({
      where: {
        id: { in: ids },
        platform: "ANDROID",
        status: "PENDING",
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: input.now } }],
      },
      data: {
        attemptCount: { increment: 1 },
        errorCode: null,
        errorMessage: null,
        finishedAt: null,
        lockedAt: input.now,
        lockedBy: input.lockedBy,
        startedAt: input.now,
        stopReason: null,
        status: "RUNNING",
      },
    });

    const runs = await tx.reviewFetchRun.findMany({
      where: {
        id: { in: ids },
        lockedBy: input.lockedBy,
        platform: "ANDROID",
        status: "RUNNING",
      },
      include: {
        appTarget: {
          include: {
            androidStoreMapping: true,
          },
        },
        sourceSchedule: true,
      },
      orderBy: [{ startedAt: "asc" }],
    });

    return runs.flatMap((run): ClaimedAndroidReviewFetchRunRecord[] => {
      const storeMapping = run.appTarget.androidStoreMapping;
      if (!storeMapping) return [];

      return [
        {
          ...run,
          storeMapping,
          storeMappingId: storeMapping.id,
        },
      ];
    });
  });
}

export function retryAndroidReviewFetchRun(
  runId: string,
  input: {
    errorCode: string;
    errorMessage: string;
    nextAttemptAt: Date;
  },
) {
  return prisma.reviewFetchRun.update({
    where: { id: runId },
    data: {
      errorCode: input.errorCode,
      errorMessage: input.errorMessage,
      finishedAt: null,
      lockedAt: null,
      lockedBy: null,
      nextAttemptAt: input.nextAttemptAt,
      status: "PENDING",
    },
  });
}

export async function recoverStaleAndroidReviewFetchRuns(input: {
  errorCode: string;
  errorMessage: string;
  nextAttemptAt: Date;
  staleBefore: Date;
}) {
  const staleRuns = await prisma.reviewFetchRun.findMany({
    where: {
      lockedAt: { lt: input.staleBefore },
      platform: "ANDROID",
      status: "RUNNING",
    },
    select: {
      attemptCount: true,
      id: true,
      maxAttempts: true,
      reviewAppTargetId: true,
    },
  });
  if (!staleRuns.length) {
    return { failed: 0, retried: 0 };
  }

  const retryIds = staleRuns
    .filter((run) => run.attemptCount < run.maxAttempts)
    .map((run) => run.id);
  const failedRuns = staleRuns.filter((run) => run.attemptCount >= run.maxAttempts);
  const failedIds = failedRuns.map((run) => run.id);
  const failedReviewAppTargetIds = failedRuns.map((run) => run.reviewAppTargetId);

  await prisma.$transaction([
    ...(retryIds.length
      ? [
          prisma.reviewFetchRun.updateMany({
            where: { id: { in: retryIds } },
            data: {
              errorCode: input.errorCode,
              errorMessage: input.errorMessage,
              finishedAt: null,
              lockedAt: null,
              lockedBy: null,
              nextAttemptAt: input.nextAttemptAt,
              status: "PENDING",
            },
          }),
        ]
      : []),
    ...(failedIds.length
      ? [
          prisma.reviewFetchRun.updateMany({
            where: { id: { in: failedIds } },
            data: {
              errorCode: input.errorCode,
              errorMessage: input.errorMessage,
              finishedAt: input.nextAttemptAt,
              lockedAt: null,
              lockedBy: null,
              status: "FAILED",
            },
          }),
          prisma.reviewSyncState.updateMany({
            where: { reviewAppTargetId: { in: failedReviewAppTargetIds } },
            data: {
              lastErrorCode: input.errorCode,
              lastErrorMessage: input.errorMessage,
              lastFetchFinishedAt: input.nextAttemptAt,
              lockedAt: null,
              lockedBy: null,
              status: "FAILED",
            },
          }),
        ]
      : []),
  ]);

  return {
    failed: failedIds.length,
    retried: retryIds.length,
  };
}

export function recoverStaleAndroidReviewSyncStates(input: {
  errorCode: string;
  errorMessage: string;
  finishedAt: Date;
  staleBefore: Date;
}) {
  return prisma.reviewSyncState.updateMany({
    where: {
      appTarget: { platform: "ANDROID" },
      lockedAt: { lt: input.staleBefore },
      status: "RUNNING",
    },
    data: {
      lastErrorCode: input.errorCode,
      lastErrorMessage: input.errorMessage,
      lastFetchFinishedAt: input.finishedAt,
      lockedAt: null,
      lockedBy: null,
      status: "FAILED",
    },
  });
}

export function deleteOldAndroidReviewFetchRuns(input: { before: Date }) {
  return prisma.reviewFetchRun.deleteMany({
    where: {
      createdAt: { lt: input.before },
      platform: "ANDROID",
      status: { in: ["SUCCEEDED", "FAILED", "PARTIAL"] },
    },
  });
}

export function getAndroidReviewSyncState(storeMappingId: string) {
  return prisma.reviewSyncState.findFirst({
    where: {
      appTarget: { androidStoreMappingId: storeMappingId },
    },
    select: {
      lockedAt: true,
      status: true,
    },
  });
}

export function markAndroidReviewSyncRunning(
  storeMappingId: string,
  input: {
    lockedBy: string;
    startedAt: Date;
  },
) {
  return androidReviewAppTargetId(storeMappingId).then((reviewAppTargetId) =>
    prisma.reviewSyncState.upsert({
      where: { reviewAppTargetId },
      create: {
        lastErrorCode: null,
        lastErrorMessage: null,
        lastFetchStartedAt: input.startedAt,
        lockedAt: input.startedAt,
        lockedBy: input.lockedBy,
        reviewAppTargetId,
        status: "RUNNING",
      },
      update: {
        lastErrorCode: null,
        lastErrorMessage: null,
        lastFetchStartedAt: input.startedAt,
        lockedAt: input.startedAt,
        lockedBy: input.lockedBy,
        status: "RUNNING",
      },
    }),
  );
}

export function createAndroidReviewFetchRun(input: {
  maxResults: number;
  scanMode: ReviewFetchScanMode;
  startedAt: Date;
  storeMappingId: string;
  triggerType: ReviewFetchTrigger;
  lockedBy?: string | null;
  sourceScheduleId?: string | null;
  scheduledFor?: Date | null;
}) {
  return androidReviewAppTargetId(input.storeMappingId).then((reviewAppTargetId) =>
    prisma.reviewFetchRun.create({
      data: {
        attemptCount: 1,
        lockedAt: input.lockedBy ? input.startedAt : null,
        lockedBy: input.lockedBy ?? null,
        maxResults: input.maxResults,
        platform: "ANDROID",
        reviewAppTargetId,
        scheduledFor: input.scheduledFor ?? null,
        scanMode: input.scanMode,
        sourceScheduleId: input.sourceScheduleId ?? null,
        startedAt: input.startedAt,
        status: "RUNNING",
        triggerType: input.triggerType,
      },
      select: { id: true },
    }),
  );
}

export function finishAndroidReviewFetchRun(
  runId: string,
  input: {
    errorCode?: string | null;
    errorMessage?: string | null;
    finishedAt: Date;
    nextPageToken?: string | null;
    pagesFetched: number;
    requestCount: number;
    reviewsFetched: number;
    reviewsUpserted: number;
    status: ReviewFetchRunStatus;
    stopReason?: ReviewFetchStopReason | null;
  },
) {
  return prisma.reviewFetchRun.update({
    where: { id: runId },
    data: {
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      finishedAt: input.finishedAt,
      nextPageToken: input.nextPageToken ?? null,
      pagesFetched: input.pagesFetched,
      requestCount: input.requestCount,
      reviewsFetched: input.reviewsFetched,
      reviewsUpserted: input.reviewsUpserted,
      lockedAt: null,
      lockedBy: null,
      status: input.status,
      stopReason: input.stopReason ?? null,
    },
  });
}

export function finishAndroidReviewSyncState(
  storeMappingId: string,
  input: {
    errorCode?: string | null;
    errorMessage?: string | null;
    finishedAt: Date;
    lastReviewUpdatedAt: Date | null;
    reviewsFetched: number;
    reviewsUpserted: number;
    status: "SUCCEEDED" | "FAILED";
  },
) {
  return androidReviewAppTargetId(storeMappingId).then((reviewAppTargetId) =>
    prisma.reviewSyncState.update({
      where: { reviewAppTargetId },
      data: {
        lastErrorCode: input.errorCode ?? null,
        lastErrorMessage: input.errorMessage ?? null,
        lastFetchFinishedAt: input.finishedAt,
        lastFetchedCount: input.reviewsFetched,
        lastReviewActivityAt: input.lastReviewUpdatedAt ?? undefined,
        lastSuccessAt: input.status === "SUCCEEDED" ? input.finishedAt : undefined,
        lastUpsertedCount: input.reviewsUpserted,
        lockedAt: null,
        lockedBy: null,
        status: input.status,
      },
    }),
  );
}

export function getAndroidReviewForReply(storeMappingId: string, reviewId: string) {
  return prisma.androidStoreReview.findFirst({
    where: { reviewId, storeMappingId },
    include: {
      storeMapping: {
        include: {
          storeProfile: true,
        },
      },
    },
  });
}

export function getActiveAndroidCredentialForStoreProfile(storeProfileId: string) {
  return prisma.androidCredential.findFirst({
    where: {
      status: "ACTIVE",
      storeProfileId,
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getAndroidReviewReplyTemplateForRating(
  storeMappingId: string,
  rating: number,
) {
  const template = await prisma.reviewReplyTemplate.findFirst({
    where: {
      appTarget: {
        androidStoreMappingId: storeMappingId,
      },
      rating,
    },
    include: {
      appTarget: {
        select: {
          androidStoreMappingId: true,
        },
      },
    },
  });

  return template ? reviewReplyTemplateRecord(template) : null;
}

export function updateAndroidReviewDeveloperReply(
  id: string,
  input: {
    developerReplyText: string;
    developerReplyUpdatedAt: Date;
  },
) {
  return prisma.androidStoreReview.update({
    where: { id },
    data: {
      developerReplyText: input.developerReplyText,
      developerReplyUpdatedAt: input.developerReplyUpdatedAt,
    },
  });
}

export async function upsertAndroidReviews(reviews: AndroidReviewUpsertInput[]) {
  if (!reviews.length) return 0;

  const targetIdByMappingId = await androidReviewAppTargetIdByMappingId(
    reviews.map((review) => review.storeMappingId),
  );
  const rows = reviews.map((review) => {
    const reviewAppTargetId = targetIdByMappingId.get(review.storeMappingId);
    if (!reviewAppTargetId) {
      throw new Error(
        `Review app target was not found for Android mapping ${review.storeMappingId}.`,
      );
    }

    return {
      ...review,
      reviewAppTargetId,
    };
  });

  const results = await prisma.$transaction(
    rows.map((review) =>
      prisma.androidStoreReview.upsert({
        where: {
          storeMappingId_reviewId: {
            reviewId: review.reviewId,
            storeMappingId: review.storeMappingId,
          },
        },
        create: {
          androidOsVersion: review.androidOsVersion,
          appVersionCode: review.appVersionCode,
          appVersionName: review.appVersionName,
          authorName: review.authorName,
          developerReplyText: review.developerReplyText,
          developerReplyUpdatedAt: review.developerReplyUpdatedAt,
          device: review.device,
          deviceMetadata: nullableJson(review.deviceMetadata),
          fetchedAt: review.fetchedAt,
          originalText: review.originalText,
          rating: review.rating,
          rawReview: review.rawReview,
          reviewId: review.reviewId,
          reviewAppTargetId: review.reviewAppTargetId,
          reviewerLanguage: review.reviewerLanguage,
          reviewText: review.reviewText,
          storeMappingId: review.storeMappingId,
          thumbsDownCount: review.thumbsDownCount,
          thumbsUpCount: review.thumbsUpCount,
          userCommentUpdatedAt: review.userCommentUpdatedAt,
        },
        update: {
          androidOsVersion: review.androidOsVersion,
          appVersionCode: review.appVersionCode,
          appVersionName: review.appVersionName,
          authorName: review.authorName,
          developerReplyText: review.developerReplyText,
          developerReplyUpdatedAt: review.developerReplyUpdatedAt,
          device: review.device,
          deviceMetadata: nullableJson(review.deviceMetadata),
          fetchedAt: review.fetchedAt,
          originalText: review.originalText,
          rating: review.rating,
          rawReview: review.rawReview,
          reviewAppTargetId: review.reviewAppTargetId,
          reviewerLanguage: review.reviewerLanguage,
          reviewText: review.reviewText,
          thumbsDownCount: review.thumbsDownCount,
          thumbsUpCount: review.thumbsUpCount,
          userCommentUpdatedAt: review.userCommentUpdatedAt,
        },
      }),
    ),
  );

  return results.length;
}

export async function getAndroidReviewReplyTemplates(mappingIds: string[]) {
  if (!mappingIds.length) return Promise.resolve([]);

  const templates = await prisma.reviewReplyTemplate.findMany({
    where: {
      appTarget: {
        androidStoreMappingId: { in: mappingIds },
      },
    },
    include: {
      appTarget: {
        select: {
          androidStoreMappingId: true,
        },
      },
    },
    orderBy: [{ rating: "desc" }],
  });

  return templates.flatMap((template) => {
    const record = reviewReplyTemplateRecord(template);
    return record ? [record] : [];
  });
}

export function updateAndroidStoreProfileReplyInfo(
  storeProfileId: string,
  data: {
    contactEmail: string | null;
    supportPhone: string | null;
    websiteUrl: string | null;
  },
) {
  return prisma.androidStoreProfile.update({
    where: { id: storeProfileId },
    data,
  });
}

export async function upsertAndroidReviewReplyTemplate(
  data: {
    createdBy?: string | null;
    isActive: boolean;
    rating: number;
    replyText: string;
    storeMappingId: string;
    updatedBy?: string | null;
  },
) {
  const reviewAppTargetId = await androidReviewAppTargetId(data.storeMappingId);
  const template = await prisma.reviewReplyTemplate.upsert({
    where: {
      reviewAppTargetId_rating: {
        rating: data.rating,
        reviewAppTargetId,
      },
    },
    create: {
      createdBy: data.createdBy,
      isActive: data.isActive,
      rating: data.rating,
      replyText: data.replyText,
      reviewAppTargetId,
      updatedBy: data.updatedBy,
    },
    update: {
      isActive: data.isActive,
      replyText: data.replyText,
      updatedBy: data.updatedBy,
    },
    include: {
      appTarget: {
        select: {
          androidStoreMappingId: true,
        },
      },
    },
  });

  const record = reviewReplyTemplateRecord(template);
  if (!record) {
    throw new Error(
      `Review app target was not found for Android mapping ${data.storeMappingId}.`,
    );
  }

  return record;
}
