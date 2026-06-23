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

export function getAndroidReviewReplyTemplates(mappingIds: string[]) {
  if (!mappingIds.length) return Promise.resolve([]);

  return prisma.androidStoreReviewReplyTemplate.findMany({
    where: { storeMappingId: { in: mappingIds } },
    orderBy: [{ storeMappingId: "asc" }, { rating: "desc" }],
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
