import "server-only";

import { fetchSystemTrackingApi } from "@/lib/server-api";
import type {
  AndroidRtdnHistoryPageData,
  IapAppDetailPageData,
  IapRevenueGranularity,
} from "@/lib/tracking/page-data";

const IAP_TRANSACTION_PAGE_SIZE = 10;
const ANDROID_RTDN_EVENT_PAGE_SIZE = 8;

const EMPTY_METRICS: IapAppDetailPageData["metrics"] = {
  activeCount: 0,
  canceledCount: 0,
  latestTimestamp: 0,
  last7Orders: 0,
  last7Revenue: 0,
  previous7Orders: 0,
  previous7Revenue: 0,
  revenueBuckets: [],
  totalCount: 0,
  totalRevenue: 0,
};

function unavailableAndroidRtdnHistory(
  error: string | null = null,
): AndroidRtdnHistoryPageData {
  return {
    available: false,
    error,
    events: [],
    pagination: {
      page: 1,
      pageSize: ANDROID_RTDN_EVENT_PAGE_SIZE,
      total: 0,
      totalPages: 0,
    },
    summary: null,
  };
}

async function loadAndroidRtdnHistory(
  mappingId: string,
): Promise<AndroidRtdnHistoryPageData> {
  try {
    const params = new URLSearchParams({
      mappingId,
      page: "1",
      pageSize: String(ANDROID_RTDN_EVENT_PAGE_SIZE),
    });
    const response = await fetchSystemTrackingApi(
      `/api/admin/android-iap/rtdn-events?${params.toString()}`,
    );
    const payload = (await response.json().catch(() => null)) as
      | {
          data?: AndroidRtdnHistoryPageData["events"];
          error?: string;
          page?: number;
          pageSize?: number;
          success?: boolean;
          summary?: AndroidRtdnHistoryPageData["summary"];
          total?: number;
          totalPages?: number;
        }
      | null;

    if (
      !response.ok ||
      payload?.success === false ||
      !Array.isArray(payload?.data)
    ) {
      return unavailableAndroidRtdnHistory(
        response.status === 404
          ? null
          : payload?.error ?? "Android RTDN history is unavailable.",
      );
    }

    return {
      available: true,
      error: null,
      events: payload.data,
      pagination: {
        page: payload.page ?? 1,
        pageSize: payload.pageSize ?? ANDROID_RTDN_EVENT_PAGE_SIZE,
        total: payload.total ?? payload.data.length,
        totalPages: payload.totalPages ?? (payload.data.length ? 1 : 0),
      },
      summary: payload.summary ?? null,
    };
  } catch (error) {
    return unavailableAndroidRtdnHistory(
      error instanceof Error
        ? error.message
        : "Android RTDN history is unavailable.",
    );
  }
}

type IapAppDetailOptions = {
  adjustStatus?: string;
  conversionStatus?: string;
  environment?: string;
  firebaseStatus?: string;
  kind?: string;
  page?: number;
  purchaseDateFrom?: string;
  purchaseDateTo?: string;
  revenueGranularity?: string;
  revenueSort?: string;
  state?: string;
  twoHourStatus?: string;
  trial?: string;
};

function clean(value: string | undefined) {
  return value?.trim() ?? "";
}

function pageNumber(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? value : 1;
}

function revenueGranularity(value: string | undefined): IapRevenueGranularity {
  const cleaned = clean(value);
  return cleaned === "day" || cleaned === "week" || cleaned === "month"
    ? cleaned
    : "month";
}

export async function getIapAppDetailPageData(
  mappingId: string,
  platform: string,
  options?: IapAppDetailOptions,
): Promise<IapAppDetailPageData | null> {
  const page = pageNumber(options?.page);
  const adjustStatus = clean(options?.adjustStatus) || "all";
  const conversionStatus = clean(options?.conversionStatus) || "all";
  const state = clean(options?.state) || "all";
  const requestedKind = clean(options?.kind) || "all";
  const kind = requestedKind === "inapp" ? "product" : requestedKind;
  const environment = clean(options?.environment) || "production";
  const firebaseStatus = clean(options?.firebaseStatus) || "all";
  const purchaseDateFrom = clean(options?.purchaseDateFrom);
  const purchaseDateTo = clean(options?.purchaseDateTo);
  const selectedRevenueGranularity = revenueGranularity(
    options?.revenueGranularity,
  );
  const revenueSort =
    clean(options?.revenueSort) === "asc" ||
    clean(options?.revenueSort) === "desc"
      ? clean(options?.revenueSort)
      : "none";
  const twoHourStatus = clean(options?.twoHourStatus) || "all";
  const trial = clean(options?.trial) || "all";
  const params = new URLSearchParams({
    adjustStatus,
    context: "false",
    conversionStatus,
    environment,
    firebaseStatus,
    kind,
    mappingId,
    page: String(page),
    pageSize: String(IAP_TRANSACTION_PAGE_SIZE),
    platform,
    purchaseDateFrom,
    purchaseDateTo,
    revenueGranularity: selectedRevenueGranularity,
    revenueSort,
    state,
    twoHourStatus,
    trial,
  });
  const [response, androidRtdnHistory] = await Promise.all([
    fetchSystemTrackingApi(
      `/api/admin/iap/app-transactions?${params.toString()}`,
    ),
    platform === "android"
      ? loadAndroidRtdnHistory(mappingId)
      : Promise.resolve(null),
  ]);
  const payload = await response.json() as {
    app?: IapAppDetailPageData["app"];
    data?: IapAppDetailPageData["transactions"];
    error?: string;
    page?: number;
    pageSize?: number;
    success?: boolean;
    total?: number;
    totalPages?: number;
    transactionStates?: string[];
    twoHourChecks?: IapAppDetailPageData["twoHourChecks"];
  };

  if (response.status === 403 || response.status === 404) return null;
  if (!response.ok || !payload.success || !payload.app || !Array.isArray(payload.data)) {
    throw new Error(payload.error ?? "Load IAP app transactions failed.");
  }

  return {
    androidRtdnHistory,
    app: payload.app,
    filters: {
      adjustStatus,
      conversionStatus,
      environment,
      firebaseStatus,
      kind,
      purchaseDateFrom,
      purchaseDateTo,
      revenueGranularity: selectedRevenueGranularity,
      revenueSort,
      state,
      twoHourStatus,
      trial,
    },
    trialAnalytics: null,
    metrics: EMPTY_METRICS,
    metricsLoaded: false,
    transactionPagination: {
      page: payload.page ?? page,
      pageSize: payload.pageSize ?? IAP_TRANSACTION_PAGE_SIZE,
      total: payload.total ?? payload.data.length,
      totalPages: payload.totalPages ?? 1,
    },
    transactionStates: Array.isArray(payload.transactionStates)
      ? payload.transactionStates
      : [],
    transactions: payload.data,
    twoHourChecks: Array.isArray(payload.twoHourChecks)
      ? payload.twoHourChecks
      : [],
  };
}
