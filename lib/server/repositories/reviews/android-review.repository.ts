import "server-only";

import { Prisma, type ReviewFetchRunStatus, type ReviewFetchTrigger } from "@prisma/client";

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

export function getAndroidReviewFetchRuns(mappingId: string, take = 10) {
  return prisma.androidStoreReviewFetchRun.findMany({
    where: { storeMappingId: mappingId },
    orderBy: { startedAt: "desc" },
    take,
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
  maxPages: number;
  maxResults: number;
  startedAt: Date;
  storeMappingId: string;
  triggerType: ReviewFetchTrigger;
}) {
  return prisma.androidStoreReviewFetchRun.create({
    data: {
      maxPages: input.maxPages,
      maxResults: input.maxResults,
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
