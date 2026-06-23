import {
  clean,
  corsHeaders,
  createAdminClient,
  getGooglePlayIapConfig,
  jsonResponse as json,
  stringValue,
  type SupabaseAdminClient,
} from "../_shared/edge-config.ts";
import { googleServiceAccountAccessToken } from "../_shared/google-auth.ts";

type FetchGooglePlayReviewsRequest = {
  credentialRef?: string;
  maxPages?: number;
  maxResults?: number;
  packageName?: string;
  pageToken?: string;
  storeAccountName?: string;
  storeProfileId?: string;
  translationLanguage?: string;
  triggerType?: "scheduled" | "manual" | "retry";
};

type FetchRunContext = {
  runId: string;
  storeMappingId: string;
};

type NormalizedReview = {
  developerReplyUpdatedAt: string | null;
  reviewId: string;
  row: Record<string, unknown>;
  userCommentUpdatedAt: string | null;
};

const DEFAULT_MAX_RESULTS = 100;
const DEFAULT_MAX_PAGES = 2;
const MAX_ALLOWED_RESULTS = 100;
const MAX_ALLOWED_PAGES = 10;
const LOCK_TTL_MS = 10 * 60 * 1000;

function expectedFetchSecret() {
  return (
    Deno.env.get("GOOGLE_PLAY_REVIEW_FETCH_SECRET") ??
    Deno.env.get("REVIEW_FETCH_SECRET") ??
    Deno.env.get("EDGE_INTERNAL_SECRET")
  );
}

function extractBearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7).trim() || null;
}

function requireInternalSecret(request: Request) {
  const expected = expectedFetchSecret();
  if (!expected) {
    throw Object.assign(new Error("missing_review_fetch_secret"), {
      httpStatus: 500,
    });
  }

  const provided =
    request.headers.get("x-review-fetch-secret") ??
    request.headers.get("apikey") ??
    extractBearerToken(request);

  if (provided !== expected) {
    throw Object.assign(new Error("invalid_review_fetch_secret"), {
      httpStatus: 401,
    });
  }
}

async function readPayload(request: Request): Promise<FetchGooglePlayReviewsRequest> {
  const text = await request.text();
  if (!text.trim()) return {};

  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw Object.assign(new Error("request_body_must_be_object"), {
      httpStatus: 400,
    });
  }

  return parsed as FetchGooglePlayReviewsRequest;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function normalizeTriggerType(value: unknown) {
  const triggerType = clean(value);
  if (triggerType === "manual" || triggerType === "retry") return triggerType;
  return "scheduled";
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function latestIsoTimestamp(current: string | null, candidate: string | null) {
  if (!candidate) return current;
  if (!current) return candidate;
  return new Date(candidate).getTime() > new Date(current).getTime()
    ? candidate
    : current;
}

function timestampToIso(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const timestamp = value as Record<string, unknown>;
  const seconds = numberValue(timestamp.seconds);
  const nanos = numberValue(timestamp.nanos) ?? 0;
  if (seconds === null) return null;

  return new Date(seconds * 1000 + Math.floor(nanos / 1_000_000)).toISOString();
}

function commentUpdatedAt(comment: Record<string, unknown>) {
  return timestampToIso(comment.lastModified);
}

function chooseLatestComment(
  comments: unknown,
  key: "userComment" | "developerComment",
) {
  if (!Array.isArray(comments)) return null;

  let latest: Record<string, unknown> | null = null;
  let latestUpdatedAt: string | null = null;

  for (const item of comments) {
    if (!item || typeof item !== "object") continue;
    const comment = (item as Record<string, unknown>)[key];
    if (!comment || typeof comment !== "object" || Array.isArray(comment)) {
      continue;
    }

    const record = comment as Record<string, unknown>;
    const updatedAt = commentUpdatedAt(record);
    if (!latest || latestIsoTimestamp(latestUpdatedAt, updatedAt) === updatedAt) {
      latest = record;
      latestUpdatedAt = updatedAt;
    }
  }

  return latest;
}

function normalizeReview(
  rawReview: Record<string, unknown>,
  storeMappingId: string,
  fetchedAt: string,
): NormalizedReview | null {
  const reviewId = clean(rawReview.reviewId);
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
    reviewId,
    row: {
      app_version_code: userComment?.appVersionCode ?? null,
      app_version_name: stringValue(userComment?.appVersionName),
      android_os_version: userComment?.androidOsVersion ?? null,
      author_name: stringValue(rawReview.authorName),
      developer_reply_text: stringValue(developerComment?.text),
      developer_reply_updated_at: developerReplyUpdatedAt,
      device: stringValue(userComment?.device),
      fetched_at: fetchedAt,
      original_text: stringValue(userComment?.originalText),
      rating: userComment?.starRating ?? null,
      raw_review: rawReview,
      review_id: reviewId,
      review_text: stringValue(userComment?.text),
      reviewer_language: stringValue(userComment?.reviewerLanguage),
      store_mapping_id: storeMappingId,
      thumbs_down_count: userComment?.thumbsDownCount ?? null,
      thumbs_up_count: userComment?.thumbsUpCount ?? null,
      updated_at: fetchedAt,
      user_comment_updated_at: userCommentUpdatedAt,
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
    throw Object.assign(
      new Error(`Google Play reviews.list failed: ${JSON.stringify(body)}`),
      { httpStatus: 502 },
    );
  }

  return body;
}

function nextPageToken(body: Record<string, unknown>) {
  const tokenPagination = body.tokenPagination;
  if (!tokenPagination || typeof tokenPagination !== "object") return "";
  return clean((tokenPagination as Record<string, unknown>).nextPageToken);
}

async function ensureReviewFetchNotRunning(
  supabase: SupabaseAdminClient,
  storeMappingId: string,
) {
  const { data, error } = await supabase
    .from("android_store_review_sync_states")
    .select("status,locked_at")
    .eq("store_mapping_id", storeMappingId)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.status !== "running" || !data.locked_at) return;

  const lockedAt = new Date(data.locked_at).getTime();
  if (Number.isFinite(lockedAt) && Date.now() - lockedAt < LOCK_TTL_MS) {
    throw Object.assign(new Error("review_fetch_already_running"), {
      httpStatus: 409,
    });
  }
}

async function markSyncRunning(
  supabase: SupabaseAdminClient,
  storeMappingId: string,
  lockedBy: string,
  startedAt: string,
) {
  const { error } = await supabase
    .from("android_store_review_sync_states")
    .upsert(
      {
        last_error_code: null,
        last_error_message: null,
        last_fetch_started_at: startedAt,
        locked_at: startedAt,
        locked_by: lockedBy,
        status: "running",
        store_mapping_id: storeMappingId,
        updated_at: startedAt,
      },
      { onConflict: "store_mapping_id" },
    );

  if (error) throw error;
}

async function createFetchRun(
  supabase: SupabaseAdminClient,
  input: {
    maxPages: number;
    maxResults: number;
    startedAt: string;
    storeMappingId: string;
    triggerType: string;
  },
) {
  const { data, error } = await supabase
    .from("android_store_review_fetch_runs")
    .insert({
      max_pages: input.maxPages,
      max_results: input.maxResults,
      started_at: input.startedAt,
      status: "running",
      store_mapping_id: input.storeMappingId,
      trigger_type: input.triggerType,
    })
    .select("id")
    .single();

  if (error) throw error;
  return clean(data.id);
}

async function finishFetchRun(
  supabase: SupabaseAdminClient,
  context: FetchRunContext,
  input: {
    errorCode?: string | null;
    errorMessage?: string | null;
    finishedAt: string;
    pagesFetched: number;
    reviewsFetched: number;
    reviewsUpserted: number;
    status: "succeeded" | "failed" | "partial";
  },
) {
  const { error } = await supabase
    .from("android_store_review_fetch_runs")
    .update({
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
      finished_at: input.finishedAt,
      pages_fetched: input.pagesFetched,
      reviews_fetched: input.reviewsFetched,
      reviews_upserted: input.reviewsUpserted,
      status: input.status,
      updated_at: input.finishedAt,
    })
    .eq("id", context.runId);

  if (error) throw error;
}

async function finishSyncState(
  supabase: SupabaseAdminClient,
  context: FetchRunContext,
  input: {
    errorCode?: string | null;
    errorMessage?: string | null;
    finishedAt: string;
    lastReviewUpdatedAt: string | null;
    reviewsFetched: number;
    reviewsUpserted: number;
    status: "succeeded" | "failed";
  },
) {
  const row: Record<string, unknown> = {
    last_error_code: input.errorCode ?? null,
    last_error_message: input.errorMessage ?? null,
    last_fetch_finished_at: input.finishedAt,
    last_fetched_count: input.reviewsFetched,
    last_upserted_count: input.reviewsUpserted,
    locked_at: null,
    locked_by: null,
    status: input.status,
    updated_at: input.finishedAt,
  };

  if (input.status === "succeeded") {
    row.last_success_at = input.finishedAt;
  }

  if (input.lastReviewUpdatedAt) {
    row.last_review_updated_at = input.lastReviewUpdatedAt;
  }

  const { error } = await supabase
    .from("android_store_review_sync_states")
    .update(row)
    .eq("store_mapping_id", context.storeMappingId);

  if (error) throw error;
}

async function upsertReviews(
  supabase: SupabaseAdminClient,
  reviews: NormalizedReview[],
) {
  if (reviews.length === 0) return 0;

  const { data, error } = await supabase
    .from("android_store_reviews")
    .upsert(
      reviews.map((review) => review.row),
      { onConflict: "store_mapping_id,review_id" },
    )
    .select("id");

  if (error) throw error;
  return Array.isArray(data) ? data.length : reviews.length;
}

function edgeErrorPayload(error: unknown) {
  if (error instanceof Error) {
    return { error: error.message };
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    return {
      code: stringValue(record.code),
      details: stringValue(record.details),
      error:
        stringValue(record.message) ??
        stringValue(record.error) ??
        "Unknown fetch-google-play-reviews error",
      hint: stringValue(record.hint),
    };
  }

  return {
    error:
      typeof error === "string"
        ? error
        : "Unknown fetch-google-play-reviews error",
  };
}

function httpStatusFromError(error: unknown) {
  if (error && typeof error === "object" && "httpStatus" in error) {
    return Number((error as Record<string, unknown>).httpStatus) || 500;
  }
  return 500;
}

async function fetchGooglePlayReviews(
  supabase: SupabaseAdminClient,
  payload: FetchGooglePlayReviewsRequest,
) {
  const packageName = clean(payload.packageName);
  if (!packageName) {
    throw Object.assign(new Error("packageName is required"), {
      httpStatus: 400,
    });
  }

  const maxResults = boundedInteger(
    payload.maxResults,
    DEFAULT_MAX_RESULTS,
    1,
    MAX_ALLOWED_RESULTS,
  );
  const maxPages = boundedInteger(
    payload.maxPages,
    DEFAULT_MAX_PAGES,
    1,
    MAX_ALLOWED_PAGES,
  );
  const triggerType = normalizeTriggerType(payload.triggerType);
  const translationLanguage = clean(payload.translationLanguage);

  const config = await getGooglePlayIapConfig(supabase, {
    credentialRef: payload.credentialRef,
    packageName,
    storeAccountName: payload.storeAccountName,
    storeProfileId: payload.storeProfileId,
  });

  const storeMappingId = config.app?.id;
  if (!storeMappingId) {
    throw Object.assign(new Error("android_store_mapping_not_found"), {
      httpStatus: 404,
    });
  }

  const startedAt = new Date().toISOString();
  const lockedBy = crypto.randomUUID();
  let context: FetchRunContext | null = null;
  let syncStarted = false;
  let pagesFetched = 0;
  let reviewsFetched = 0;
  let reviewsUpserted = 0;
  let lastReviewUpdatedAt: string | null = null;
  let pageToken = clean(payload.pageToken);

  try {
    await ensureReviewFetchNotRunning(supabase, storeMappingId);
    await markSyncRunning(supabase, storeMappingId, lockedBy, startedAt);
    syncStarted = true;
    context = {
      runId: await createFetchRun(supabase, {
        maxPages,
        maxResults,
        startedAt,
        storeMappingId,
        triggerType,
      }),
      storeMappingId,
    };

    const accessToken = await googleServiceAccountAccessToken(
      config.googlePlay.serviceAccount,
    );

    for (let page = 0; page < maxPages; page += 1) {
      const fetchedAt = new Date().toISOString();
      const body = await listGooglePlayReviews({
        accessToken,
        maxResults,
        packageName: config.googlePlay.packageName,
        pageToken,
        translationLanguage,
      });

      pagesFetched += 1;
      const rawReviews = Array.isArray(body.reviews)
        ? (body.reviews as Record<string, unknown>[])
        : [];
      const normalizedReviews = rawReviews
        .map((review) => normalizeReview(review, storeMappingId, fetchedAt))
        .filter((review): review is NormalizedReview => Boolean(review));

      for (const review of normalizedReviews) {
        lastReviewUpdatedAt = latestIsoTimestamp(
          lastReviewUpdatedAt,
          review.userCommentUpdatedAt,
        );
        lastReviewUpdatedAt = latestIsoTimestamp(
          lastReviewUpdatedAt,
          review.developerReplyUpdatedAt,
        );
      }

      reviewsFetched += normalizedReviews.length;
      reviewsUpserted += await upsertReviews(supabase, normalizedReviews);

      pageToken = nextPageToken(body);
      if (!pageToken) break;
    }

    const finishedAt = new Date().toISOString();
    const status = pageToken ? "partial" : "succeeded";

    await finishFetchRun(supabase, context, {
      finishedAt,
      pagesFetched,
      reviewsFetched,
      reviewsUpserted,
      status,
    });
    await finishSyncState(supabase, context, {
      finishedAt,
      lastReviewUpdatedAt,
      reviewsFetched,
      reviewsUpserted,
      status: "succeeded",
    });

    return {
      credentialRef: config.googlePlay.credential.credentialRef,
      hasMore: Boolean(pageToken),
      nextPageToken: pageToken || null,
      packageName: config.googlePlay.packageName,
      pagesFetched,
      reviewsFetched,
      reviewsUpserted,
      runId: context.runId,
      status,
      storeMappingId,
      triggerType,
    };
  } catch (error) {
    const finishedAt = new Date().toISOString();
    const message =
      error instanceof Error
        ? error.message
        : "Unknown fetch-google-play-reviews error";

    if (context) {
      await finishFetchRun(supabase, context, {
        errorCode: "fetch_google_play_reviews_failed",
        errorMessage: message,
        finishedAt,
        pagesFetched,
        reviewsFetched,
        reviewsUpserted,
        status: "failed",
      });
    }

    if (syncStarted) {
      await finishSyncState(
        supabase,
        { runId: context?.runId ?? "", storeMappingId },
        {
          errorCode: "fetch_google_play_reviews_failed",
          errorMessage: message,
          finishedAt,
          lastReviewUpdatedAt,
          reviewsFetched,
          reviewsUpserted,
          status: "failed",
        },
      );
    }

    throw error;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    requireInternalSecret(request);

    const payload = await readPayload(request);
    const supabase = createAdminClient();
    const result = await fetchGooglePlayReviews(supabase, payload);

    return json({
      ok: true,
      platform: "android",
      result,
    });
  } catch (error) {
    return json(
      {
        ok: false,
        ...edgeErrorPayload(error),
      },
      httpStatusFromError(error),
    );
  }
});
