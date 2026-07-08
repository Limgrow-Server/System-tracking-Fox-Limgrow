import "server-only";

import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/server/api/errors";
import { errorJson, okJson } from "@/lib/server/api/responses";
import { runIosIapTwoHourGa4Checks } from "@/lib/server/services/iap/ios-iap-two-hour-ga4.service";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const TEST_BUNDLE_ID = "com.test.app.new.app";
const TEST_TRANSACTION_ID = "ga4_test_transaction_001";

export async function handleGa4TestPost(request: Request) {
  try {
    const body = await request.json() as unknown;
    if (!isRecord(body)) throw badRequest("Request body must be a JSON object.");

    // ── 1. Validate appInstanceId ────────────────────────────────────────────
    const appInstanceId = clean(body.appInstanceId);
    if (!appInstanceId) throw badRequest("appInstanceId is required.");
    if (!/^[0-9a-fA-F]{32}$/.test(appInstanceId)) {
      throw badRequest(
        "appInstanceId must be exactly 32 hex characters (get it from Analytics.appInstanceID() on iOS)."
      );
    }

    // ── 2. Lấy thông tin từ request ──────────────────────────────────────────
    const currency = clean(body.currency) || "VND";
    const rawValue = typeof body.value === "number" ? body.value : 262938;
    const firebaseAppId = clean(body.firebaseAppId) || "1:166580653809:ios:f923e136c83682d2f92350";
    const apiSecret = clean(body.apiSecret) || "g2CNpB7vQWS4uDQwHIoHLw";
    // priceMilliunits = rawValue * 1000 (e.g. 262938 VND → 262938000)
    const priceMilliunits = BigInt(Math.round(rawValue * 1000));

    // ── 3. Cập nhật mapping với đúng firebaseAppId + apiSecret ───────────────
    await prisma.iosStoreMapping.updateMany({
      where: { bundleId: TEST_BUNDLE_ID },
      data: {
        firebaseAppId,
        firebaseAnalyticsApiSecret: apiSecret,
      },
    });

    // ── 4. Upsert transaction (bằng chứng revenue cho cron) ─────────────────
    await prisma.iosIapTransaction.upsert({
      where: { transactionId: TEST_TRANSACTION_ID },
      update: {
        priceMilliunits,
        currency,
        state: "purchased",
        verifiedAt: new Date(),
        rawReceipt: {},
      },
      create: {
        transactionId: TEST_TRANSACTION_ID,
        originalTransactionId: TEST_TRANSACTION_ID,
        productId: "test_product_ga4",
        bundleId: TEST_BUNDLE_ID,
        state: "purchased",
        priceMilliunits,
        currency,
        verifiedAt: new Date(),
        rawReceipt: {},
      },
    });

    // ── 5. Upsert check record với checkAt = now (cron xử lý ngay) ──────────
    await prisma.iosIapTwoHourCheck.upsert({
      where: { transactionId: TEST_TRANSACTION_ID },
      update: {
        appInstanceId: appInstanceId.toLowerCase(),
        firebaseAppId,
        checkAt: new Date(), // ngay lập tức
        status: "pending",
        attempts: 0,
        lastError: null,
        rawContext: { source: "ga4_test_api", scheduledAt: new Date().toISOString() },
      },
      create: {
        transactionId: TEST_TRANSACTION_ID,
        originalTransactionId: TEST_TRANSACTION_ID,
        appInstanceId: appInstanceId.toLowerCase(),
        firebaseAppId,
        bundleId: TEST_BUNDLE_ID,
        productId: "test_product_ga4",
        checkAt: new Date(),
        status: "pending",
        rawContext: { source: "ga4_test_api", scheduledAt: new Date().toISOString() },
      },
    });

    // ── 6. Chạy đúng cron service như production ─────────────────────────────
    const cronResult = await runIosIapTwoHourGa4Checks({ limit: 1 });

    return okJson({
      result: {
        appInstanceId: appInstanceId.toLowerCase(),
        firebaseAppId,
        bundleId: TEST_BUNDLE_ID,
        transactionId: TEST_TRANSACTION_ID,
        originalInput: { currency, value: rawValue, priceMilliunits: priceMilliunits.toString() },
        cron: cronResult,
      },
    });
  } catch (error) {
    return errorJson(error, "GA4 test failed.");
  }
}
