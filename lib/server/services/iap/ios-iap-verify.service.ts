import "server-only";

import { ApiError, badRequest } from "@/lib/server/api/errors";
import { createClient } from "@/lib/supabase/server";

type VerifyIosIapPayload = {
  appInstanceId?: unknown;
  bundleId?: unknown;
  credentialRef?: unknown;
  environment?: unknown;
  firebaseAppId?: unknown;
  productId?: unknown;
  transactionId?: unknown;
  userId?: unknown;
};

type JsonRecord = Record<string, unknown>;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeEnvironment(value: unknown): "production" | "sandbox" {
  return clean(value).toLowerCase() === "sandbox" ? "sandbox" : "production";
}

function sanitizeTransaction(value: unknown) {
  if (!isRecord(value)) return value;

  const transaction = { ...value };
  delete transaction.raw_receipt;
  return transaction;
}

function parseJsonResponse(rawBody: string) {
  if (!rawBody) return {};

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return { error: rawBody };
  }
}

function sanitizeVerifyIosResponse(value: unknown) {
  if (!isRecord(value)) return { result: value };

  const result = isRecord(value.result) ? value.result : {};
  return {
    platform: value.platform ?? "ios",
    result: {
      ...result,
      transaction: sanitizeTransaction(result.transaction),
    },
  };
}

async function getCurrentSupabaseAccessToken() {
  const supabase = await createClient();
  // Authorization already happened via requireAdminSession; this only forwards the JWT to the Edge gateway.
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session?.access_token) {
    throw new ApiError("Supabase session expired. Please sign in again.", 401);
  }

  return data.session.access_token;
}

export async function verifyIosIapTransaction(payload: VerifyIosIapPayload) {
  const bundleId = clean(payload.bundleId);
  const transactionId = clean(payload.transactionId);
  const credentialRef = clean(payload.credentialRef);
  const appInstanceId = clean(payload.appInstanceId);
  const firebaseAppId = clean(payload.firebaseAppId);
  const productId = clean(payload.productId);
  const userId = clean(payload.userId);

  if (!bundleId) {
    throw badRequest("BundleId is required.");
  }

  if (!transactionId) {
    throw badRequest("TransactionId is required.");
  }

  const supabaseUrl = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const publishableKey = clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  if (!supabaseUrl || !publishableKey) {
    throw new ApiError("Missing Supabase URL or publishable key.", 500);
  }

  const response = await fetch(`${supabaseUrl.replace(/\/$/, "")}/functions/v1/verify-ios`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${await getCurrentSupabaseAccessToken()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      bundleId,
      appInstanceId: appInstanceId || undefined,
      credentialRef: credentialRef || undefined,
      environment: normalizeEnvironment(payload.environment),
      firebaseAppId: firebaseAppId || undefined,
      productId: productId || undefined,
      transactionId,
      userId: userId || undefined,
    }),
  });
  const rawBody = await response.text();
  const responseBody = parseJsonResponse(rawBody);

  if (!response.ok || (isRecord(responseBody) && responseBody.ok === false)) {
    const message = isRecord(responseBody) && typeof responseBody.error === "string"
      ? responseBody.error
      : `verify-ios failed with HTTP ${response.status}`;
    throw new ApiError(message, response.ok ? 500 : response.status);
  }

  return {
    ...sanitizeVerifyIosResponse(responseBody),
    message: "iOS transaction verified.",
  };
}
