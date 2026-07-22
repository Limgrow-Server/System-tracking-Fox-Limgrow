import "server-only";

import { ApiError, badRequest } from "@/lib/server/api/errors";

type VerifyIosIapPayload = {
  adjustAdid?: unknown;
  appInstanceId?: unknown;
  bundleId?: unknown;
  credentialRef?: unknown;
  environment?: unknown;
  firebaseAppId?: unknown;
  idfa?: unknown;
  idfv?: unknown;
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

function functionsBaseUrl() {
  return (
    clean(process.env.SYSTEM_TRACKING_API_URL)
    || clean(process.env.SYSTEM_TRACKING_FUNCTIONS_BASE_URL)
  );
}

export async function verifyIosIapTransaction(payload: VerifyIosIapPayload) {
  const bundleId = clean(payload.bundleId);
  const transactionId = clean(payload.transactionId);
  const credentialRef = clean(payload.credentialRef);
  const adjustAdid = clean(payload.adjustAdid);
  const appInstanceId = clean(payload.appInstanceId);
  const firebaseAppId = clean(payload.firebaseAppId);
  const idfa = clean(payload.idfa);
  const idfv = clean(payload.idfv);
  const productId = clean(payload.productId);
  const userId = clean(payload.userId);

  if (!bundleId) {
    throw badRequest("BundleId is required.");
  }

  if (!transactionId) {
    throw badRequest("TransactionId is required.");
  }

  const baseUrl = functionsBaseUrl();
  const publishableKey = clean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  if (!baseUrl || !publishableKey) {
    throw new ApiError("Missing System Tracking API URL or publishable key.", 500);
  }

  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/functions/v1/verify-ios`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${publishableKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      bundleId,
      adjustAdid: adjustAdid || undefined,
      appInstanceId: appInstanceId || undefined,
      credentialRef: credentialRef || undefined,
      environment: normalizeEnvironment(payload.environment),
      firebaseAppId: firebaseAppId || undefined,
      idfa: idfa || undefined,
      idfv: idfv || undefined,
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
