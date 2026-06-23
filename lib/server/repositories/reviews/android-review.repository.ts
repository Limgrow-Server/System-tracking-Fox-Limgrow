import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

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
