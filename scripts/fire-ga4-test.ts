/**
 * fire-ga4-test.ts
 *
 * Bắn trực tiếp các event thử nghiệm lên GA4 Measurement Protocol.
 * Chạy bằng: npx tsx scripts/fire-ga4-test.ts
 *
 * Các test case:
 *  test1 – VND tự convert sang USD qua API
 *  test2 – Giữ nguyên VND, không convert
 *  test3 – USD sẵn, không cần convert
 *  test4 – Giá trị 0 (simulate user đã cancel/disabled)
 */

// ─── Config ──────────────────────────────────────────────────────────────────
const FIREBASE_APP_ID = "1:166580653809:ios:f923e136c83682d2f92350";
const GA4_API_SECRET  = "g2CNpB7vQWS4uDQwHIoHLw";
// app_instance_id phải là 32 ký tự hex lấy từ Analytics.appInstanceID() trong app iOS thật.
// Dùng giá trị giả 32-hex để test DebugView (sẽ không match thiết bị thật).
const APP_INSTANCE_ID = "8791ee2ef9654880a69a2c382aa0a5d1"; // lowercase required by GA4
const GA4_ENDPOINT    = "https://www.google-analytics.com/mp/collect";
// ─────────────────────────────────────────────────────────────────────────────

type TestCase = {
  name: string;
  eventName: string;
  value: number;
  currency: string;
  convertToUsd: boolean;
  renewalStatus: string;
  note: string;
};

const TEST_CASES: TestCase[] = [
  {
    name: "Test 1 – VND auto-convert → USD",
    eventName: "purchase_2hour_test1",
    value: 262938,
    currency: "VND",
    convertToUsd: true,
    renewalStatus: "enabled",
    note: "Value gốc 262,938 VND, tự convert sang USD trước khi bắn",
  },
  {
    name: "Test 2 – VND raw, KHÔNG convert",
    eventName: "purchase_2hour_test2",
    value: 262938,
    currency: "VND",
    convertToUsd: false,
    renewalStatus: "enabled",
    note: "Value gốc 262,938 VND, giữ nguyên không convert",
  },
];

async function convertViaApi(amount: number, baseCurrency: string): Promise<{ value: number; currency: string }> {
  const clean = baseCurrency.trim().toUpperCase();
  if (clean === "USD" || !clean) return { value: amount, currency: "USD" };

  const res = await fetch("https://live-earth-map.limgrow.com/money/convert", {
    method: "POST",
    headers: { "accept": "application/json", "content-type": "application/json" },
    body: JSON.stringify({ base: clean, target: "USD", amount }),
  });

  if (!res.ok) {
    console.warn(`  [convert] API error ${res.status}, giữ nguyên ${baseCurrency}`);
    return { value: amount, currency: baseCurrency };
  }

  const json = await res.json() as { data?: number };
  if (json && typeof json.data === "number" && Number.isFinite(json.data)) {
    return { value: json.data, currency: "USD" };
  }

  return { value: amount, currency: baseCurrency };
}

async function fireEvent(tc: TestCase) {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`▶ ${tc.name}`);
  console.log(`  Note: ${tc.note}`);

  // Quyết định value và currency cuối cùng
  let finalValue = tc.value;
  let finalCurrency = tc.currency;

  if (tc.convertToUsd && tc.value > 0) {
    const converted = await convertViaApi(tc.value, tc.currency);
    finalValue = converted.value;
    finalCurrency = converted.currency;
    if (finalCurrency === "USD") {
      console.log(`  [convert] ${tc.value} ${tc.currency} → ${finalValue.toFixed(6)} USD`);
    }
  }

  const url = new URL(GA4_ENDPOINT);
  url.searchParams.set("firebase_app_id", FIREBASE_APP_ID);
  url.searchParams.set("api_secret", GA4_API_SECRET);

  const payload = {
    app_instance_id: APP_INSTANCE_ID,
    events: [
      {
        name: tc.eventName,
        params: {
          engagement_time_msec: 1,
          debug_mode: 1,
          currency: finalCurrency,
          value: finalValue,
          renewal_status: tc.renewalStatus,
          bundle_id: "com.test.app.new.app",
          product_id: "test_product_123",
          environment: "sandbox",
          transaction_id: `test_tx_${tc.eventName}`,
          original_transaction_id: `test_orig_tx_${tc.eventName}`,
          revenue_source: tc.value > 0 ? (tc.convertToUsd ? "converted_usd" : "raw_currency") : "cancel_or_disabled",
        },
      },
    ],
  };

  const requestHeaders = {
    "content-type": "application/json",
    "user-agent": "system-tracking-ios-iap-ga4-test/1.0",
  };
  const decodedUrl = decodeURIComponent(url.toString());
  const payloadStr = JSON.stringify(payload, null, 2);

  console.log(`  ┌─ REQUEST ────────────────────────────────────────────`);
  console.log(`  │ URL     : ${decodedUrl}`);
  console.log(`  │ Method  : POST`);
  console.log(`  │ Headers : ${JSON.stringify(requestHeaders)}`);
  console.log(`  │ Body    :`);
  for (const line of payloadStr.split("\n")) {
    console.log(`  │   ${line}`);
  }
  console.log(`  └──────────────────────────────────────────────────────`);

  const res = await fetch(decodedUrl, {
    method: "POST",
    headers: requestHeaders,
    body: payloadStr,
  });

  const responseText = await res.text();

  console.log(`  ┌─ RESPONSE ───────────────────────────────────────────`);
  console.log(`  │ Status  : ${res.status} ${res.statusText}`);
  console.log(`  │ Body    : ${responseText || "(empty — event accepted, no errors)"}`);
  console.log(`  └──────────────────────────────────────────────────────`);
}

async function main() {
  console.log("Firebase App ID :", FIREBASE_APP_ID);
  console.log("GA4 Endpoint    :", GA4_ENDPOINT);
  console.log("App Instance ID :", APP_INSTANCE_ID);
  console.log("Chạy", TEST_CASES.length, "test cases...");

  for (const tc of TEST_CASES) {
    await fireEvent(tc);
  }

  console.log(`\n${"─".repeat(60)}`);
  console.log("✅ Xong! Kiểm tra Firebase DebugView để xem events.");
  console.log("   https://console.firebase.google.com → DebugView");
}

main().catch(console.error);
