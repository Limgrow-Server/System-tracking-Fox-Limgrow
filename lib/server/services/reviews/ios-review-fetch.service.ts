import "server-only";

import {
  Prisma,
  type ReviewFetchRunStatus,
  type ReviewFetchScanMode,
  type ReviewFetchStopReason,
  type ReviewFetchTrigger,
} from "@prisma/client";

import { badRequest, conflict, notFound } from "@/lib/server/api/errors";
import {
  appleAppStoreConnectToken,
  parseAppleRateLimit,
  readAppleJson,
  resolveAppleAscCredential,
  throwAppleApiError,
} from "@/lib/server/services/apple/app-store-connect";
import { cleanText } from "@/lib/server/services/credentials/credential.shared";
import {
  type IosReviewFingerprint,
  type IosReviewUpsertInput,
  createIosReviewFetchRun,
  enqueueManualIosReviewFetchRuns,
  finishIosReviewFetchRun,
  finishIosReviewSyncState,
  getActiveIosCredentialForStoreProfile,
  getActiveIosReviewMappings,
  getIosReviewFingerprints,
  getIosReviewMappingById,
  getIosReviewSyncState,
  markIosReviewSyncRunning,
  updateIosReviewMappingAppleAppId,
  upsertIosReviews,
} from "@/lib/server/repositories/reviews/ios-review.repository";
import { firstAppleAppStoreId } from "@/lib/tracking/identity";

const DEFAULT_MAX_RESULTS = 100;
const DEFAULT_MAX_PAGES = 2;
const MAX_ALLOWED_RESULTS = 200;
const MAX_ALLOWED_PAGES = 20;
const FULL_SCAN_SAFE_REQUEST_LIMIT = 300;
const FULL_SCAN_MAX_ATTEMPTS = 3;
const LOCK_TTL_MS = 10 * 60 * 1000;
const APPLE_RATE_LIMIT_MIN_REMAINING = 20;

type FetchRunContext = {
  runId: string;
  storeMappingId: string;
};

type NormalizedIosReview = {
  developerReplyUpdatedAt: Date | null;
  latestUpdatedAt: Date | null;
  reviewId: string;
  row: IosReviewUpsertInput;
};

export type FetchIosReviewsPayload = {
  fetchAllPages?: unknown;
  fromDate?: unknown;
  maxPages?: unknown;
  maxResults?: unknown;
  nextPageUrl?: unknown;
  scanMode?: unknown;
  storeMappingId?: unknown;
  timezoneOffsetMinutes?: unknown;
  toDate?: unknown;
  triggerType?: unknown;
};

export type ClaimedIosReviewFetchRun = {
  attemptCount?: number;
  id: string;
  lockedBy: string | null;
  maxResults: number;
  nextPageUrl: string | null;
  scanMode: ReviewFetchScanMode;
  scheduledFor: Date | null;
  sourceScheduleId: string | null;
  startedAt: Date | null;
  storeMappingId: string;
  triggerType: ReviewFetchTrigger;
};

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function booleanValue(value: unknown) {
  if (typeof value === "boolean") return value;
  const text = cleanText(value).toLowerCase();
  return text === "true" || text === "1";
}

function normalizeTriggerType(value: unknown): ReviewFetchTrigger {
  const triggerType = cleanText(value).toLowerCase();
  if (triggerType === "manual") return "MANUAL";
  if (triggerType === "retry") return "RETRY";
  return "SCHEDULED";
}

function normalizeScanMode(
  value: unknown,
  triggerType: ReviewFetchTrigger,
  fetchAllPages: unknown,
): ReviewFetchScanMode {
  const scanMode = cleanText(value).toLowerCase();
  if (scanMode === "full") return "FULL";
  if (scanMode === "incremental") return "INCREMENTAL";
  if (scanMode === "limited") return "LIMITED";
  if (booleanValue(fetchAllPages)) return "FULL";
  if (triggerType === "SCHEDULED") return "INCREMENTAL";
  return "LIMITED";
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function objectValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function parseIsoDate(value: unknown) {
  const text = stringValue(value);
  if (!text) return null;
  const date = new Date(text);
  return Number.isFinite(date.getTime()) ? date : null;
}

function latestDate(current: Date | null, candidate: Date | null) {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate.getTime() > current.getTime() ? candidate : current;
}

function sameTime(left: Date | null, right: Date | null) {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

function normalizeDateRange(input: {
  fromDate: unknown;
  toDate: unknown;
}) {
  const from = parseIsoDate(input.fromDate);
  const to = parseIsoDate(input.toDate);

  return {
    fromDate: from,
    toDate: to,
  };
}

function reviewMatchesDateRange(
  review: NormalizedIosReview,
  range: { fromDate: Date | null; toDate: Date | null },
) {
  if (!range.fromDate && !range.toDate) return true;
  const updatedAt = review.latestUpdatedAt;
  if (!updatedAt) return false;
  if (range.fromDate && updatedAt.getTime() < range.fromDate.getTime()) {
    return false;
  }
  if (range.toDate && updatedAt.getTime() > range.toDate.getTime()) {
    return false;
  }
  return true;
}

function includedResponseById(body: Record<string, unknown>) {
  const responses = new Map<string, Record<string, unknown>>();

  for (const item of arrayValue(body.included)) {
    const record = objectValue(item);
    if (!record || record.type !== "customerReviewResponses") continue;
    const id = stringValue(record.id);
    if (id) responses.set(id, record);
  }

  return responses;
}

function responseForReview(
  review: Record<string, unknown>,
  responses: Map<string, Record<string, unknown>>,
) {
  const relationships = objectValue(review.relationships);
  const responseRelationship = objectValue(relationships?.response);
  const responseData = objectValue(responseRelationship?.data);
  const responseId = stringValue(responseData?.id);
  return responseId ? responses.get(responseId) ?? null : null;
}

function normalizeReview(
  rawReview: Record<string, unknown>,
  storeMappingId: string,
  fetchedAt: Date,
  responses: Map<string, Record<string, unknown>>,
): NormalizedIosReview | null {
  const reviewId = stringValue(rawReview.id);
  if (!reviewId) return null;

  const attributes = objectValue(rawReview.attributes) ?? {};
  const response = responseForReview(rawReview, responses);
  const responseAttributes = objectValue(response?.attributes) ?? {};
  const reviewCreatedAt = parseIsoDate(attributes.createdDate);
  const reviewUpdatedAt =
    parseIsoDate(attributes.modifiedDate) ?? reviewCreatedAt;
  const developerReplyUpdatedAt =
    parseIsoDate(responseAttributes.lastModifiedDate) ??
    parseIsoDate(responseAttributes.modifiedDate);
  const reviewText = stringValue(attributes.body);

  return {
    developerReplyUpdatedAt,
    latestUpdatedAt: latestDate(reviewUpdatedAt, developerReplyUpdatedAt),
    reviewId,
    row: {
      appVersion: stringValue(attributes.appVersionString),
      authorName: stringValue(attributes.reviewerNickname),
      developerReplyId: stringValue(response?.id),
      developerReplyText: stringValue(responseAttributes.responseBody),
      developerReplyUpdatedAt,
      fetchedAt,
      rating: numberValue(attributes.rating),
      rawReview: rawReview as Prisma.InputJsonValue,
      reviewCreatedAt,
      reviewId,
      reviewText,
      reviewUpdatedAt,
      storeMappingId,
      territory: stringValue(attributes.territory),
      title: stringValue(attributes.title),
    },
  };
}

function reviewChanged(
  review: NormalizedIosReview,
  existing: IosReviewFingerprint | undefined,
) {
  if (!existing) return true;

  return (
    !sameTime(review.row.reviewUpdatedAt, existing.reviewUpdatedAt) ||
    !sameTime(review.developerReplyUpdatedAt, existing.developerReplyUpdatedAt) ||
    review.row.rating !== existing.rating ||
    review.row.reviewText !== existing.reviewText ||
    review.row.title !== existing.title ||
    review.row.developerReplyText !== existing.developerReplyText
  );
}

async function changedReviewsForIncrementalPage(
  storeMappingId: string,
  reviews: NormalizedIosReview[],
) {
  const existingReviews = await getIosReviewFingerprints(
    storeMappingId,
    reviews.map((review) => review.reviewId),
  );
  const existingByReviewId = new Map(
    existingReviews.map((review) => [review.reviewId, review]),
  );

  return reviews.filter((review) =>
    reviewChanged(review, existingByReviewId.get(review.reviewId)),
  );
}

function nextPageUrl(body: Record<string, unknown>) {
  const links = objectValue(body.links);
  return stringValue(links?.next) ?? "";
}

async function listAppStoreReviews(input: {
  appStoreId: string;
  maxResults: number;
  nextPageUrl: string;
  token: string;
}) {
  const url = input.nextPageUrl
    ? new URL(input.nextPageUrl)
    : new URL(
        `https://api.appstoreconnect.apple.com/v1/apps/${encodeURIComponent(
          input.appStoreId,
        )}/customerReviews`,
      );

  if (!input.nextPageUrl) {
    url.searchParams.set("include", "response");
    url.searchParams.set("limit", String(input.maxResults));
    url.searchParams.set("sort", "-createdDate");
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.token}`,
    },
  });
  const body = await readAppleJson(response);
  const rateLimit = parseAppleRateLimit(response.headers.get("x-rate-limit"));

  if (!response.ok) {
    await throwAppleApiError(response, body, "App Store customerReviews.list");
  }

  return { body, rateLimit };
}

function normalizeFetchPayload(payload: FetchIosReviewsPayload) {
  const storeMappingId = cleanText(payload.storeMappingId);
  if (!storeMappingId || !isUuid(storeMappingId)) {
    throw badRequest("iOS app mapping is required.");
  }
  const triggerType = normalizeTriggerType(payload.triggerType);
  const scanMode = normalizeScanMode(
    payload.scanMode,
    triggerType,
    payload.fetchAllPages,
  );

  return {
    dateRange: normalizeDateRange({
      fromDate: payload.fromDate,
      toDate: payload.toDate,
    }),
    maxPages: boundedInteger(
      payload.maxPages,
      DEFAULT_MAX_PAGES,
      1,
      MAX_ALLOWED_PAGES,
    ),
    maxResults: boundedInteger(
      payload.maxResults,
      DEFAULT_MAX_RESULTS,
      1,
      MAX_ALLOWED_RESULTS,
    ),
    nextPageUrl: cleanText(payload.nextPageUrl),
    scanMode,
    storeMappingId,
    triggerType,
  };
}

async function ensureReviewFetchNotRunning(storeMappingId: string) {
  const syncState = await getIosReviewSyncState(storeMappingId);
  if (!syncState || syncState.status !== "RUNNING" || !syncState.lockedAt) {
    return;
  }

  if (Date.now() - syncState.lockedAt.getTime() < LOCK_TTL_MS) {
    throw conflict("Review fetch is already running for this iOS app.");
  }
}

function resultTriggerType(value: ReviewFetchTrigger) {
  return value.toLowerCase();
}

function resultStatus(value: ReviewFetchRunStatus) {
  return value.toLowerCase();
}

async function executeIosStoreReviewFetch(
  payload: FetchIosReviewsPayload,
  run?: ClaimedIosReviewFetchRun,
) {
  const normalized = normalizeFetchPayload(payload);
  const mapping = await getIosReviewMappingById(normalized.storeMappingId);
  if (!mapping) throw notFound("iOS app mapping was not found.");
  if (mapping.status !== "ACTIVE") {
    throw badRequest("iOS app mapping must be active before fetching reviews.");
  }

  const appStoreId = firstAppleAppStoreId(
    mapping.appleAppId,
    mapping.appLink,
  );
  if (!appStoreId) {
    throw badRequest(
      "Apple App Store app id or App Store URL is required before fetching iOS reviews.",
    );
  }

  if (mapping.appleAppId !== appStoreId) {
    await updateIosReviewMappingAppleAppId(mapping.id, appStoreId);
  }

  const credential = await resolveAppleAscCredential(
    await getActiveIosCredentialForStoreProfile(mapping.storeProfileId),
  );
  const token = await appleAppStoreConnectToken(credential);
  const startedAt = run?.startedAt ?? new Date();
  const lockedBy = run?.lockedBy ?? crypto.randomUUID();
  let context: FetchRunContext | null = null;
  let syncStarted = false;
  let pagesFetched = 0;
  let requestCount = 0;
  let reviewsFetched = 0;
  let reviewsMatched = 0;
  let reviewsSkipped = 0;
  let reviewsUpserted = 0;
  let lastReviewUpdatedAt: Date | null = null;
  let pageUrl = normalized.nextPageUrl || run?.nextPageUrl || "";
  let stopReason: ReviewFetchStopReason | null = null;
  let rateLimitLimit: number | null = null;
  let rateLimitObservedAt: Date | null = null;
  let rateLimitRemaining: number | null = null;
  let lastRateLimitHeader: string | null = null;

  try {
    await ensureReviewFetchNotRunning(mapping.id);
    await markIosReviewSyncRunning(mapping.id, { lockedBy, startedAt });
    syncStarted = true;

    if (run) {
      context = { runId: run.id, storeMappingId: mapping.id };
    } else {
      const createdRun = await createIosReviewFetchRun({
        lockedBy,
        maxResults: normalized.maxResults,
        scanMode: normalized.scanMode,
        startedAt,
        storeMappingId: mapping.id,
        triggerType: normalized.triggerType,
      });
      context = { runId: createdRun.id, storeMappingId: mapping.id };
    }

    const fetchUntilPageLimit = normalized.scanMode === "LIMITED";

    while (!fetchUntilPageLimit || pagesFetched < normalized.maxPages) {
      if (
        normalized.scanMode === "FULL" &&
        requestCount >= FULL_SCAN_SAFE_REQUEST_LIMIT
      ) {
        stopReason = "QUOTA_GUARD";
        break;
      }

      const fetchedAt = new Date();
      const { body, rateLimit } = await listAppStoreReviews({
        appStoreId,
        maxResults: normalized.maxResults,
        nextPageUrl: pageUrl,
        token,
      });

      pagesFetched += 1;
      requestCount += 1;
      rateLimitLimit = rateLimit.hourlyLimit;
      rateLimitObservedAt = fetchedAt;
      rateLimitRemaining = rateLimit.hourlyRemaining;
      lastRateLimitHeader = rateLimit.rawHeader;

      const responses = includedResponseById(body);
      const normalizedReviews = arrayValue(body.data)
        .map((review) => objectValue(review))
        .filter((review): review is Record<string, unknown> => Boolean(review))
        .map((review) => normalizeReview(review, mapping.id, fetchedAt, responses))
        .filter((review): review is NormalizedIosReview => Boolean(review));
      const matchingReviews = normalizedReviews.filter((review) =>
        reviewMatchesDateRange(review, normalized.dateRange),
      );

      for (const review of matchingReviews) {
        lastReviewUpdatedAt = latestDate(
          lastReviewUpdatedAt,
          review.latestUpdatedAt,
        );
      }

      reviewsFetched += normalizedReviews.length;
      reviewsMatched += matchingReviews.length;
      reviewsSkipped += normalizedReviews.length - matchingReviews.length;

      const reviewsToUpsert =
        normalized.scanMode === "INCREMENTAL"
          ? await changedReviewsForIncrementalPage(mapping.id, matchingReviews)
          : matchingReviews;
      reviewsSkipped += matchingReviews.length - reviewsToUpsert.length;
      reviewsUpserted += await upsertIosReviews(
        reviewsToUpsert.map((review) => review.row),
      );

      pageUrl = nextPageUrl(body);
      if (!normalizedReviews.length) {
        stopReason = "EMPTY_PAGE";
      }
      if (
        normalized.scanMode === "INCREMENTAL" &&
        matchingReviews.length > 0 &&
        reviewsToUpsert.length === 0
      ) {
        stopReason = "EARLY_STOP_KNOWN_PAGE";
        pageUrl = "";
      }
      if (
        rateLimit.hourlyRemaining !== null &&
        rateLimit.hourlyRemaining < APPLE_RATE_LIMIT_MIN_REMAINING
      ) {
        stopReason = "QUOTA_GUARD";
        break;
      }
      if (!pageUrl) break;
    }

    const finishedAt = new Date();
    if (!stopReason) {
      stopReason =
        fetchUntilPageLimit && pageUrl ? "PAGE_LIMIT_REACHED" : "COMPLETED";
    }
    const status: ReviewFetchRunStatus = pageUrl ? "PARTIAL" : "SUCCEEDED";

    await finishIosReviewFetchRun(context.runId, {
      finishedAt,
      lastRateLimitHeader,
      nextPageUrl: pageUrl || null,
      pagesFetched,
      rateLimitLimit,
      rateLimitObservedAt,
      rateLimitRemaining,
      requestCount,
      reviewsFetched,
      reviewsUpserted,
      status,
      stopReason,
    });
    await finishIosReviewSyncState(mapping.id, {
      finishedAt,
      lastReviewUpdatedAt,
      reviewsFetched,
      reviewsUpserted,
      status: "SUCCEEDED",
    });

    return {
      appStoreId,
      credentialRef: credential.credentialRef,
      hasMore: Boolean(pageUrl),
      nextPageUrl: pageUrl || null,
      pagesFetched,
      platform: "ios",
      rateLimitLimit,
      rateLimitRemaining,
      requestCount,
      reviewsFetched,
      reviewsMatched,
      reviewsSkipped,
      reviewsUpserted,
      runId: context.runId,
      scanMode: normalized.scanMode.toLowerCase(),
      status: resultStatus(status),
      stopReason: stopReason.toLowerCase(),
      storeMappingId: mapping.id,
      triggerType: resultTriggerType(normalized.triggerType),
    };
  } catch (error) {
    const finishedAt = new Date();
    const message =
      error instanceof Error
        ? error.message
        : "Unknown App Store review fetch error.";

    if (context) {
      await finishIosReviewFetchRun(context.runId, {
        errorCode: "fetch_app_store_reviews_failed",
        errorMessage: message,
        finishedAt,
        lastRateLimitHeader,
        nextPageUrl: pageUrl || null,
        pagesFetched,
        rateLimitLimit,
        rateLimitObservedAt,
        rateLimitRemaining,
        requestCount,
        reviewsFetched,
        reviewsUpserted,
        status: "FAILED",
        stopReason,
      });
    }

    if (syncStarted) {
      await finishIosReviewSyncState(mapping.id, {
        errorCode: "fetch_app_store_reviews_failed",
        errorMessage: message,
        finishedAt,
        lastReviewUpdatedAt,
        reviewsFetched,
        reviewsUpserted,
        status: "FAILED",
      });
    }

    throw error;
  }
}

export async function fetchIosStoreReviews(payload: FetchIosReviewsPayload) {
  return executeIosStoreReviewFetch(payload);
}

export async function enqueueIosReviewFullScanRuns(input: {
  storeMappingIds?: string[];
}) {
  const requestedIds = new Set(input.storeMappingIds ?? []);
  const mappings = requestedIds.size
    ? (await Promise.all(
        Array.from(requestedIds).map((storeMappingId) =>
          getIosReviewMappingById(storeMappingId),
        ),
      )).filter((mapping): mapping is NonNullable<typeof mapping> =>
        mapping?.status === "ACTIVE",
      )
    : await getActiveIosReviewMappings();
  if (!mappings.length) {
    throw notFound("No active iOS apps were found for full scan.");
  }

  const scheduledFor = new Date();
  const result = await enqueueManualIosReviewFetchRuns(
    mappings.map((mapping) => ({
      maxAttempts: FULL_SCAN_MAX_ATTEMPTS,
      maxResults: DEFAULT_MAX_RESULTS,
      nextAttemptAt: scheduledFor,
      scanMode: "FULL",
      scheduledFor,
      storeMappingId: mapping.id,
    })),
  );

  return {
    enqueued: result.count,
    requested: mappings.length,
    runIds: result.runIds,
    scanMode: "full",
    skipped: result.skippedCount,
    skippedStoreMappingIds: result.skippedStoreMappingIds,
    status: "queued",
  };
}

export async function enqueueIosReviewFetchRuns(input: {
  maxResults?: number;
  scanMode?: string;
  storeMappingId: string;
}) {
  const mapping = await getIosReviewMappingById(input.storeMappingId);
  if (!mapping || mapping.status !== "ACTIVE") {
    throw notFound("No active iOS app was found for comment fetch.");
  }

  const scheduledFor = new Date();
  const result = await enqueueManualIosReviewFetchRuns([
    {
      maxAttempts: FULL_SCAN_MAX_ATTEMPTS,
      maxResults: input.maxResults ?? DEFAULT_MAX_RESULTS,
      nextAttemptAt: scheduledFor,
      scanMode:
        input.scanMode?.toLowerCase() === "full"
          ? "FULL"
          : input.scanMode?.toLowerCase() === "incremental"
            ? "INCREMENTAL"
            : "LIMITED",
      scheduledFor,
      storeMappingId: input.storeMappingId,
    },
  ]);

  return {
    enqueued: result.count,
    requested: 1,
    runIds: result.runIds,
    scanMode: input.scanMode ?? "limited",
    skipped: result.skippedCount,
    skippedStoreMappingIds: result.skippedStoreMappingIds,
    status: result.count ? "queued" : "empty",
  };
}

export async function processClaimedIosReviewFetchRun(
  run: ClaimedIosReviewFetchRun,
  payload: Omit<FetchIosReviewsPayload, "storeMappingId" | "triggerType"> = {},
) {
  return executeIosStoreReviewFetch(
    {
      ...payload,
      maxResults: payload.maxResults ?? run.maxResults,
      nextPageUrl: payload.nextPageUrl ?? run.nextPageUrl ?? undefined,
      scanMode: payload.scanMode ?? run.scanMode.toLowerCase(),
      storeMappingId: run.storeMappingId,
      triggerType: resultTriggerType(run.triggerType),
    },
    run,
  );
}
