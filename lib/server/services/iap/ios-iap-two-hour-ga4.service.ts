import "server-only";

import { Prisma } from "@prisma/client";

import {
  claimDueIosIapTwoHourChecks,
  getIosIapRenewalEvidence,
  markIosIapTwoHourCheckFailed,
  markIosIapTwoHourCheckSent,
  type IosIapRenewalEvidenceEvent,
  type IosIapRenewalEvidenceTransaction,
  type IosIapTwoHourCheckRecord,
} from "@/lib/server/repositories/iap/ios-iap-two-hour-check.repository";
import { getIosStoreMappingGa4Config } from "@/lib/server/repositories/ios/store-mapping.repository";

type JsonRecord = Record<string, unknown>;

type Ga4Config = {
  apiSecret: string;
  firebaseAppId: string;
};

type Ga4ConfigEntry = {
  apiSecret?: unknown;
  api_secret?: unknown;
  analyticsApiSecret?: unknown;
  firebaseAnalyticsApiSecret?: unknown;
  firebase_app_id?: unknown;
  firebaseAppId?: unknown;
  measurementApiSecret?: unknown;
};

type RenewalDecision = {
  evidence: string;
  renewalStatus: string;
  renewed: boolean;
};

const DEFAULT_BATCH_LIMIT = 25;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 5 * 60_000;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function positiveIntEnv(name: string, fallback: number) {
  const parsed = Number.parseInt(clean(process.env[name]), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function boolEnv(name: string, fallback = false) {
  const value = clean(process.env[name]).toLowerCase();
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value);
}

function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = clean(process.env[name]);
    if (value) return value;
  }

  return "";
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function upper(value: unknown) {
  return clean(value).toUpperCase();
}

function rawReceiptRecord(transaction: IosIapRenewalEvidenceTransaction) {
  return isRecord(transaction.rawReceipt) ? transaction.rawReceipt : {};
}

function decodedRenewalInfo(value: unknown) {
  if (!isRecord(value)) return null;
  if (isRecord(value.decodedRenewalInfo)) return value.decodedRenewalInfo;

  const data = isRecord(value.data) ? value.data : null;
  if (isRecord(data?.decodedRenewalInfo)) return data.decodedRenewalInfo;

  return null;
}

function renewalStatusFromAutoRenewStatus(value: unknown) {
  const numeric = numberValue(value);
  if (numeric === 1) return "enabled" as const;
  if (numeric === 0) return "disabled" as const;

  const normalized = upper(value);
  if (["AUTO_RENEW_ON", "ENABLED", "TRUE"].includes(normalized)) {
    return "enabled" as const;
  }
  if (["AUTO_RENEW_OFF", "DISABLED", "FALSE"].includes(normalized)) {
    return "disabled" as const;
  }

  return null;
}

function renewalStatusFromSubtype(value: unknown) {
  const subtype = upper(value);
  if (subtype === "AUTO_RENEW_ENABLED") return "enabled" as const;
  if (subtype === "AUTO_RENEW_DISABLED") return "disabled" as const;
  return null;
}

function renewalStatusFromJson(value: unknown) {
  const record = isRecord(value) ? value : {};
  const renewalInfo = decodedRenewalInfo(record);
  const byAutoRenewStatus = renewalStatusFromAutoRenewStatus(
    renewalInfo?.autoRenewStatus,
  );

  return byAutoRenewStatus ?? renewalStatusFromSubtype(record.subtype);
}

function eventRenewalDecision(event: IosIapRenewalEvidenceEvent) {
  const subtypeStatus = renewalStatusFromSubtype(event.subtype);
  if (subtypeStatus) {
    return {
      evidence: `notification:${event.notificationType}:${event.subtype ?? ""}`,
      renewalStatus: subtypeStatus,
      renewed: subtypeStatus === "enabled",
    } satisfies RenewalDecision;
  }

  const payloadStatus = renewalStatusFromJson(event.decodedPayload);
  if (payloadStatus) {
    return {
      evidence: `notification:${event.notificationType}:decoded_renewal_info`,
      renewalStatus: payloadStatus,
      renewed: payloadStatus === "enabled",
    } satisfies RenewalDecision;
  }

  const notificationType = upper(event.notificationType);
  if (["CANCEL", "EXPIRED", "REFUND", "REVOKE"].includes(notificationType)) {
    return {
      evidence: `notification:${event.notificationType}`,
      renewalStatus: "disabled",
      renewed: false,
    } satisfies RenewalDecision;
  }

  return null;
}

function transactionRenewalDecision(
  transaction: IosIapRenewalEvidenceTransaction,
) {
  const status = renewalStatusFromJson(rawReceiptRecord(transaction));
  if (status) {
    return {
      evidence: `transaction:${transaction.transactionId}:renewal_info`,
      renewalStatus: status,
      renewed: status === "enabled",
    } satisfies RenewalDecision;
  }

  const state = transaction.state.toLowerCase();
  if (["canceled", "expired", "refunded", "revoked"].includes(state)) {
    return {
      evidence: `transaction:${transaction.transactionId}:state:${state}`,
      renewalStatus: "disabled",
      renewed: false,
    } satisfies RenewalDecision;
  }

  return null;
}

function defaultRenewalDecision(): RenewalDecision {
  return {
    evidence: "default:no_cancel_signal_after_two_hours",
    renewalStatus: "enabled_or_no_cancel_signal",
    renewed: true,
  };
}

async function decideRenewal(check: IosIapTwoHourCheckRecord) {
  const evidence = await getIosIapRenewalEvidence({
    originalTransactionId: check.originalTransactionId,
    transactionId: check.transactionId,
  });

  for (const event of evidence.notificationEvents) {
    const decision = eventRenewalDecision(event);
    if (decision) return { decision, evidence };
  }

  for (const transaction of evidence.transactions) {
    const decision = transactionRenewalDecision(transaction);
    if (decision) return { decision, evidence };
  }

  return { decision: defaultRenewalDecision(), evidence };
}

function parseGa4ConfigMap() {
  const raw = clean(process.env.IOS_IAP_2HOUR_GA4_CONFIG_JSON);
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function configEntry(record: unknown): Partial<Ga4Config> {
  if (!isRecord(record)) return {};

  return {
    apiSecret:
      clean((record as Ga4ConfigEntry).apiSecret) ||
      clean((record as Ga4ConfigEntry).api_secret) ||
      clean((record as Ga4ConfigEntry).measurementApiSecret) ||
      clean((record as Ga4ConfigEntry).analyticsApiSecret) ||
      clean((record as Ga4ConfigEntry).firebaseAnalyticsApiSecret),
    firebaseAppId:
      clean((record as Ga4ConfigEntry).firebaseAppId) ||
      clean((record as Ga4ConfigEntry).firebase_app_id),
  };
}

async function resolveGa4Config(check: IosIapTwoHourCheckRecord): Promise<Ga4Config> {
  const mappingConfig = await getIosStoreMappingGa4Config({
    bundleId: check.bundleId,
    storeProfileId: check.storeProfileId,
  });
  const configMap = parseGa4ConfigMap();
  const lookupKeys = [
    `${check.storeProfileId ?? ""}:${check.bundleId}`,
    check.bundleId,
    check.storeProfileId ?? "",
    "*",
  ].filter(Boolean);
  const mappedConfig = lookupKeys.reduce<Partial<Ga4Config>>((current, key) => {
    if (current.apiSecret && current.firebaseAppId) return current;
    return { ...current, ...configEntry(configMap[key]) };
  }, {});
  const allowGlobalFallback = boolEnv(
    "IOS_IAP_2HOUR_ALLOW_GLOBAL_GA4_FALLBACK",
  );
  const apiSecret =
    clean(mappingConfig?.firebaseAnalyticsApiSecret) ||
    mappedConfig.apiSecret ||
    (allowGlobalFallback
      ? firstEnv(
          "FIREBASE_ANALYTICS_API_SECRET",
          "IOS_IAP_2HOUR_GA4_API_SECRET",
          "GA4_MEASUREMENT_API_SECRET",
        )
      : "");
  const firebaseAppId =
    clean(mappingConfig?.firebaseAppId) ||
    mappedConfig.firebaseAppId ||
    check.firebaseAppId ||
    (allowGlobalFallback
      ? firstEnv(
          "FIREBASE_APP_ID",
          "IOS_IAP_2HOUR_GA4_FIREBASE_APP_ID",
          "GA4_FIREBASE_APP_ID",
        )
      : "");

  if (!apiSecret) {
    throw new Error("ios_iap_2hour_ga4_api_secret_missing");
  }
  if (!firebaseAppId) {
    throw new Error("ios_iap_2hour_firebase_app_id_missing");
  }

  return { apiSecret, firebaseAppId };
}

function measurementEndpoint() {
  return boolEnv("IOS_IAP_2HOUR_GA4_VALIDATE_ONLY")
    ? "https://www.google-analytics.com/debug/mp/collect"
    : "https://www.google-analytics.com/mp/collect";
}

function eventParams(params: Record<string, string | number | null>) {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== null && value !== ""),
  );
}

function scaledMoneyValue(value: bigint | number | string | null | undefined, scale: number) {
  if (value === null || value === undefined) return null;
  const numeric = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isFinite(numeric)) return null;
  return numeric / scale;
}

function revenueFromTransaction(transaction: IosIapRenewalEvidenceTransaction | null) {
  if (!transaction) {
    return {
      currency: null,
      source: "missing_transaction",
      transactionId: null,
      value: 0,
    };
  }

  const revenueValue = scaledMoneyValue(transaction.revenueMicros, 1_000_000);
  const priceValue = scaledMoneyValue(transaction.priceMilliunits, 1000);
  const value = revenueValue ?? priceValue ?? 0;

  return {
    currency: clean(transaction.currency) || null,
    source: revenueValue !== null
      ? "revenue_micros"
      : priceValue !== null
        ? "price_milliunits"
        : "missing_price",
    transactionId: transaction.transactionId,
    value,
  };
}

function revenueTransactionForCheck(
  check: IosIapTwoHourCheckRecord,
  transactions: IosIapRenewalEvidenceTransaction[],
) {
  return (
    transactions.find((transaction) => transaction.transactionId === check.transactionId) ||
    transactions.find((transaction) =>
      check.originalTransactionId &&
      transaction.originalTransactionId === check.originalTransactionId &&
      (transaction.revenueMicros !== null || transaction.priceMilliunits !== null)
    ) ||
    transactions.find((transaction) =>
      transaction.revenueMicros !== null || transaction.priceMilliunits !== null
    ) ||
    transactions[0] ||
    null
  );
}

async function convertToUsd(amount: number, baseCurrency: string): Promise<{ value: number; currency: string }> {
  const cleanCurrency = baseCurrency.trim().toUpperCase();
  if (cleanCurrency === "USD" || !cleanCurrency) {
    return { value: amount, currency: "USD" };
  }

  try {
    const response = await fetch("https://live-earth-map.limgrow.com/money/convert", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        base: cleanCurrency,
        target: "USD",
        amount: amount,
      }),
    });

    if (!response.ok) {
      console.warn(`Currency conversion API returned status ${response.status} for ${cleanCurrency} -> USD`);
      return { value: amount, currency: baseCurrency };
    }

    const json = await response.json() as { data?: number };
    if (json && typeof json.data === "number" && Number.isFinite(json.data)) {
      return { value: json.data, currency: "USD" };
    }

    return { value: amount, currency: baseCurrency };
  } catch (error) {
    console.error("Currency conversion failed:", error);
    return { value: amount, currency: baseCurrency };
  }
}

async function ga4RevenueParams(
  check: IosIapTwoHourCheckRecord,
  decision: RenewalDecision,
  transactions: IosIapRenewalEvidenceTransaction[],
) {
  const transaction = revenueTransactionForCheck(check, transactions);
  const revenue = revenueFromTransaction(transaction);

  if (!decision.renewed) {
    return {
      currency: revenue.currency || "USD",
      revenue_source: "cancel_or_disabled",
      revenue_transaction_id: revenue.transactionId,
      value: 0,
    };
  }

  if (revenue.currency && revenue.value > 0) {
    const converted = await convertToUsd(revenue.value, revenue.currency);
    return {
      currency: converted.currency,
      revenue_source: revenue.source,
      revenue_transaction_id: revenue.transactionId,
      value: converted.value,
    };
  }

  return {
    currency: revenue.currency || "USD",
    revenue_source: revenue.source,
    revenue_transaction_id: revenue.transactionId,
    value: revenue.value,
  };
}

// Raw revenue params — giữ nguyên currency gốc, KHÔNG convert sang USD
function ga4RevenueParamsRaw(
  check: IosIapTwoHourCheckRecord,
  decision: RenewalDecision,
  transactions: IosIapRenewalEvidenceTransaction[],
) {
  const transaction = revenueTransactionForCheck(check, transactions);
  const revenue = revenueFromTransaction(transaction);

  if (!decision.renewed) {
    return {
      currency: revenue.currency || "USD",
      revenue_source: "cancel_or_disabled",
      revenue_transaction_id: revenue.transactionId,
      value: 0,
    };
  }

  return {
    currency: revenue.currency || "USD",
    revenue_source: revenue.source + "_raw",
    revenue_transaction_id: revenue.transactionId,
    value: revenue.value,
  };
}

async function sendGa4PurchaseTwoHourEvent(
  check: IosIapTwoHourCheckRecord,
  decision: RenewalDecision,
  transactions: IosIapRenewalEvidenceTransaction[],
) {
  const config = await resolveGa4Config(check);
  const url = new URL(measurementEndpoint());
  url.searchParams.set("firebase_app_id", config.firebaseAppId);
  url.searchParams.set("api_secret", config.apiSecret);

  const isDebug =
    boolEnv("IOS_IAP_2HOUR_GA4_DEBUG_MODE") ||
    boolEnv("IOS_IAP_2HOUR_GA4_VALIDATE_ONLY");

  const baseEventName =
    clean(process.env.IOS_IAP_2HOUR_GA4_EVENT_NAME) ||
    check.ga4EventName ||
    "purchase_2hour";

  const debugMode = isDebug ? 1 : null;

  // Params dùng chung cho cả 2 event (không liên quan đến revenue)
  const commonParams = {
    bundle_id: check.bundleId,
    engagement_time_msec: 1,
    environment: check.environment,
    original_transaction_id: check.originalTransactionId,
    product_id: check.productId,
    renewal_status: decision.renewalStatus,
    transaction_id: check.transactionId,
    debug_mode: debugMode,
  };

  let events: { name: string; params: Record<string, string | number | null> }[];

  if (isDebug) {
    // Debug mode: bắn 2 event —
    //   test1: value đã convert sang USD
    //   test2: giữ nguyên currency gốc, không convert
    const revenueConverted = await ga4RevenueParams(check, decision, transactions);
    const revenueRaw = ga4RevenueParamsRaw(check, decision, transactions);

    events = [
      {
        name: `${baseEventName}_test1`,
        params: eventParams({
          ...commonParams,
          currency: revenueConverted.currency,
          revenue_source: revenueConverted.revenue_source,
          revenue_transaction_id: revenueConverted.revenue_transaction_id,
          value: revenueConverted.value,
        }),
      },
      {
        name: `${baseEventName}_test2`,
        params: eventParams({
          ...commonParams,
          currency: revenueRaw.currency,
          revenue_source: revenueRaw.revenue_source,
          revenue_transaction_id: revenueRaw.revenue_transaction_id,
          value: revenueRaw.value,
        }),
      },
    ];
  } else {
    // Production: bắn 1 event duy nhất với value đã convert sang USD
    const revenue = await ga4RevenueParams(check, decision, transactions);
    events = [
      {
        name: baseEventName,
        params: eventParams({
          ...commonParams,
          currency: revenue.currency,
          revenue_source: revenue.revenue_source,
          revenue_transaction_id: revenue.revenue_transaction_id,
          value: revenue.value,
        }),
      },
    ];
  }

  const body = {
    app_instance_id: check.appInstanceId,
    events,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "system-tracking-ios-iap-ga4/1.0",
    },
    body: JSON.stringify(body),
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(
      responseText ||
        `ga4_measurement_protocol_failed_http_${response.status}`,
    );
  }

  return {
    eventNames: events.map((e) => e.name),
    firebaseAppId: config.firebaseAppId,
    isDebug,
    responseBody: responseText || null,
    responseStatus: response.status,
    validationOnly: boolEnv("IOS_IAP_2HOUR_GA4_VALIDATE_ONLY"),
  };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function retryDelayMs(attempts: number) {
  return Math.min(
    DEFAULT_RETRY_DELAY_MS * Math.max(attempts, 1),
    30 * 60_000,
  );
}

function finalFailure(error: unknown) {
  const message = errorMessage(error);
  return (
    message.includes("api_secret_missing") ||
    message.includes("firebase_app_id_missing")
  );
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

export async function runIosIapTwoHourGa4Checks(options?: {
  limit?: number;
  maxAttempts?: number;
}) {
  const limit = options?.limit ?? positiveIntEnv(
    "IOS_IAP_2HOUR_CHECK_LIMIT",
    DEFAULT_BATCH_LIMIT,
  );
  const maxAttempts = options?.maxAttempts ?? positiveIntEnv(
    "IOS_IAP_2HOUR_CHECK_MAX_ATTEMPTS",
    DEFAULT_MAX_ATTEMPTS,
  );

  if (limit <= 0) {
    return {
      checkedAt: new Date().toISOString(),
      claimed: 0,
      processed: [],
    };
  }

  const claimed = await claimDueIosIapTwoHourChecks({
    limit,
    maxAttempts,
  });
  const processed: Array<{
    error?: string;
    id: string;
    renewed?: boolean;
    status: string;
    transactionId: string;
  }> = [];

  for (const check of claimed) {
    try {
      const { decision, evidence } = await decideRenewal(check);
      let ga4Result = null;
      if (decision.renewed) {
        ga4Result = await sendGa4PurchaseTwoHourEvent(
          check,
          decision,
          evidence.transactions,
        );
      }
      await markIosIapTwoHourCheckSent(check.id, {
        rawContext: jsonValue({
          decision,
          ga4: ga4Result,
          skipped: !decision.renewed,
          notificationEventCount: evidence.notificationEvents.length,
          transactionCount: evidence.transactions.length,
        }),
        renewalStatus: decision.renewalStatus,
        renewed: decision.renewed,
      });

      processed.push({
        id: check.id,
        renewed: decision.renewed,
        status: "sent",
        transactionId: check.transactionId,
      });
    } catch (error) {
      const shouldFail =
        finalFailure(error) || check.attempts >= maxAttempts;
      const nextStatus = shouldFail ? "failed" : "retrying";
      await markIosIapTwoHourCheckFailed(check.id, {
        checkAt: shouldFail
          ? undefined
          : new Date(Date.now() + retryDelayMs(check.attempts)),
        lastError: errorMessage(error),
        rawContext: jsonValue({
          error: errorMessage(error),
          failedAt: new Date().toISOString(),
        }),
        status: nextStatus,
      });

      processed.push({
        error: errorMessage(error),
        id: check.id,
        status: nextStatus,
        transactionId: check.transactionId,
      });
    }
  }

  return {
    checkedAt: new Date().toISOString(),
    claimed: claimed.length,
    processed,
  };
}
