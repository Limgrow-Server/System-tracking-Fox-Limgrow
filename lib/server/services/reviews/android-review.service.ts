import "server-only";

import type {
  AndroidStoreReview,
  AndroidStoreReviewFetchRun,
  AndroidStoreReviewReplyTemplate,
  AndroidStoreReviewSyncState,
  Prisma,
} from "@prisma/client";

import { badRequest, notFound } from "@/lib/server/api/errors";
import {
  getActiveAndroidReviewMappings,
  getAndroidReviewFetchRuns,
  getAndroidReviewMappingById,
  getAndroidReviewRatingGroups,
  getAndroidReviewReplyGroups,
  getAndroidReviewReplyTemplates,
  getAndroidReviewsForMapping,
  upsertAndroidReviewReplyTemplate,
} from "@/lib/server/repositories/reviews/android-review.repository";
import { cleanText } from "@/lib/server/services/credentials/credential.shared";
import type {
  AndroidStoreReviewDto,
  AndroidDeviceMetadataDto,
  ReplyConfigBasePageData,
  ReviewAppCard,
  ReviewAppDetailPageData,
  ReviewAppStats,
  ReviewFetchRunDto,
  ReviewRatingBucket,
  ReviewReplyTemplateDto,
  ReviewSyncStateDto,
} from "@/lib/tracking/page-data";

const RATINGS = [5, 4, 3, 2, 1] as const;
const MAX_REPLY_TEXT_LENGTH = 350;

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

  return {
    appIconUrl: mapping.appIconUrl,
    appLink: mapping.appLink,
    appName: mapping.appName,
    averageRating,
    identifier: mapping.packageName,
    lastErrorMessage: mapping.reviewSyncState?.lastErrorMessage ?? null,
    lastFetchedAt: iso(mapping.reviewSyncState?.lastFetchFinishedAt),
    lastSyncStatus: mapping.reviewSyncState
      ? enumText(mapping.reviewSyncState.status)
      : null,
    mappingId: mapping.id,
    pendingReplyCount: Math.max(reviewCount - repliedCount, 0),
    platform: "android",
    repliedCount,
    reviewCount,
    storeAccountName: mapping.storeAccountName,
    storeAvatarUrl: mapping.storeProfile.avatarUrl,
    storeLink: mapping.storeProfile.linkStore,
    storeProfileId: mapping.storeProfileId,
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

function syncStateDto(state: AndroidStoreReviewSyncState | null): ReviewSyncStateDto | null {
  if (!state) return null;

  return {
    lastErrorCode: state.lastErrorCode,
    lastErrorMessage: state.lastErrorMessage,
    lastFetchedCount: state.lastFetchedCount,
    lastFetchFinishedAt: iso(state.lastFetchFinishedAt),
    lastFetchStartedAt: iso(state.lastFetchStartedAt),
    lastReviewUpdatedAt: iso(state.lastReviewUpdatedAt),
    lastSuccessAt: iso(state.lastSuccessAt),
    lastUpsertedCount: state.lastUpsertedCount,
    status: enumText(state.status),
  };
}

function fetchRunDto(run: AndroidStoreReviewFetchRun): ReviewFetchRunDto {
  return {
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    finishedAt: iso(run.finishedAt),
    id: run.id,
    pagesFetched: run.pagesFetched,
    reviewsFetched: run.reviewsFetched,
    reviewsUpserted: run.reviewsUpserted,
    startedAt: run.startedAt.toISOString(),
    status: enumText(run.status),
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

export async function getReviewAppDetail(
  mappingId: string,
  options?: { includeMockData?: boolean },
): Promise<ReviewAppDetailPageData> {
  const mapping = await getAndroidReviewMappingById(mappingId);
  if (!mapping) throw notFound("Android app mapping was not found.");

  const [ratingGroups, replyGroups, reviews, fetchRuns] = await Promise.all([
    getAndroidReviewRatingGroups([mappingId]),
    getAndroidReviewReplyGroups([mappingId]),
    getAndroidReviewsForMapping(mappingId),
    getAndroidReviewFetchRuns(mappingId),
  ]);
  const app = reviewAppCard(mapping, ratingGroups, replyCountByMapping(replyGroups));
  const realReviewDtos = reviews.map(reviewDto);
  const useMockData = Boolean(options?.includeMockData && !realReviewDtos.length);
  const reviewDtos = useMockData ? mockAndroidReviews(mappingId) : realReviewDtos;
  const stats = buildReviewStats(
    app,
    reviewDtos,
    useMockData ? undefined : app.averageRating,
  );

  return {
    app,
    fetchRuns: fetchRuns.map(fetchRunDto),
    isMockData: useMockData,
    reviews: reviewDtos,
    stats,
    syncState: syncStateDto(mapping.reviewSyncState),
  };
}

function templateDto(
  template: AndroidStoreReviewReplyTemplate | null,
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
