import "server-only";

import {
  Prisma,
  type ReviewFetchRunStatus,
  type ReviewFetchScheduleStatus,
  type ReviewFetchTrigger,
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

type AndroidReviewFetchScheduleUpsertInput = {
  createdBy: string;
  nextRunAt: Date;
  status: ReviewFetchScheduleStatus;
  storeMappingId: string;
  timeOfDay: string;
  timezone: string;
  updatedBy: string;
};

function nullableJson(value: Prisma.InputJsonValue | null) {
  return value === null ? Prisma.DbNull : value;
}

export function getActiveAndroidReviewMappings() {
  return prisma.androidStoreMapping.findMany({
    where: { status: "ACTIVE" },
    include: {
      storeProfile: true,
      reviewSyncState: true,
      _count: { select: { reviews: true } },
    },
    orderBy: { appName: "asc" },
  });
}

export function getAndroidReviewMappingById(mappingId: string) {
  return prisma.androidStoreMapping.findUnique({
    where: { id: mappingId },
    include: {
      storeProfile: true,
      reviewSyncState: true,
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
  return prisma.androidStoreReviewFetchRun.findMany({
    where: { storeMappingId: mappingId },
    orderBy: [{ createdAt: "desc" }],
    take,
  });
}

export function getAndroidReviewFetchSchedule(storeMappingId: string) {
  return prisma.androidStoreReviewFetchSchedule.findUnique({
    where: { storeMappingId },
  });
}

export function getAndroidReviewFetchSchedules(storeMappingIds: string[]) {
  if (!storeMappingIds.length) return Promise.resolve([]);

  return prisma.androidStoreReviewFetchSchedule.findMany({
    where: { storeMappingId: { in: storeMappingIds } },
    orderBy: [{ status: "asc" }, { nextRunAt: "asc" }],
  });
}

function upsertAndroidReviewFetchScheduleQuery(
  input: AndroidReviewFetchScheduleUpsertInput,
) {
  return prisma.androidStoreReviewFetchSchedule.upsert({
    where: { storeMappingId: input.storeMappingId },
    create: {
      createdBy: input.createdBy,
      nextRunAt: input.nextRunAt,
      status: input.status,
      storeMappingId: input.storeMappingId,
      timeOfDay: input.timeOfDay,
      timezone: input.timezone,
      updatedBy: input.updatedBy,
    },
    update: {
      lastErrorCode: null,
      lastErrorMessage: null,
      lockedAt: null,
      lockedBy: null,
      nextRunAt: input.nextRunAt,
      status: input.status,
      timeOfDay: input.timeOfDay,
      timezone: input.timezone,
      updatedBy: input.updatedBy,
    },
  });
}

export function upsertAndroidReviewFetchSchedule(
  input: AndroidReviewFetchScheduleUpsertInput,
) {
  return upsertAndroidReviewFetchScheduleQuery(input);
}

export function upsertAndroidReviewFetchSchedules(
  inputs: AndroidReviewFetchScheduleUpsertInput[],
) {
  if (!inputs.length) return Promise.resolve([]);

  return prisma.$transaction(
    inputs.map((input) => upsertAndroidReviewFetchScheduleQuery(input)),
  );
}

export function updateAndroidReviewFetchScheduleStatus(
  storeMappingId: string,
  input: {
    nextRunAt?: Date;
    status: ReviewFetchScheduleStatus;
    updatedBy: string;
  },
) {
  return prisma.androidStoreReviewFetchSchedule.update({
    where: { storeMappingId },
    data: {
      lockedAt: null,
      lockedBy: null,
      nextRunAt: input.nextRunAt,
      status: input.status,
      updatedBy: input.updatedBy,
    },
  });
}

export function updateAndroidReviewFetchScheduleStatuses(
  inputs: Array<{
    nextRunAt?: Date;
    status: ReviewFetchScheduleStatus;
    storeMappingId: string;
    updatedBy: string;
  }>,
) {
  if (!inputs.length) return Promise.resolve([]);

  return prisma.$transaction(
    inputs.map((input) =>
      prisma.androidStoreReviewFetchSchedule.update({
        where: { storeMappingId: input.storeMappingId },
        data: {
          lockedAt: null,
          lockedBy: null,
          nextRunAt: input.nextRunAt,
          status: input.status,
          updatedBy: input.updatedBy,
        },
      }),
    ),
  );
}

export function deleteAndroidReviewFetchSchedule(storeMappingId: string) {
  return prisma.androidStoreReviewFetchSchedule.delete({
    where: { storeMappingId },
  });
}

export function deleteAndroidReviewFetchSchedules(storeMappingIds: string[]) {
  if (!storeMappingIds.length) return Promise.resolve({ count: 0 });

  return prisma.androidStoreReviewFetchSchedule.deleteMany({
    where: { storeMappingId: { in: storeMappingIds } },
  });
}

export async function claimDueAndroidReviewFetchSchedules(input: {
  limit?: number;
  lockedBy: string;
  lockStaleBefore: Date;
  now: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const dueSchedules = await tx.androidStoreReviewFetchSchedule.findMany({
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

    await tx.androidStoreReviewFetchSchedule.updateMany({
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

    return tx.androidStoreReviewFetchSchedule.findMany({
      where: { id: { in: ids }, lockedBy: input.lockedBy },
      include: { storeMapping: true },
      orderBy: { nextRunAt: "asc" },
    });
  });
}

export function enqueueScheduledAndroidReviewFetchRuns(
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

  return prisma.androidStoreReviewFetchRun.createMany({
    data: inputs.map((input) => ({
      maxAttempts: input.maxAttempts,
      maxResults: input.maxResults,
      nextAttemptAt: input.nextAttemptAt,
      scheduledFor: input.scheduledFor,
      sourceScheduleId: input.sourceScheduleId,
      status: "PENDING",
      storeMappingId: input.storeMappingId,
      triggerType: "SCHEDULED",
    })),
    skipDuplicates: true,
  });
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
      prisma.androidStoreReviewFetchSchedule.update({
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
  return prisma.androidStoreReviewFetchSchedule.update({
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
    const candidates = await tx.androidStoreReviewFetchRun.findMany({
      where: {
        status: "PENDING",
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: input.now } }],
      },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
      select: { id: true },
      take: input.limit,
    });
    const ids = candidates.map((candidate) => candidate.id);
    if (!ids.length) return [];

    await tx.androidStoreReviewFetchRun.updateMany({
      where: {
        id: { in: ids },
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
        status: "RUNNING",
      },
    });

    return tx.androidStoreReviewFetchRun.findMany({
      where: {
        id: { in: ids },
        lockedBy: input.lockedBy,
        status: "RUNNING",
      },
      include: {
        sourceSchedule: true,
        storeMapping: true,
      },
      orderBy: [{ startedAt: "asc" }],
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
  return prisma.androidStoreReviewFetchRun.update({
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
  const staleRuns = await prisma.androidStoreReviewFetchRun.findMany({
    where: {
      lockedAt: { lt: input.staleBefore },
      status: "RUNNING",
    },
    select: {
      attemptCount: true,
      id: true,
      maxAttempts: true,
      storeMappingId: true,
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
  const failedStoreMappingIds = failedRuns.map((run) => run.storeMappingId);

  await prisma.$transaction([
    ...(retryIds.length
      ? [
          prisma.androidStoreReviewFetchRun.updateMany({
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
          prisma.androidStoreReviewFetchRun.updateMany({
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
          prisma.androidStoreReviewSyncState.updateMany({
            where: { storeMappingId: { in: failedStoreMappingIds } },
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
  return prisma.androidStoreReviewSyncState.updateMany({
    where: {
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
  return prisma.androidStoreReviewFetchRun.deleteMany({
    where: {
      createdAt: { lt: input.before },
      status: { in: ["SUCCEEDED", "FAILED", "PARTIAL"] },
    },
  });
}

export function getAndroidReviewSyncState(storeMappingId: string) {
  return prisma.androidStoreReviewSyncState.findUnique({
    where: { storeMappingId },
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
  return prisma.androidStoreReviewSyncState.upsert({
    where: { storeMappingId },
    create: {
      lastErrorCode: null,
      lastErrorMessage: null,
      lastFetchStartedAt: input.startedAt,
      lockedAt: input.startedAt,
      lockedBy: input.lockedBy,
      status: "RUNNING",
      storeMappingId,
    },
    update: {
      lastErrorCode: null,
      lastErrorMessage: null,
      lastFetchStartedAt: input.startedAt,
      lockedAt: input.startedAt,
      lockedBy: input.lockedBy,
      status: "RUNNING",
    },
  });
}

export function createAndroidReviewFetchRun(input: {
  maxResults: number;
  startedAt: Date;
  storeMappingId: string;
  triggerType: ReviewFetchTrigger;
  lockedBy?: string | null;
  sourceScheduleId?: string | null;
  scheduledFor?: Date | null;
}) {
  return prisma.androidStoreReviewFetchRun.create({
    data: {
      attemptCount: 1,
      lockedAt: input.lockedBy ? input.startedAt : null,
      lockedBy: input.lockedBy ?? null,
      maxResults: input.maxResults,
      scheduledFor: input.scheduledFor ?? null,
      sourceScheduleId: input.sourceScheduleId ?? null,
      startedAt: input.startedAt,
      status: "RUNNING",
      storeMappingId: input.storeMappingId,
      triggerType: input.triggerType,
    },
    select: { id: true },
  });
}

export function finishAndroidReviewFetchRun(
  runId: string,
  input: {
    errorCode?: string | null;
    errorMessage?: string | null;
    finishedAt: Date;
    pagesFetched: number;
    reviewsFetched: number;
    reviewsUpserted: number;
    status: ReviewFetchRunStatus;
  },
) {
  return prisma.androidStoreReviewFetchRun.update({
    where: { id: runId },
    data: {
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      finishedAt: input.finishedAt,
      pagesFetched: input.pagesFetched,
      reviewsFetched: input.reviewsFetched,
      reviewsUpserted: input.reviewsUpserted,
      lockedAt: null,
      lockedBy: null,
      status: input.status,
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
  return prisma.androidStoreReviewSyncState.update({
    where: { storeMappingId },
    data: {
      lastErrorCode: input.errorCode ?? null,
      lastErrorMessage: input.errorMessage ?? null,
      lastFetchFinishedAt: input.finishedAt,
      lastFetchedCount: input.reviewsFetched,
      lastReviewUpdatedAt: input.lastReviewUpdatedAt ?? undefined,
      lastSuccessAt: input.status === "SUCCEEDED" ? input.finishedAt : undefined,
      lastUpsertedCount: input.reviewsUpserted,
      lockedAt: null,
      lockedBy: null,
      status: input.status,
    },
  });
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

export function getAndroidReviewReplyTemplateForRating(
  storeMappingId: string,
  rating: number,
) {
  return prisma.androidStoreReviewReplyTemplate.findUnique({
    where: {
      storeMappingId_rating: {
        rating,
        storeMappingId,
      },
    },
  });
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

  const results = await prisma.$transaction(
    reviews.map((review) =>
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

export function getAndroidReviewReplyTemplates(mappingIds: string[]) {
  if (!mappingIds.length) return Promise.resolve([]);

  return prisma.androidStoreReviewReplyTemplate.findMany({
    where: { storeMappingId: { in: mappingIds } },
    orderBy: [{ storeMappingId: "asc" }, { rating: "desc" }],
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
  data: Prisma.AndroidStoreReviewReplyTemplateUncheckedCreateInput &
    Pick<
      Prisma.AndroidStoreReviewReplyTemplateUncheckedUpdateInput,
      "replyText" | "isActive" | "updatedBy"
    >,
) {
  return prisma.androidStoreReviewReplyTemplate.upsert({
    where: {
      storeMappingId_rating: {
        storeMappingId: data.storeMappingId,
        rating: data.rating,
      },
    },
    create: data,
    update: {
      isActive: data.isActive,
      replyText: data.replyText,
      updatedBy: data.updatedBy,
    },
  });
}
