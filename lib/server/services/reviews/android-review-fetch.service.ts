import "server-only";

import {
  Prisma,
  type ReviewFetchRunStatus,
  type ReviewFetchScanMode,
  type ReviewFetchStopReason,
  type ReviewFetchTrigger,
} from "@prisma/client";

import {
  ApiError,
  badRequest,
  conflict,
  notFound,
} from "@/lib/server/api/errors";
import {
  type AndroidReviewFingerprint,
  type AndroidReviewUpsertInput,
  createAndroidReviewFetchRun,
  enqueueManualAndroidReviewFetchRuns,
  finishAndroidReviewFetchRun,
  finishAndroidReviewSyncState,
  getActiveAndroidReviewMappings,
  getActiveAndroidCredentialForStoreProfile,
  getAndroidReviewFingerprints,
  getAndroidReviewMappingById,
  getAndroidReviewSyncState,
  markAndroidReviewSyncRunning,
  upsertAndroidReviews,
} from "@/lib/server/repositories/reviews/android-review.repository";
import { getCredentialVaultSecret } from "@/lib/server/repositories/vault/secret.repository";
import {
  cleanText,
  parseSecretPayload,
  validateGoogleServiceAccountSecret,
} from "@/lib/server/services/credentials/credential.shared";
import { googleServiceAccountAccessToken } from "@/lib/server/services/google/google-service-account";

const DEFAULT_MAX_RESULTS = 100;
const DEFAULT_MAX_PAGES = 2;
const MAX_ALLOWED_RESULTS = 100;
const MAX_ALLOWED_PAGES = 10;
const FULL_SCAN_SAFE_REQUEST_LIMIT = 180;
const FULL_SCAN_MAX_ATTEMPTS = 3;
const GOOGLE_PLAY_REVIEW_FETCH_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOCK_TTL_MS = 10 * 60 * 1000;

type FetchRunContext = {
  runId: string;
  storeMappingId: string;
};

type NormalizedReview = {
  developerReplyUpdatedAt: Date | null;
  latestUpdatedAt: Date | null;
  reviewId: string;
  row: AndroidReviewUpsertInput;
  userCommentUpdatedAt: Date | null;
};

export type FetchAndroidReviewsPayload = {
  fetchAllPages?: unknown;
  fromDate?: unknown;
  maxPages?: unknown;
  maxResults?: unknown;
  pageToken?: unknown;
  scanMode?: unknown;
  storeMappingId?: unknown;
  scope?: unknown;
  timezoneOffsetMinutes?: unknown;
  toDate?: unknown;
  translationLanguage?: unknown;
  triggerType?: unknown;
};

export type ClaimedAndroidReviewFetchRun = {
  attemptCount?: number;
  id: string;
  lockedBy: string | null;
  maxResults: number;
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

function boundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
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

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function jsonObject(value: unknown): Prisma.InputJsonValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Prisma.InputJsonValue;
}

function latestDate(current: Date | null, candidate: Date | null) {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate.getTime() > current.getTime() ? candidate : current;
}

function earliestDate(current: Date | null, candidate: Date | null) {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate.getTime() < current.getTime() ? candidate : current;
}

function timestampToDate(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const timestamp = value as Record<string, unknown>;
  const seconds = numberValue(timestamp.seconds);
  const nanos = numberValue(timestamp.nanos) ?? 0;
  if (seconds === null) return null;

  return new Date(seconds * 1000 + Math.floor(nanos / 1_000_000));
}

function commentUpdatedAt(comment: Record<string, unknown>) {
  return timestampToDate(comment.lastModified);
}

function chooseLatestComment(
  comments: unknown,
  key: "userComment" | "developerComment",
) {
  if (!Array.isArray(comments)) return null;

  let latest: Record<string, unknown> | null = null;
  let latestUpdatedAt: Date | null = null;

  for (const item of comments) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const comment = (item as Record<string, unknown>)[key];
    if (!comment || typeof comment !== "object" || Array.isArray(comment)) {
      continue;
    }

    const record = comment as Record<string, unknown>;
    const updatedAt = commentUpdatedAt(record);
    if (!latest || latestDate(latestUpdatedAt, updatedAt) === updatedAt) {
      latest = record;
      latestUpdatedAt = updatedAt;
    }
  }

  return latest;
}

function normalizeReview(
  rawReview: Record<string, unknown>,
  storeMappingId: string,
  fetchedAt: Date,
): NormalizedReview | null {
  const reviewId = cleanText(rawReview.reviewId);
  if (!reviewId) return null;

  const userComment = chooseLatestComment(rawReview.comments, "userComment");
  const developerComment = chooseLatestComment(
    rawReview.comments,
    "developerComment",
  );
  const userCommentUpdatedAt = userComment
    ? commentUpdatedAt(userComment)
    : null;
  const developerReplyUpdatedAt = developerComment
    ? commentUpdatedAt(developerComment)
    : null;

  return {
    developerReplyUpdatedAt,
    latestUpdatedAt: latestDate(userCommentUpdatedAt, developerReplyUpdatedAt),
    reviewId,
    row: {
      androidOsVersion: numberValue(userComment?.androidOsVersion),
      appVersionCode: numberValue(userComment?.appVersionCode),
      appVersionName: stringValue(userComment?.appVersionName),
      authorName: stringValue(rawReview.authorName),
      developerReplyText: stringValue(developerComment?.text),
      developerReplyUpdatedAt,
      device: stringValue(userComment?.device),
      deviceMetadata: jsonObject(userComment?.deviceMetadata),
      fetchedAt,
      originalText: stringValue(userComment?.originalText),
      rating: numberValue(userComment?.starRating),
      rawReview: rawReview as Prisma.InputJsonValue,
      reviewId,
      reviewerLanguage: stringValue(userComment?.reviewerLanguage),
      reviewText: stringValue(userComment?.text),
      storeMappingId,
      thumbsDownCount: numberValue(userComment?.thumbsDownCount),
      thumbsUpCount: numberValue(userComment?.thumbsUpCount),
      userCommentUpdatedAt,
    },
    userCommentUpdatedAt,
  };
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text.trim()) return {};

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

async function listGooglePlayReviews(input: {
  accessToken: string;
  maxResults: number;
  packageName: string;
  pageToken: string;
  translationLanguage: string;
}) {
  const url = new URL(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      input.packageName,
    )}/reviews`,
  );
  url.searchParams.set("maxResults", String(input.maxResults));
  if (input.pageToken) url.searchParams.set("token", input.pageToken);
  if (input.translationLanguage) {
    url.searchParams.set("translationLanguage", input.translationLanguage);
  }

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Bearer ${input.accessToken}`,
    },
  });
  const body = await readJson(response);

  if (!response.ok) {
    throw new ApiError(
      `Google Play reviews.list failed: ${JSON.stringify(body)}`,
      502,
    );
  }

  return body;
}

function nextPageToken(body: Record<string, unknown>) {
  const tokenPagination = body.tokenPagination;
  if (!tokenPagination || typeof tokenPagination !== "object") return "";
  return cleanText((tokenPagination as Record<string, unknown>).nextPageToken);
}

function parseTimezoneOffset(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(Math.trunc(parsed), -840), 840);
}

function parseDateOnly(value: unknown, label: string) {
  const text = cleanText(value);
  if (!text) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    throw badRequest(`${label} must use YYYY-MM-DD format.`);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw badRequest(`${label} is invalid.`);
  }

  return { day, month, year };
}

function localDateBoundaryUtc(
  dateOnly: { day: number; month: number; year: number },
  timezoneOffsetMinutes: number,
  addDays = 0,
) {
  return new Date(
    Date.UTC(dateOnly.year, dateOnly.month - 1, dateOnly.day + addDays) +
      timezoneOffsetMinutes * 60_000,
  );
}

function currentLocalDateOnly(timezoneOffsetMinutes: number) {
  const localNow = new Date(Date.now() - timezoneOffsetMinutes * 60_000);

  return {
    day: localNow.getUTCDate(),
    month: localNow.getUTCMonth() + 1,
    year: localNow.getUTCFullYear(),
  };
}

function normalizeDateRange(input: {
  fromDate: unknown;
  timezoneOffsetMinutes: unknown;
  toDate: unknown;
}) {
  const timezoneOffsetMinutes = parseTimezoneOffset(
    input.timezoneOffsetMinutes,
  );
  const fromDate = parseDateOnly(input.fromDate, "From date");
  const toDate = parseDateOnly(input.toDate, "To date");

  if (!fromDate && !toDate) {
    return {
      fromDate: null,
      timezoneOffsetMinutes,
      toDate: null,
    };
  }

  const from = fromDate
    ? localDateBoundaryUtc(fromDate, timezoneOffsetMinutes)
    : null;
  const toExclusive = toDate
    ? localDateBoundaryUtc(toDate, timezoneOffsetMinutes, 1)
    : null;

  if (from && toExclusive && from.getTime() >= toExclusive.getTime()) {
    throw badRequest("From date must be before or equal to To date.");
  }

  if (from || toExclusive) {
    const today = currentLocalDateOnly(timezoneOffsetMinutes);
    const oldestAllowed = localDateBoundaryUtc(
      today,
      timezoneOffsetMinutes,
      -(GOOGLE_PLAY_REVIEW_FETCH_WINDOW_DAYS - 1),
    );
    const tomorrow = localDateBoundaryUtc(today, timezoneOffsetMinutes, 1);
    const effectiveFrom = from ?? oldestAllowed;
    const effectiveTo = toExclusive ?? tomorrow;

    if (from && from.getTime() < oldestAllowed.getTime()) {
      throw badRequest("From date must be within the last 7 days.");
    }
    if (toExclusive && toExclusive.getTime() <= oldestAllowed.getTime()) {
      throw badRequest("To date must be within the last 7 days.");
    }
    if (toExclusive && toExclusive.getTime() > tomorrow.getTime()) {
      throw badRequest("To date cannot be in the future.");
    }
    if (
      effectiveTo.getTime() - effectiveFrom.getTime() >
      GOOGLE_PLAY_REVIEW_FETCH_WINDOW_DAYS * DAY_MS
    ) {
      throw badRequest("Date range cannot exceed 7 days.");
    }
  }

  return {
    fromDate: from,
    timezoneOffsetMinutes,
    toDate: toExclusive,
  };
}

function reviewMatchesDateRange(
  review: NormalizedReview,
  range: { fromDate: Date | null; toDate: Date | null },
) {
  if (!range.fromDate && !range.toDate) return true;
  const updatedAt = review.latestUpdatedAt;
  if (!updatedAt) return false;
  if (range.fromDate && updatedAt.getTime() < range.fromDate.getTime()) {
    return false;
  }
  if (range.toDate && updatedAt.getTime() >= range.toDate.getTime()) {
    return false;
  }
  return true;
}

function sameTime(left: Date | null, right: Date | null) {
  return (left?.getTime() ?? null) === (right?.getTime() ?? null);
}

function reviewChanged(
  review: NormalizedReview,
  existing: AndroidReviewFingerprint | undefined,
) {
  if (!existing) return true;

  return (
    !sameTime(review.userCommentUpdatedAt, existing.userCommentUpdatedAt) ||
    !sameTime(
      review.developerReplyUpdatedAt,
      existing.developerReplyUpdatedAt,
    ) ||
    review.row.rating !== existing.rating ||
    review.row.reviewText !== existing.reviewText ||
    review.row.developerReplyText !== existing.developerReplyText
  );
}

async function changedReviewsForIncrementalPage(
  storeMappingId: string,
  reviews: NormalizedReview[],
) {
  const existingReviews = await getAndroidReviewFingerprints(
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

function normalizeFetchPayload(payload: FetchAndroidReviewsPayload) {
  const storeMappingId = cleanText(payload.storeMappingId);
  if (!storeMappingId || !isUuid(storeMappingId)) {
    throw badRequest("Android app mapping is required.");
  }
  const triggerType = normalizeTriggerType(payload.triggerType);
  const scanMode = normalizeScanMode(
    payload.scanMode,
    triggerType,
    payload.fetchAllPages,
  );
  const dateRange = normalizeDateRange({
    fromDate: payload.fromDate,
    timezoneOffsetMinutes: payload.timezoneOffsetMinutes,
    toDate: payload.toDate,
  });

  return {
    dateRange,
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
    pageToken: cleanText(payload.pageToken),
    scanMode,
    storeMappingId,
    translationLanguage: cleanText(payload.translationLanguage),
    triggerType,
  };
}

async function ensureReviewFetchNotRunning(storeMappingId: string) {
  const syncState = await getAndroidReviewSyncState(storeMappingId);
  if (!syncState || syncState.status !== "RUNNING" || !syncState.lockedAt) {
    return;
  }

  if (Date.now() - syncState.lockedAt.getTime() < LOCK_TTL_MS) {
    throw conflict("Review fetch is already running for this app.");
  }
}

function resultTriggerType(value: ReviewFetchTrigger) {
  return value.toLowerCase();
}

function resultStatus(value: ReviewFetchRunStatus) {
  return value.toLowerCase();
}

async function executeAndroidStoreReviewFetch(
  payload: FetchAndroidReviewsPayload,
  run?: ClaimedAndroidReviewFetchRun,
) {
  const normalized = normalizeFetchPayload(payload);
  const mapping = await getAndroidReviewMappingById(normalized.storeMappingId);
  if (!mapping) throw notFound("Android app mapping was not found.");
  if (mapping.status !== "ACTIVE") {
    throw badRequest(
      "Android app mapping must be active before fetching reviews.",
    );
  }

  const credential = await getActiveAndroidCredentialForStoreProfile(
    mapping.storeProfileId,
  );
  if (!credential) {
    throw badRequest("No active Android service-account credential was found.");
  }

  const secretText = await getCredentialVaultSecret(credential.vaultSecretId);
  const serviceAccount = parseSecretPayload(secretText, "json");
  if (!validateGoogleServiceAccountSecret(serviceAccount)) {
    throw badRequest("Android service-account credential is invalid.");
  }

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
  let oldestReviewUpdatedAt: Date | null = null;
  let pageToken = normalized.pageToken;
  let stopReason: ReviewFetchStopReason | null = null;

  try {
    await ensureReviewFetchNotRunning(mapping.id);
    await markAndroidReviewSyncRunning(mapping.id, { lockedBy, startedAt });
    syncStarted = true;

    if (run) {
      context = { runId: run.id, storeMappingId: mapping.id };
    } else {
      const createdRun = await createAndroidReviewFetchRun({
        lockedBy,
        maxResults: normalized.maxResults,
        scanMode: normalized.scanMode,
        startedAt,
        storeMappingId: mapping.id,
        triggerType: normalized.triggerType,
      });
      context = { runId: createdRun.id, storeMappingId: mapping.id };
    }

    const accessToken = await googleServiceAccountAccessToken(serviceAccount);
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
      const body = await listGooglePlayReviews({
        accessToken,
        maxResults: normalized.maxResults,
        packageName: mapping.packageName,
        pageToken,
        translationLanguage: normalized.translationLanguage,
      });

      pagesFetched += 1;
      requestCount += 1;
      const rawReviews = Array.isArray(body.reviews)
        ? (body.reviews as Record<string, unknown>[])
        : [];
      const normalizedReviews = rawReviews
        .map((review) => normalizeReview(review, mapping.id, fetchedAt))
        .filter((review): review is NormalizedReview => Boolean(review));
      const matchingReviews = normalizedReviews.filter((review) =>
        reviewMatchesDateRange(review, normalized.dateRange),
      );

      for (const review of normalizedReviews) {
        oldestReviewUpdatedAt = earliestDate(
          oldestReviewUpdatedAt,
          review.latestUpdatedAt,
        );
      }

      for (const review of matchingReviews) {
        lastReviewUpdatedAt = latestDate(
          lastReviewUpdatedAt,
          review.userCommentUpdatedAt,
        );
        lastReviewUpdatedAt = latestDate(
          lastReviewUpdatedAt,
          review.developerReplyUpdatedAt,
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
      reviewsUpserted += await upsertAndroidReviews(
        reviewsToUpsert.map((review) => review.row),
      );

      pageToken = nextPageToken(body);
      if (!normalizedReviews.length) {
        stopReason = "EMPTY_PAGE";
      }
      if (
        normalized.dateRange.fromDate &&
        oldestReviewUpdatedAt &&
        oldestReviewUpdatedAt.getTime() <
          normalized.dateRange.fromDate.getTime()
      ) {
        stopReason = "DATE_RANGE_BOUNDARY";
        pageToken = "";
      }
      if (
        normalized.scanMode === "INCREMENTAL" &&
        matchingReviews.length > 0 &&
        reviewsToUpsert.length === 0
      ) {
        stopReason = "EARLY_STOP_KNOWN_PAGE";
        pageToken = "";
      }
      if (!pageToken) break;
    }

    const finishedAt = new Date();
    if (!stopReason) {
      stopReason =
        fetchUntilPageLimit && pageToken ? "PAGE_LIMIT_REACHED" : "COMPLETED";
    }
    const status: ReviewFetchRunStatus = pageToken ? "PARTIAL" : "SUCCEEDED";

    await finishAndroidReviewFetchRun(context.runId, {
      finishedAt,
      nextPageToken: pageToken || null,
      pagesFetched,
      requestCount,
      reviewsFetched,
      reviewsUpserted,
      status,
      stopReason,
    });
    await finishAndroidReviewSyncState(mapping.id, {
      finishedAt,
      lastReviewUpdatedAt,
      reviewsFetched,
      reviewsUpserted,
      status: "SUCCEEDED",
    });

    return {
      credentialRef: credential.credentialRef,
      hasMore: Boolean(pageToken),
      nextPageToken: pageToken || null,
      packageName: mapping.packageName,
      pagesFetched,
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
        : "Unknown Google Play review fetch error.";

    if (context) {
      await finishAndroidReviewFetchRun(context.runId, {
        errorCode: "fetch_google_play_reviews_failed",
        errorMessage: message,
        finishedAt,
        nextPageToken: pageToken || null,
        pagesFetched,
        requestCount,
        reviewsFetched,
        reviewsUpserted,
        status: "FAILED",
        stopReason,
      });
    }

    if (syncStarted) {
      await finishAndroidReviewSyncState(mapping.id, {
        errorCode: "fetch_google_play_reviews_failed",
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

export async function fetchAndroidStoreReviews(
  payload: FetchAndroidReviewsPayload,
) {
  return executeAndroidStoreReviewFetch(payload);
}

export async function enqueueAndroidReviewFullScanRuns(input: {
  storeMappingIds?: string[];
}) {
  const requestedIds = new Set(input.storeMappingIds ?? []);
  const mappings = (await getActiveAndroidReviewMappings()).filter(
    (mapping) => !requestedIds.size || requestedIds.has(mapping.id),
  );
  if (!mappings.length) {
    throw notFound("No active Android apps were found for full scan.");
  }

  const scheduledFor = new Date();
  const result = await enqueueManualAndroidReviewFetchRuns(
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
    scanMode: "full",
    skipped: result.skippedCount,
    skippedStoreMappingIds: result.skippedStoreMappingIds,
    status: "queued",
  };
}

export async function processClaimedAndroidReviewFetchRun(
  run: ClaimedAndroidReviewFetchRun,
  payload: Omit<
    FetchAndroidReviewsPayload,
    "storeMappingId" | "triggerType"
  > = {},
) {
  return executeAndroidStoreReviewFetch(
    {
      ...payload,
      maxResults: payload.maxResults ?? run.maxResults,
      scanMode: payload.scanMode ?? run.scanMode.toLowerCase(),
      storeMappingId: run.storeMappingId,
      triggerType: resultTriggerType(run.triggerType),
    },
    run,
  );
}
