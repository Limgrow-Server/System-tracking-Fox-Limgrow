import "server-only";

import {
  type IosStoreMapping,
  type IosStoreReview,
  Prisma,
  type ReviewFetchRun,
  type ReviewFetchRunStatus,
  type ReviewFetchScanMode,
  type ReviewFetchStopReason,
  type ReviewFetchTrigger,
  type ReviewSyncStatus,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ensureIosReviewTargetsForMapping } from "@/lib/server/repositories/reviews/review.repository";

export type IosReviewUpsertInput = {
  appVersion: string | null;
  authorName: string | null;
  developerReplyId: string | null;
  developerReplyText: string | null;
  developerReplyUpdatedAt: Date | null;
  fetchedAt: Date;
  rating: number | null;
  rawReview: Prisma.InputJsonValue | null;
  reviewCreatedAt: Date | null;
  reviewId: string;
  reviewText: string | null;
  reviewUpdatedAt: Date | null;
  storeMappingId: string;
  territory: string | null;
  title: string | null;
};

export type IosReviewFingerprint = {
  developerReplyText: string | null;
  developerReplyUpdatedAt: Date | null;
  rating: number | null;
  reviewId: string;
  reviewText: string | null;
  reviewUpdatedAt: Date | null;
  title: string | null;
};

export type IosReviewRatingGroup = {
  _count: { _all: number };
  rating: number | null;
  storeMappingId: string;
};

export type IosReviewReplyGroup = {
  _count: { _all: number };
  storeMappingId: string;
};

export type ClaimedIosReviewFetchRunRecord = ReviewFetchRun & {
  storeMapping: IosStoreMapping;
  storeMappingId: string;
};

function nullableJson(value: Prisma.InputJsonValue | null) {
  return value === null ? Prisma.DbNull : value;
}

export async function iosReviewAppTargetId(storeMappingId: string) {
  const target = await prisma.reviewAppTarget.findUnique({
    where: { iosStoreMappingId: storeMappingId },
    select: { id: true },
  });

  if (!target) {
    return ensureIosReviewTargetsForMapping(storeMappingId);
  }

  return target.id;
}

async function iosReviewAppTargetIdByMappingId(storeMappingIds: string[]) {
  const uniqueStoreMappingIds = Array.from(new Set(storeMappingIds));
  if (!uniqueStoreMappingIds.length) return new Map<string, string>();

  const targets = await prisma.reviewAppTarget.findMany({
    where: {
      iosStoreMappingId: { in: uniqueStoreMappingIds },
      platform: "IOS",
    },
    select: {
      id: true,
      iosStoreMappingId: true,
    },
  });

  const targetIdByMappingId = new Map(
    targets
      .filter((target) => target.iosStoreMappingId)
      .map((target) => [target.iosStoreMappingId!, target.id]),
  );

  const missingStoreMappingIds = uniqueStoreMappingIds.filter(
    (storeMappingId) => !targetIdByMappingId.has(storeMappingId),
  );

  if (!missingStoreMappingIds.length) {
    return targetIdByMappingId;
  }

  const ensuredTargets = await Promise.all(
    missingStoreMappingIds.map(async (storeMappingId) => ({
      id: await ensureIosReviewTargetsForMapping(storeMappingId),
      storeMappingId,
    })),
  );

  for (const target of ensuredTargets) {
    targetIdByMappingId.set(target.storeMappingId, target.id);
  }

  return targetIdByMappingId;
}

async function iosReviewTargetByMappingId(storeMappingIds: string[]) {
  const targets = await prisma.reviewAppTarget.findMany({
    where: {
      iosStoreMappingId: { in: storeMappingIds },
      platform: "IOS",
    },
    select: {
      id: true,
      iosStoreMappingId: true,
    },
  });

  return new Map(
    targets
      .filter((target) => target.iosStoreMappingId)
      .map((target) => [target.id, target.iosStoreMappingId!]),
  );
}

export function getActiveIosReviewMappings() {
  return prisma.iosStoreMapping.findMany({
    where: { status: "ACTIVE" },
    include: {
      reviewTarget: {
        include: {
          storeTarget: true,
          syncState: true,
          _count: { select: { iosReviews: true } },
        },
      },
      storeProfile: true,
    },
    orderBy: { appName: "asc" },
  });
}

export function getIosReviewMappingById(mappingId: string) {
  return prisma.iosStoreMapping.findUnique({
    where: { id: mappingId },
    include: {
      reviewTarget: {
        include: {
          storeTarget: true,
          syncState: true,
          _count: { select: { iosReviews: true } },
        },
      },
      storeProfile: true,
    },
  });
}

export function updateIosReviewMappingAppleAppId(
  storeMappingId: string,
  appleAppId: string,
) {
  return prisma.$transaction(async (tx) => {
    const mapping = await tx.iosStoreMapping.update({
      where: { id: storeMappingId },
      data: { appleAppId },
      select: { id: true },
    });

    await tx.reviewAppTarget.updateMany({
      where: { iosStoreMappingId: storeMappingId },
      data: { appIdentifier: appleAppId },
    });

    return mapping;
  });
}

export async function getIosReviewRatingGroups(mappingIds: string[]) {
  if (!mappingIds.length) return [];

  const targetById = await iosReviewTargetByMappingId(mappingIds);
  const groups = await prisma.iosStoreReview.groupBy({
    by: ["reviewAppTargetId", "rating"],
    where: {
      reviewAppTargetId: { in: Array.from(targetById.keys()) },
      rating: { not: null },
    },
    _count: { _all: true },
  });

  return groups.flatMap((group): IosReviewRatingGroup[] => {
    const storeMappingId = targetById.get(group.reviewAppTargetId);
    if (!storeMappingId) return [];
    return [{ _count: group._count, rating: group.rating, storeMappingId }];
  });
}

export async function getIosReviewReplyGroups(mappingIds: string[]) {
  if (!mappingIds.length) return [];

  const targetById = await iosReviewTargetByMappingId(mappingIds);
  const groups = await prisma.iosStoreReview.groupBy({
    by: ["reviewAppTargetId"],
    where: {
      developerReplyText: { not: null },
      reviewAppTargetId: { in: Array.from(targetById.keys()) },
    },
    _count: { _all: true },
  });

  return groups.flatMap((group): IosReviewReplyGroup[] => {
    const storeMappingId = targetById.get(group.reviewAppTargetId);
    if (!storeMappingId) return [];
    return [{ _count: group._count, storeMappingId }];
  });
}

type IosReviewPageOptions = {
  rating?: string;
  reply?: string;
  search?: string;
  skip: number;
  storeMappingId: string;
  take: number;
};

async function iosReviewWhere(
  options: IosReviewPageOptions,
): Promise<Prisma.IosStoreReviewWhereInput> {
  const reviewAppTargetId = await iosReviewAppTargetId(options.storeMappingId);
  const where: Prisma.IosStoreReviewWhereInput = { reviewAppTargetId };
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
      { reviewId: contains },
      { reviewText: contains },
      { territory: contains },
      { title: contains },
    ];
  }

  return where;
}

export async function getIosReviewsForMappingPage(
  options: IosReviewPageOptions,
) {
  const where = await iosReviewWhere(options);

  return prisma.$transaction([
    prisma.iosStoreReview.findMany({
      where,
      orderBy: [{ reviewUpdatedAt: "desc" }, { reviewCreatedAt: "desc" }, { fetchedAt: "desc" }],
      skip: options.skip,
      take: options.take,
    }),
    prisma.iosStoreReview.count({ where }),
  ]);
}

export async function getLatestIosReviewForMapping(mappingId: string) {
  const reviewAppTargetId = await iosReviewAppTargetId(mappingId);

  return prisma.iosStoreReview.findFirst({
    where: { reviewAppTargetId },
    orderBy: [{ reviewUpdatedAt: "desc" }, { reviewCreatedAt: "desc" }, { fetchedAt: "desc" }],
  });
}

export function getIosReviewFetchRuns(mappingId: string, take = 10) {
  return prisma.reviewFetchRun.findMany({
    where: {
      appTarget: { iosStoreMappingId: mappingId },
      platform: "IOS",
    },
    orderBy: [{ createdAt: "desc" }],
    take,
  });
}

export async function getIosReviewFingerprints(
  storeMappingId: string,
  reviewIds: string[],
) {
  if (!reviewIds.length) return [];

  const reviewAppTargetId = await iosReviewAppTargetId(storeMappingId);

  return prisma.iosStoreReview.findMany({
    where: {
      reviewAppTargetId,
      reviewId: { in: reviewIds },
    },
    select: {
      developerReplyText: true,
      developerReplyUpdatedAt: true,
      rating: true,
      reviewId: true,
      reviewText: true,
      reviewUpdatedAt: true,
      title: true,
    },
  });
}

export async function enqueueScheduledIosReviewFetchRuns(
  inputs: Array<{
    maxAttempts: number;
    maxResults: number;
    nextAttemptAt: Date;
    scheduledFor: Date;
    sourceScheduleId: string;
    storeMappingId: string;
  }>,
) {
  if (!inputs.length) return { count: 0 };

  const targetIdByMappingId = await iosReviewAppTargetIdByMappingId(
    inputs.map((input) => input.storeMappingId),
  );
  const data = inputs.flatMap((input) => {
    const reviewAppTargetId = targetIdByMappingId.get(input.storeMappingId);
    if (!reviewAppTargetId) return [];

    return {
      maxAttempts: input.maxAttempts,
      maxResults: input.maxResults,
      nextAttemptAt: input.nextAttemptAt,
      platform: "IOS" as const,
      reviewAppTargetId,
      scheduledFor: input.scheduledFor,
      scanMode: "INCREMENTAL" as const,
      sourceScheduleId: input.sourceScheduleId,
      status: "PENDING" as const,
      triggerType: "SCHEDULED" as const,
    };
  });

  if (!data.length) return { count: 0 };

  return prisma.reviewFetchRun.createMany({ data, skipDuplicates: true });
}

export async function enqueueManualIosReviewFetchRuns(
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
      appTarget: { iosStoreMappingId: { in: storeMappingIds } },
      platform: "IOS",
      scanMode: "FULL",
      status: { in: ["PENDING", "RUNNING"] },
    },
    select: {
      appTarget: {
        select: {
          iosStoreMappingId: true,
        },
      },
    },
  });
  const activeFullStoreMappingIds = new Set(
    activeFullRuns
      .map((run) => run.appTarget.iosStoreMappingId)
      .filter((storeMappingId): storeMappingId is string =>
        Boolean(storeMappingId),
      ),
  );
  const enqueueInputs = inputs.filter(
    (input) => !activeFullStoreMappingIds.has(input.storeMappingId),
  );
  const targetIdByMappingId = await iosReviewAppTargetIdByMappingId(
    enqueueInputs.map((input) => input.storeMappingId),
  );
  const data = enqueueInputs.flatMap((input) => {
    const reviewAppTargetId = targetIdByMappingId.get(input.storeMappingId);
    if (!reviewAppTargetId) return [];

    return {
      maxAttempts: input.maxAttempts,
      maxResults: input.maxResults,
      nextAttemptAt: input.nextAttemptAt,
      platform: "IOS" as const,
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

export async function claimPendingIosReviewFetchRuns(input: {
  limit: number;
  lockedBy: string;
  now: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const candidates = await tx.reviewFetchRun.findMany({
      where: {
        appTarget: { iosStoreMappingId: { not: null } },
        platform: "IOS",
        status: "PENDING",
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: input.now } }],
      },
      orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
      select: {
        appTarget: { select: { iosStoreMappingId: true } },
        id: true,
      },
      take: input.limit * 3,
    });
    const claimedStoreMappingIds = new Set<string>();
    const ids = [];
    for (const candidate of candidates) {
      const storeMappingId = candidate.appTarget.iosStoreMappingId;
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
        platform: "IOS",
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
        platform: "IOS",
        status: "RUNNING",
      },
      include: {
        appTarget: {
          include: {
            iosStoreMapping: true,
          },
        },
        sourceSchedule: true,
      },
      orderBy: [{ startedAt: "asc" }],
    });

    return runs.flatMap((run): ClaimedIosReviewFetchRunRecord[] => {
      const storeMapping = run.appTarget.iosStoreMapping;
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

export function retryIosReviewFetchRun(
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

export async function recoverStaleIosReviewFetchRuns(input: {
  errorCode: string;
  errorMessage: string;
  nextAttemptAt: Date;
  staleBefore: Date;
}) {
  const staleRuns = await prisma.reviewFetchRun.findMany({
    where: {
      lockedAt: { lt: input.staleBefore },
      platform: "IOS",
      status: "RUNNING",
    },
    select: {
      attemptCount: true,
      id: true,
      maxAttempts: true,
      reviewAppTargetId: true,
    },
  });
  if (!staleRuns.length) return { failed: 0, retried: 0 };

  const retryIds = staleRuns
    .filter((run) => run.attemptCount < run.maxAttempts)
    .map((run) => run.id);
  const failedRuns = staleRuns.filter(
    (run) => run.attemptCount >= run.maxAttempts,
  );
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

  return { failed: failedIds.length, retried: retryIds.length };
}

export function recoverStaleIosReviewSyncStates(input: {
  errorCode: string;
  errorMessage: string;
  finishedAt: Date;
  staleBefore: Date;
}) {
  return prisma.reviewSyncState.updateMany({
    where: {
      appTarget: { platform: "IOS" },
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

export function deleteOldIosReviewFetchRuns(input: { before: Date }) {
  return prisma.reviewFetchRun.deleteMany({
    where: {
      createdAt: { lt: input.before },
      platform: "IOS",
      status: { in: ["SUCCEEDED", "FAILED", "PARTIAL"] },
    },
  });
}

export function getIosReviewSyncState(storeMappingId: string) {
  return prisma.reviewSyncState.findFirst({
    where: {
      appTarget: { iosStoreMappingId: storeMappingId },
    },
    select: {
      lockedAt: true,
      status: true,
    },
  });
}

export function markIosReviewSyncRunning(
  storeMappingId: string,
  input: {
    lockedBy: string;
    startedAt: Date;
  },
) {
  return iosReviewAppTargetId(storeMappingId).then((reviewAppTargetId) =>
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

export function createIosReviewFetchRun(input: {
  maxResults: number;
  scanMode: ReviewFetchScanMode;
  startedAt: Date;
  storeMappingId: string;
  triggerType: ReviewFetchTrigger;
  lockedBy?: string | null;
  sourceScheduleId?: string | null;
  scheduledFor?: Date | null;
}) {
  return iosReviewAppTargetId(input.storeMappingId).then((reviewAppTargetId) =>
    prisma.reviewFetchRun.create({
      data: {
        attemptCount: 1,
        lockedAt: input.lockedBy ? input.startedAt : null,
        lockedBy: input.lockedBy ?? null,
        maxResults: input.maxResults,
        platform: "IOS",
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

export function finishIosReviewFetchRun(
  runId: string,
  input: {
    errorCode?: string | null;
    errorMessage?: string | null;
    finishedAt: Date;
    lastRateLimitHeader?: string | null;
    nextPageUrl?: string | null;
    pagesFetched: number;
    rateLimitLimit?: number | null;
    rateLimitObservedAt?: Date | null;
    rateLimitRemaining?: number | null;
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
      lastRateLimitHeader: input.lastRateLimitHeader ?? null,
      lockedAt: null,
      lockedBy: null,
      nextPageUrl: input.nextPageUrl ?? null,
      pagesFetched: input.pagesFetched,
      rateLimitLimit: input.rateLimitLimit ?? null,
      rateLimitObservedAt: input.rateLimitObservedAt ?? null,
      rateLimitRemaining: input.rateLimitRemaining ?? null,
      requestCount: input.requestCount,
      reviewsFetched: input.reviewsFetched,
      reviewsUpserted: input.reviewsUpserted,
      status: input.status,
      stopReason: input.stopReason ?? null,
    },
  });
}

export function finishIosReviewSyncState(
  storeMappingId: string,
  input: {
    errorCode?: string | null;
    errorMessage?: string | null;
    finishedAt: Date;
    lastReviewUpdatedAt: Date | null;
    reviewsFetched: number;
    reviewsUpserted: number;
    status: Extract<ReviewSyncStatus, "SUCCEEDED" | "FAILED">;
  },
) {
  return iosReviewAppTargetId(storeMappingId).then((reviewAppTargetId) =>
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

export function getActiveIosCredentialForStoreProfile(storeProfileId: string) {
  return prisma.iosCredential.findFirst({
    where: {
      credentialPurpose: "REVIEW",
      status: "ACTIVE",
      storeProfileId,
    },
    orderBy: { updatedAt: "desc" },
  });
}

export function getIosReviewForReply(storeMappingId: string, reviewId: string) {
  return prisma.iosStoreReview.findFirst({
    where: {
      appTarget: { iosStoreMappingId: storeMappingId },
      reviewId,
    },
    include: {
      appTarget: {
        include: {
          iosStoreMapping: {
            include: {
              reviewTarget: {
                include: {
                  storeTarget: true,
                },
              },
              storeProfile: true,
            },
          },
        },
      },
    },
  });
}

export function updateIosReviewDeveloperReply(
  id: string,
  input: {
    developerReplyId: string | null;
    developerReplyText: string;
    developerReplyUpdatedAt: Date;
  },
) {
  return prisma.iosStoreReview.update({
    where: { id },
    data: {
      developerReplyId: input.developerReplyId,
      developerReplyText: input.developerReplyText,
      developerReplyUpdatedAt: input.developerReplyUpdatedAt,
    },
  });
}

export async function upsertIosReviews(reviews: IosReviewUpsertInput[]) {
  if (!reviews.length) return 0;

  const targetIdByMappingId = await iosReviewAppTargetIdByMappingId(
    reviews.map((review) => review.storeMappingId),
  );
  const rows = reviews.map((review) => {
    const reviewAppTargetId = targetIdByMappingId.get(review.storeMappingId);
    if (!reviewAppTargetId) {
      throw new Error(
        `Review app target was not found for iOS mapping ${review.storeMappingId}.`,
      );
    }

    return { ...review, reviewAppTargetId };
  });

  const results = await prisma.$transaction(
    rows.map((review) =>
      prisma.iosStoreReview.upsert({
        where: {
          reviewAppTargetId_reviewId: {
            reviewAppTargetId: review.reviewAppTargetId,
            reviewId: review.reviewId,
          },
        },
        create: {
          appVersion: review.appVersion,
          authorName: review.authorName,
          developerReplyId: review.developerReplyId,
          developerReplyText: review.developerReplyText,
          developerReplyUpdatedAt: review.developerReplyUpdatedAt,
          fetchedAt: review.fetchedAt,
          rating: review.rating,
          rawReview: nullableJson(review.rawReview),
          reviewAppTargetId: review.reviewAppTargetId,
          reviewCreatedAt: review.reviewCreatedAt,
          reviewId: review.reviewId,
          reviewText: review.reviewText,
          reviewUpdatedAt: review.reviewUpdatedAt,
          territory: review.territory,
          title: review.title,
        },
        update: {
          appVersion: review.appVersion,
          authorName: review.authorName,
          developerReplyId: review.developerReplyId,
          developerReplyText: review.developerReplyText,
          developerReplyUpdatedAt: review.developerReplyUpdatedAt,
          fetchedAt: review.fetchedAt,
          rating: review.rating,
          rawReview: nullableJson(review.rawReview),
          reviewCreatedAt: review.reviewCreatedAt,
          reviewText: review.reviewText,
          reviewUpdatedAt: review.reviewUpdatedAt,
          territory: review.territory,
          title: review.title,
        },
      }),
    ),
  );

  return results.length;
}

export type IosStoreReviewRecord = IosStoreReview;
