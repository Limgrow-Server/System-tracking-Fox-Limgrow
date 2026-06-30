import "server-only";

import { Prisma } from "@prisma/client";
import type {
  AndroidStoreReview,
  ReviewFetchRun,
  ReviewSyncState,
} from "@prisma/client";

import { ApiError, badRequest, conflict, notFound } from "@/lib/server/api/errors";
import { getCredentialVaultSecret } from "@/lib/server/repositories/vault/secret.repository";
import {
  getActiveAndroidCredentialForStoreProfile,
  getActiveAndroidReviewMappings,
  getAndroidReviewFetchRuns,
  getAndroidReviewMappingById,
  getAndroidReviewForReply,
  getAndroidReviewsForMappingPage,
  getAndroidReviewRatingGroups,
  getAndroidReviewReplyGroups,
  getAndroidReviewReplyTemplateForRating,
  getAndroidReviewReplyTemplates,
  getGlobalAndroidReviewFetchSchedule,
  getLatestAndroidReviewForMapping,
  updateAndroidReviewDeveloperReply,
  updateAndroidStoreProfileReplyInfo,
  upsertAndroidReviewReplyTemplate,
  type AndroidReviewReplyTemplateRecord,
} from "@/lib/server/repositories/reviews/android-review.repository";
import { paginatedResult, type PaginationQuery } from "@/lib/server/api/pagination";
import { reviewFetchScheduleDto } from "@/lib/server/services/reviews/android-review-schedule.service";
import {
  cleanText,
  nullableText,
  parseSecretPayload,
  validateGoogleServiceAccountSecret,
} from "@/lib/server/services/credentials/credential.shared";
import { googleServiceAccountAccessToken } from "@/lib/server/services/google/google-service-account";
import type {
  AndroidStoreReviewDto,
  AndroidDeviceMetadataDto,
  ReplyConfigBasePageData,
  ReviewAppCard,
  ReviewAppDetailPageData,
  ReviewAppStats,
  ReviewFetchRunDto,
  ReviewRatingBucket,
  ReviewReplyTemplatePreviewDto,
  ReviewReplyTemplateDto,
  ReviewSyncStateDto,
} from "@/lib/tracking/page-data";
import {
  MAX_REVIEW_REPLY_TEXT_LENGTH,
  renderReviewReplyTemplate,
  type ReviewReplyTemplateContext,
} from "@/lib/tracking/reply-template";

const RATINGS = [5, 4, 3, 2, 1] as const;
const MAX_REPLY_TEXT_LENGTH = MAX_REVIEW_REPLY_TEXT_LENGTH;

type RatingGroup = {
  storeMappingId: string;
  rating: number | null;
  _count: { _all: number };
};

type ReplyGroup = {
  storeMappingId: string;
  _count: { _all: number };
};

type AndroidReviewMapping = Awaited<ReturnType<typeof getActiveAndroidReviewMappings>>[number];

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function enumText(value: unknown) {
  return String(value ?? "").toLowerCase();
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function jsonRecord(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, Prisma.JsonValue>;
}

function jsonString(value: Prisma.JsonValue | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function jsonNumber(value: Prisma.JsonValue | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function latestUserCommentFromRawReview(value: Prisma.JsonValue | null | undefined) {
  const rawReview = jsonRecord(value);
  const comments = rawReview?.comments;
  if (!Array.isArray(comments)) return null;

  let latest: Record<string, Prisma.JsonValue> | null = null;
  let latestSeconds = -1;
  let latestNanos = -1;

  for (const item of comments) {
    const commentItem = jsonRecord(item);
    const userComment = jsonRecord(commentItem?.userComment);
    if (!userComment) continue;

    const lastModified = jsonRecord(userComment.lastModified);
    const seconds = jsonNumber(lastModified?.seconds) ?? 0;
    const nanos = jsonNumber(lastModified?.nanos) ?? 0;

    if (seconds > latestSeconds || (seconds === latestSeconds && nanos > latestNanos)) {
      latest = userComment;
      latestSeconds = seconds;
      latestNanos = nanos;
    }
  }

  return latest;
}

function deviceMetadataDto(
  deviceMetadata: Prisma.JsonValue | null | undefined,
): AndroidDeviceMetadataDto | null {
  const metadata = jsonRecord(deviceMetadata);
  if (!metadata) return null;

  return {
    cpuMake: jsonString(metadata.cpuMake),
    cpuModel: jsonString(metadata.cpuModel),
    deviceClass: jsonString(metadata.deviceClass),
    glEsVersion: jsonNumber(metadata.glEsVersion),
    manufacturer: jsonString(metadata.manufacturer),
    nativePlatform: jsonString(metadata.nativePlatform),
    productName: jsonString(metadata.productName),
    ramMb: jsonNumber(metadata.ramMb),
    screenDensityDpi: jsonNumber(metadata.screenDensityDpi),
    screenHeightPx: jsonNumber(metadata.screenHeightPx),
    screenWidthPx: jsonNumber(metadata.screenWidthPx),
  };
}

function ratingSummary(groups: RatingGroup[]) {
  const countByRating = new Map<number, number>();
  let total = 0;
  let weighted = 0;

  for (const group of groups) {
    if (!group.rating) continue;
    const count = group._count._all;
    countByRating.set(group.rating, count);
    total += count;
    weighted += group.rating * count;
  }

  return {
    averageRating: total ? weighted / total : null,
    countByRating,
  };
}

function replyCountByMapping(groups: ReplyGroup[]) {
  return new Map(groups.map((group) => [group.storeMappingId, group._count._all]));
}

function reviewAppCard(
  mapping: AndroidReviewMapping,
  ratingGroups: RatingGroup[],
  replyCounts: Map<string, number>,
): ReviewAppCard {
  const reviewCount = mapping._count.reviews;
  const { averageRating } = ratingSummary(ratingGroups);
  const repliedCount = replyCounts.get(mapping.id) ?? 0;
  const syncState = mapping.reviewTarget?.syncState ?? null;

  return {
    appIconUrl: mapping.appIconUrl,
    appLink: mapping.appLink,
    appName: mapping.appName,
    averageRating,
    identifier: mapping.packageName,
    lastErrorMessage: syncState?.lastErrorMessage ?? null,
    lastFetchedAt: iso(syncState?.lastFetchFinishedAt),
    lastSyncStatus: syncState ? enumText(syncState.status) : null,
    mappingId: mapping.id,
    pendingReplyCount: Math.max(reviewCount - repliedCount, 0),
    platform: "android",
    repliedCount,
    reviewCount,
    storeAccountName: mapping.storeAccountName,
    storeAvatarUrl: mapping.storeProfile.avatarUrl,
    storeContactEmail: mapping.storeProfile.contactEmail,
    storeLink: mapping.storeProfile.linkStore,
    storeProfileId: mapping.storeProfileId,
    storeSupportPhone: mapping.storeProfile.supportPhone,
    storeWebsiteUrl: mapping.storeProfile.websiteUrl,
  };
}

export async function getReviewAppCards(): Promise<ReviewAppCard[]> {
  const mappings = await getActiveAndroidReviewMappings();
  const mappingIds = mappings.map((mapping) => mapping.id);
  const [ratingGroups, replyGroups] = await Promise.all([
    getAndroidReviewRatingGroups(mappingIds),
    getAndroidReviewReplyGroups(mappingIds),
  ]);
  const replyCounts = replyCountByMapping(replyGroups);

  return mappings.map((mapping) =>
    reviewAppCard(
      mapping,
      ratingGroups.filter((group) => group.storeMappingId === mapping.id),
      replyCounts,
    ),
  );
}

export function reviewStoreOptions(apps: ReviewAppCard[]) {
  const stores = new Map<string, string>();

  for (const app of apps) {
    if (!app.storeProfileId || stores.has(app.storeProfileId)) continue;
    stores.set(app.storeProfileId, app.storeAccountName);
  }

  return Array.from(stores.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function filterReviewAppCards<T extends ReviewAppCard>(
  apps: T[],
  filters: {
    search?: string;
    storeProfileId?: string;
  },
) {
  const search = filters.search?.trim().toLowerCase();

  return apps.filter((app) => {
    const matchesSearch =
      !search ||
      app.appName.toLowerCase().includes(search) ||
      app.identifier.toLowerCase().includes(search) ||
      app.storeAccountName.toLowerCase().includes(search);
    const matchesStore =
      !filters.storeProfileId ||
      filters.storeProfileId === "all" ||
      app.storeProfileId === filters.storeProfileId;

    return matchesSearch && matchesStore;
  });
}

export function paginateReviewAppCards<T extends ReviewAppCard>(
  apps: T[],
  pagination: PaginationQuery,
) {
  return paginatedResult(
    apps.slice(pagination.skip, pagination.skip + pagination.take),
    apps.length,
    pagination,
  );
}

function reviewDto(review: AndroidStoreReview): AndroidStoreReviewDto {
  const rawUserComment = latestUserCommentFromRawReview(review.rawReview);

  return {
    androidOsVersion: review.androidOsVersion,
    appVersionCode: review.appVersionCode,
    appVersionName: review.appVersionName,
    authorName: review.authorName,
    developerReplyText: review.developerReplyText,
    developerReplyUpdatedAt: iso(review.developerReplyUpdatedAt),
    device: review.device,
    deviceMetadata:
      deviceMetadataDto(review.deviceMetadata) ??
      deviceMetadataDto(rawUserComment?.deviceMetadata),
    fetchedAt: review.fetchedAt.toISOString(),
    id: review.id,
    originalText: review.originalText,
    rating: review.rating,
    rawReview: review.rawReview,
    reviewerLanguage: review.reviewerLanguage,
    reviewId: review.reviewId,
    reviewText: review.reviewText,
    thumbsDownCount: review.thumbsDownCount,
    thumbsUpCount: review.thumbsUpCount,
    userCommentUpdatedAt: iso(review.userCommentUpdatedAt),
  };
}

function syncStateDto(state: ReviewSyncState | null): ReviewSyncStateDto | null {
  if (!state) return null;

  return {
    lastErrorCode: state.lastErrorCode,
    lastErrorMessage: state.lastErrorMessage,
    lastFetchedCount: state.lastFetchedCount,
    lastFetchFinishedAt: iso(state.lastFetchFinishedAt),
    lastFetchStartedAt: iso(state.lastFetchStartedAt),
    lastReviewUpdatedAt: iso(state.lastReviewActivityAt),
    lastSuccessAt: iso(state.lastSuccessAt),
    lastUpsertedCount: state.lastUpsertedCount,
    status: enumText(state.status),
  };
}

function fetchRunDto(run: ReviewFetchRun): ReviewFetchRunDto {
  return {
    attemptCount: run.attemptCount,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    finishedAt: iso(run.finishedAt),
    id: run.id,
    maxAttempts: run.maxAttempts,
    nextAttemptAt: iso(run.nextAttemptAt),
    nextPageToken: run.nextPageToken,
    pagesFetched: run.pagesFetched,
    requestCount: run.requestCount,
    reviewsFetched: run.reviewsFetched,
    reviewsUpserted: run.reviewsUpserted,
    scanMode: enumText(run.scanMode),
    scheduledFor: iso(run.scheduledFor),
    startedAt: iso(run.startedAt),
    status: enumText(run.status),
    stopReason: run.stopReason ? enumText(run.stopReason) : null,
    triggerType: enumText(run.triggerType),
  };
}

function buildRatingBuckets(reviews: AndroidStoreReviewDto[]): ReviewRatingBucket[] {
  const total = Math.max(reviews.filter((review) => review.rating).length, 1);

  return RATINGS.map((rating) => {
    const count = reviews.filter((review) => review.rating === rating).length;
    return {
      count,
      rating,
      share: Math.round((count / total) * 100),
    };
  });
}

function buildRatingBucketsFromGroups(groups: RatingGroup[]): ReviewRatingBucket[] {
  const total = Math.max(
    groups.reduce((sum, group) => sum + group._count._all, 0),
    1,
  );
  const countByRating = new Map(
    groups
      .filter((group) => group.rating)
      .map((group) => [group.rating!, group._count._all]),
  );

  return RATINGS.map((rating) => {
    const count = countByRating.get(rating) ?? 0;
    return {
      count,
      rating,
      share: Math.round((count / total) * 100),
    };
  });
}

function mockReview(
  storeMappingId: string,
  reviewId: string,
  rating: number,
  daysAgo: number,
  payload: {
    appVersionName: string;
    authorName: string;
    developerReplyText?: string;
    device: string;
    deviceMetadata?: AndroidDeviceMetadataDto;
    originalText?: string;
    reviewText: string;
    thumbsDownCount: number;
    thumbsUpCount: number;
  },
): AndroidStoreReviewDto {
  const updatedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const replyUpdatedAt = payload.developerReplyText
    ? new Date(updatedAt.getTime() + 8 * 60 * 60 * 1000)
    : null;

  return {
    androidOsVersion: 35,
    appVersionCode: 124,
    appVersionName: payload.appVersionName,
    authorName: payload.authorName,
    developerReplyText: payload.developerReplyText ?? null,
    developerReplyUpdatedAt: iso(replyUpdatedAt),
    device: payload.device,
    deviceMetadata: payload.deviceMetadata ?? null,
    fetchedAt: new Date().toISOString(),
    id: `mock-${storeMappingId}-${reviewId}`,
    originalText: payload.originalText ?? null,
    rating,
    rawReview: {
      mock: true,
      reviewId,
      comments: [
        {
          userComment: {
            starRating: rating,
            text: payload.reviewText,
            device: payload.device,
            deviceMetadata: payload.deviceMetadata ?? null,
            lastModified: {
              seconds: Math.floor(updatedAt.getTime() / 1000),
            },
          },
        },
      ],
    },
    reviewerLanguage: "en",
    reviewId,
    reviewText: payload.reviewText,
    thumbsDownCount: payload.thumbsDownCount,
    thumbsUpCount: payload.thumbsUpCount,
    userCommentUpdatedAt: updatedAt.toISOString(),
  };
}

function mockAndroidReviews(mappingId: string): AndroidStoreReviewDto[] {
  return [
    mockReview(mappingId, "mock-review-5-star", 5, 1, {
      appVersionName: "2.8.1",
      authorName: "Mia Turner",
      developerReplyText:
        "Thank you for the kind review. We are glad the latest keyboard theme works well for you.",
      device: "Pixel 8",
      deviceMetadata: {
        cpuMake: "Google",
        cpuModel: "Tensor G3",
        deviceClass: "phone",
        glEsVersion: null,
        manufacturer: "Google",
        nativePlatform: "arm64-v8a",
        productName: "Pixel 8",
        ramMb: 8192,
        screenDensityDpi: 428,
        screenHeightPx: 2400,
        screenWidthPx: 1080,
      },
      reviewText:
        "The LED keyboard looks clean and the typing sound feels much better after the latest update.",
      thumbsDownCount: 0,
      thumbsUpCount: 18,
    }),
    mockReview(mappingId, "mock-review-4-star", 4, 2, {
      appVersionName: "2.8.1",
      authorName: "Duc Nguyen",
      device: "Galaxy S24",
      deviceMetadata: {
        cpuMake: "Qualcomm",
        cpuModel: "Snapdragon 8 Gen 3",
        deviceClass: "phone",
        glEsVersion: null,
        manufacturer: "Samsung",
        nativePlatform: "arm64-v8a",
        productName: "Galaxy S24",
        ramMb: 8192,
        screenDensityDpi: 416,
        screenHeightPx: 2340,
        screenWidthPx: 1080,
      },
      reviewText:
        "Nice themes and easy setup. I would like more Vietnamese color presets in the next release.",
      thumbsDownCount: 1,
      thumbsUpCount: 9,
    }),
    mockReview(mappingId, "mock-review-3-star", 3, 4, {
      appVersionName: "2.8.0",
      authorName: "Sofia Lee",
      developerReplyText:
        "Thanks for reporting this. Please update to the newest version and contact support if the delay remains.",
      device: "Xiaomi 13",
      deviceMetadata: {
        cpuMake: "Qualcomm",
        cpuModel: "Snapdragon 8 Gen 2",
        deviceClass: "phone",
        glEsVersion: null,
        manufacturer: "Xiaomi",
        nativePlatform: "arm64-v8a",
        productName: "Xiaomi 13",
        ramMb: 12288,
        screenDensityDpi: 414,
        screenHeightPx: 2400,
        screenWidthPx: 1080,
      },
      reviewText:
        "The app is useful, but the keyboard sometimes opens slowly when switching from chat apps.",
      thumbsDownCount: 2,
      thumbsUpCount: 5,
    }),
    mockReview(mappingId, "mock-review-2-star", 2, 7, {
      appVersionName: "2.7.9",
      authorName: "Alex Morgan",
      device: "OnePlus 12",
      originalText:
        "Battery use increased after enabling animated background and haptic feedback.",
      reviewText:
        "Battery use increased after enabling animated background and haptic feedback.",
      thumbsDownCount: 4,
      thumbsUpCount: 3,
    }),
    mockReview(mappingId, "mock-review-1-star", 1, 10, {
      appVersionName: "2.7.8",
      authorName: "Anonymous reviewer",
      device: "Samsung A55",
      reviewText:
        "Ads appear too often and interrupt keyboard customization. Please reduce the frequency.",
      thumbsDownCount: 6,
      thumbsUpCount: 2,
    }),
  ];
}

function filterMockReviews(
  reviews: AndroidStoreReviewDto[],
  filters: {
    rating?: string;
    reply?: string;
    search?: string;
  },
) {
  const search = filters.search?.trim().toLowerCase();

  return reviews.filter((review) => {
    const matchesSearch =
      !search ||
      (review.reviewText ?? "").toLowerCase().includes(search) ||
      (review.originalText ?? "").toLowerCase().includes(search) ||
      (review.authorName ?? "").toLowerCase().includes(search) ||
      review.reviewId.toLowerCase().includes(search);
    const matchesRating =
      !filters.rating ||
      filters.rating === "all" ||
      String(review.rating ?? "") === filters.rating;
    const hasReply = Boolean(review.developerReplyText);
    const matchesReply =
      !filters.reply ||
      filters.reply === "all" ||
      (filters.reply === "replied" && hasReply) ||
      (filters.reply === "pending" && !hasReply);

    return matchesSearch && matchesRating && matchesReply;
  });
}

function buildReviewStats(
  app: ReviewAppCard,
  reviewDtos: AndroidStoreReviewDto[],
  averageRating?: number | null,
): ReviewAppStats {
  const repliedCount = reviewDtos.filter((review) => review.developerReplyText).length;
  const totalReviews = reviewDtos.length;
  const ratingSummaryForReviews = ratingSummary(
    reviewDtos.map((review) => ({
      _count: { _all: 1 },
      rating: review.rating,
      storeMappingId: app.mappingId,
    })),
  );
  const latestReviewAt =
    reviewDtos
      .map((review) => review.userCommentUpdatedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  return {
    averageRating: averageRating ?? ratingSummaryForReviews.averageRating,
    latestReviewAt,
    pendingReplyCount: Math.max(totalReviews - repliedCount, 0),
    ratingBuckets: buildRatingBuckets(reviewDtos),
    repliedCount,
    replyCoverage: totalReviews ? Math.round((repliedCount / totalReviews) * 100) : 0,
    totalReviews,
  };
}

function buildReviewStatsFromGroups(
  app: ReviewAppCard,
  ratingGroups: RatingGroup[],
  latestReviewAt: string | null,
): ReviewAppStats {
  const { averageRating } = ratingSummary(ratingGroups);

  return {
    averageRating,
    latestReviewAt,
    pendingReplyCount: app.pendingReplyCount,
    ratingBuckets: buildRatingBucketsFromGroups(ratingGroups),
    repliedCount: app.repliedCount,
    replyCoverage: app.reviewCount
      ? Math.round((app.repliedCount / app.reviewCount) * 100)
      : 0,
    totalReviews: app.reviewCount,
  };
}

function renderReplyTemplatePreviewText(
  templateText: string,
  context: ReviewReplyTemplateContext,
) {
  return renderReviewReplyTemplate(templateText, context);
}

function replyTemplateContext(input: {
  appName?: string | null;
  authorName?: string | null;
  contactEmail: string | null;
  storeName?: string | null;
  supportPhone: string | null;
  websiteUrl: string | null;
}): ReviewReplyTemplateContext {
  return {
    appName: input.appName,
    authorName: input.authorName,
    contactEmail: input.contactEmail,
    storeName: input.storeName,
    supportPhone: input.supportPhone,
    websiteUrl: input.websiteUrl,
  };
}

function replyTemplatePreviewDto(
  template: AndroidReviewReplyTemplateRecord | null,
  storeMappingId: string,
  rating: number,
  context: ReviewReplyTemplateContext,
): ReviewReplyTemplatePreviewDto {
  const dto = templateDto(template, storeMappingId, rating);

  return {
    ...dto,
    resolvedReplyText: renderReplyTemplatePreviewText(dto.replyText, context),
  };
}

export async function getReviewAppDetail(
  mappingId: string,
  options?: {
    includeMockData?: boolean;
    rating?: string;
    reply?: string;
    reviewPagination?: PaginationQuery;
    search?: string;
  },
): Promise<ReviewAppDetailPageData> {
  const mapping = await getAndroidReviewMappingById(mappingId);
  if (!mapping) throw notFound("Android app mapping was not found.");
  const reviewPagination = options?.reviewPagination ?? {
    page: 1,
    pageSize: 10,
    skip: 0,
    take: 10,
  };

  const [
    ratingGroups,
    replyGroups,
    reviewsPage,
    fetchRuns,
    fetchSchedule,
    templates,
    latestReview,
  ] = await Promise.all([
    getAndroidReviewRatingGroups([mappingId]),
    getAndroidReviewReplyGroups([mappingId]),
    getAndroidReviewsForMappingPage({
      rating: options?.rating,
      reply: options?.reply,
      search: options?.search,
      skip: reviewPagination.skip,
      storeMappingId: mappingId,
      take: reviewPagination.take,
    }),
    getAndroidReviewFetchRuns(mappingId),
    getGlobalAndroidReviewFetchSchedule(),
    getAndroidReviewReplyTemplates([mappingId]),
    getLatestAndroidReviewForMapping(mappingId),
  ]);
  const [reviews, reviewTotal] = reviewsPage;
  const app = reviewAppCard(mapping, ratingGroups, replyCountByMapping(replyGroups));
  const realReviewDtos = reviews.map(reviewDto);
  const useMockData = Boolean(options?.includeMockData && !reviewTotal);
  let reviewDtos = realReviewDtos;
  let total = reviewTotal;
  let stats = buildReviewStatsFromGroups(
    app,
    ratingGroups,
    iso(latestReview?.userCommentUpdatedAt ?? latestReview?.fetchedAt),
  );

  if (useMockData) {
    const mockReviews = filterMockReviews(mockAndroidReviews(mappingId), {
      rating: options?.rating,
      reply: options?.reply,
      search: options?.search,
    });
    reviewDtos = mockReviews.slice(
      reviewPagination.skip,
      reviewPagination.skip + reviewPagination.take,
    );
    total = mockReviews.length;
    stats = buildReviewStats(app, mockAndroidReviews(mappingId));
  }
  const paginatedReviews = paginatedResult(reviewDtos, total, reviewPagination);

  return {
    app,
    fetchSchedule: reviewFetchScheduleDto(fetchSchedule),
    fetchRuns: fetchRuns.map(fetchRunDto),
    isMockData: useMockData,
    replyTemplates: RATINGS.map((rating) =>
      replyTemplatePreviewDto(
        templates.find((template) => template.rating === rating) ?? null,
        mappingId,
        rating,
        replyTemplateContext({
          appName: mapping.appName,
          contactEmail: mapping.storeProfile.contactEmail,
          storeName: mapping.storeProfile.storeAccountName,
          supportPhone: mapping.storeProfile.supportPhone,
          websiteUrl: mapping.storeProfile.websiteUrl,
        }),
      ),
    ),
    reviewFilters: {
      rating: options?.rating ?? "all",
      reply: options?.reply ?? "all",
      search: options?.search ?? "",
    },
    reviewPagination: {
      page: paginatedReviews.page,
      pageSize: paginatedReviews.pageSize,
      total: paginatedReviews.total,
      totalPages: paginatedReviews.totalPages,
    },
    reviews: paginatedReviews.data,
    stats,
    syncState: syncStateDto(mapping.reviewTarget?.syncState ?? null),
  };
}

function templateDto(
  template: AndroidReviewReplyTemplateRecord | null,
  storeMappingId: string,
  rating: number,
): ReviewReplyTemplateDto {
  return {
    id: template?.id ?? null,
    isActive: template?.isActive ?? false,
    rating,
    replyText: template?.replyText ?? "",
    storeMappingId,
    updatedAt: iso(template?.updatedAt),
    updatedBy: template?.updatedBy ?? null,
  };
}

export async function getReplyConfigPageData(): Promise<ReplyConfigBasePageData> {
  const apps = await getReviewAppCards();
  const templates = await getAndroidReviewReplyTemplates(
    apps.map((app) => app.mappingId),
  );
  const templatesByMappingId: ReplyConfigBasePageData["templatesByMappingId"] = {};

  for (const app of apps) {
    templatesByMappingId[app.mappingId] = RATINGS.map((rating) =>
      templateDto(
        templates.find(
          (template) =>
            template.storeMappingId === app.mappingId && template.rating === rating,
        ) ?? null,
        app.mappingId,
        rating,
      ),
    );
  }

  return {
    apps,
    templatesByMappingId,
  };
}

export type SaveReviewReplyTemplatesPayload = {
  storeMappingId?: unknown;
  templates?: Array<{
    isActive?: unknown;
    rating?: unknown;
    replyText?: unknown;
  }>;
};

export type SaveReplyStoreInfoPayload = {
  contactEmail?: unknown;
  storeProfileId?: unknown;
  supportPhone?: unknown;
  websiteUrl?: unknown;
};

export type SendAndroidReviewReplyPayload = {
  reviewId?: unknown;
  storeMappingId?: unknown;
};

function normalizeTemplatePayload(payload: SaveReviewReplyTemplatesPayload) {
  const storeMappingId = cleanText(payload.storeMappingId);
  const templates = Array.isArray(payload.templates) ? payload.templates : [];

  if (!storeMappingId) {
    throw badRequest("Android app mapping is required.");
  }

  if (templates.length !== RATINGS.length) {
    throw badRequest("Reply templates for ratings 1 to 5 are required.");
  }

  const normalized = templates.map((template) => {
    const rating = Number(template.rating);
    const replyText =
      typeof template.replyText === "string" ? template.replyText.trim() : "";

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw badRequest("Template rating must be between 1 and 5.");
    }

    const isActive = Boolean(template.isActive ?? false);

    if (replyText.length > MAX_REPLY_TEXT_LENGTH) {
      throw badRequest("Reply text must be 350 characters or fewer.");
    }

    if (isActive && !replyText) {
      throw badRequest("Active reply templates must have reply text.");
    }

    return {
      isActive,
      rating,
      replyText,
    };
  });

  const uniqueRatings = new Set(normalized.map((template) => template.rating));
  if (uniqueRatings.size !== RATINGS.length) {
    throw badRequest("Reply template ratings must be unique.");
  }

  return {
    storeMappingId,
    templates: normalized,
  };
}

export async function saveReviewReplyTemplates(
  payload: SaveReviewReplyTemplatesPayload,
  authEmail: string,
) {
  const normalized = normalizeTemplatePayload(payload);
  const mapping = await getAndroidReviewMappingById(normalized.storeMappingId);
  if (!mapping) throw notFound("Android app mapping was not found.");

  const templates = await Promise.all(
    normalized.templates.map((template) =>
      upsertAndroidReviewReplyTemplate({
        createdBy: authEmail,
        isActive: template.isActive,
        rating: template.rating,
        replyText: template.replyText,
        storeMappingId: normalized.storeMappingId,
        updatedBy: authEmail,
      }),
    ),
  );

  return {
    message: `Reply templates for ${mapping.appName} have been saved.`,
    templates: templates.map((template) =>
      templateDto(template, normalized.storeMappingId, template.rating),
    ),
  };
}

function normalizeStoreInfoPayload(payload: SaveReplyStoreInfoPayload) {
  const storeProfileId = cleanText(payload.storeProfileId);
  const contactEmail = nullableText(payload.contactEmail);
  const supportPhone = nullableText(payload.supportPhone);
  const websiteUrl = nullableText(payload.websiteUrl);

  if (!storeProfileId || !isUuid(storeProfileId)) {
    throw badRequest("Store profile is required.");
  }

  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    throw badRequest("Contact email is invalid.");
  }

  if (websiteUrl) {
    try {
      const url = new URL(websiteUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("unsupported_protocol");
      }
    } catch {
      throw badRequest("Website URL is invalid.");
    }
  }

  return {
    contactEmail,
    storeProfileId,
    supportPhone,
    websiteUrl,
  };
}

export async function saveReplyStoreInfo(
  payload: SaveReplyStoreInfoPayload,
) {
  const normalized = normalizeStoreInfoPayload(payload);
  const store = await updateAndroidStoreProfileReplyInfo(
    normalized.storeProfileId,
    {
      contactEmail: normalized.contactEmail,
      supportPhone: normalized.supportPhone,
      websiteUrl: normalized.websiteUrl,
    },
  ).catch((error: unknown) => {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw notFound("Android store profile was not found.");
    }

    throw error;
  });

  return {
    message: `Store info for ${store.storeAccountName} has been saved.`,
    store: {
      contactEmail: store.contactEmail,
      storeAccountName: store.storeAccountName,
      storeProfileId: store.id,
      supportPhone: store.supportPhone,
      websiteUrl: store.websiteUrl,
    },
  };
}

function normalizeSendReplyPayload(payload: SendAndroidReviewReplyPayload) {
  const storeMappingId = cleanText(payload.storeMappingId);
  const reviewId = cleanText(payload.reviewId);

  if (!storeMappingId || !isUuid(storeMappingId)) {
    throw badRequest("Android app mapping is required.");
  }

  if (!reviewId) {
    throw badRequest("Review ID is required.");
  }

  return { reviewId, storeMappingId };
}

function renderReplyText(
  templateText: string,
  context: ReviewReplyTemplateContext,
) {
  const replyText = renderReviewReplyTemplate(templateText, context);

  if (!replyText) {
    throw badRequest("Reply template is empty.");
  }

  if (replyText.length > MAX_REPLY_TEXT_LENGTH) {
    throw badRequest("Reply text must be 350 characters or fewer.");
  }

  return replyText;
}

function timestampToDate(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const timestamp = value as Record<string, unknown>;
  const seconds = Number(timestamp.seconds);
  const nanos = Number(timestamp.nanos ?? 0);

  if (!Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000 + Math.floor((Number.isFinite(nanos) ? nanos : 0) / 1_000_000));
}

function recordValue(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function googleError(body: Record<string, unknown>) {
  return recordValue(body.error) ?? body;
}

function googleErrorText(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function throwGooglePlayReplyError(status: number, body: Record<string, unknown>): never {
  const error = googleError(body);
  const providerStatus = googleErrorText(error.status);
  const providerCode = googleErrorText(error.code);

  if (status === 404 || providerStatus === "NOT_FOUND" || providerCode === "404") {
    throw conflict(
      "Google Play could not find this review ID. The review may have been deleted, removed, or become unavailable to the API.",
    );
  }

  if (status === 403 || providerStatus === "PERMISSION_DENIED" || providerCode === "403") {
    throw new ApiError(
      "Google Play credential is not allowed to reply to this review.",
      502,
    );
  }

  const shortCode = [providerCode, providerStatus].filter(Boolean).join(" ");
  throw new ApiError(
    shortCode
      ? `Google Play review reply failed: ${shortCode}.`
      : "Google Play review reply failed.",
    502,
  );
}

async function replyToGooglePlayReview(input: {
  accessToken: string;
  packageName: string;
  replyText: string;
  reviewId: string;
}) {
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
    input.packageName,
  )}/reviews/${encodeURIComponent(input.reviewId)}:reply`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ replyText: input.replyText }),
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    throwGooglePlayReplyError(response.status, body);
  }

  return body;
}

export async function sendAndroidReviewReply(
  payload: SendAndroidReviewReplyPayload,
) {
  const { reviewId, storeMappingId } = normalizeSendReplyPayload(payload);
  const review = await getAndroidReviewForReply(storeMappingId, reviewId);
  if (!review) throw notFound("Android review was not found.");

  if (!review.rating) {
    throw badRequest("Review does not have a rating for template lookup.");
  }

  const template = await getAndroidReviewReplyTemplateForRating(
    storeMappingId,
    review.rating,
  );

  if (!template?.isActive || !template.replyText.trim()) {
    throw badRequest(`${review.rating}-star reply template is not active.`);
  }

  const storeProfile = review.storeMapping.storeProfile;
  const replyText = renderReplyText(template.replyText, replyTemplateContext({
    appName: review.storeMapping.appName,
    authorName: review.authorName,
    contactEmail: storeProfile.contactEmail,
    storeName: storeProfile.storeAccountName,
    supportPhone: storeProfile.supportPhone,
    websiteUrl: storeProfile.websiteUrl,
  }));
  const credential = await getActiveAndroidCredentialForStoreProfile(
    review.storeMapping.storeProfileId,
  );
  if (!credential) {
    throw badRequest("No active Android service-account credential was found.");
  }

  const secretText = await getCredentialVaultSecret(credential.vaultSecretId);
  const serviceAccount = parseSecretPayload(secretText, "json");
  if (!validateGoogleServiceAccountSecret(serviceAccount)) {
    throw badRequest("Android service-account credential is invalid.");
  }

  const accessToken = await googleServiceAccountAccessToken(serviceAccount);
  const googleResponse = await replyToGooglePlayReview({
    accessToken,
    packageName: review.storeMapping.packageName,
    replyText,
    reviewId,
  });
  const result =
    googleResponse.result &&
    typeof googleResponse.result === "object" &&
    !Array.isArray(googleResponse.result)
      ? (googleResponse.result as Record<string, unknown>)
      : {};
  const appliedReplyText =
    typeof result.replyText === "string" ? result.replyText : replyText;
  const repliedAt = timestampToDate(result.lastEdited) ?? new Date();

  await updateAndroidReviewDeveloperReply(review.id, {
    developerReplyText: appliedReplyText,
    developerReplyUpdatedAt: repliedAt,
  });

  return {
    developerReplyText: appliedReplyText,
    developerReplyUpdatedAt: repliedAt.toISOString(),
    message: "Reply sent to Google Play.",
    reviewId,
    storeMappingId,
  };
}
