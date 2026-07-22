import "server-only";

import { fetchSystemTrackingApi } from "@/lib/server-api";
import type {
  IapAppDetailPageData,
  IapRevenueGranularity,
} from "@/lib/tracking/page-data";

const IAP_TRANSACTION_PAGE_SIZE = 10;

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

function todayInputDate(timeZone = "Asia/Ho_Chi_Minh") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
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
  const kind = clean(options?.kind) || "all";
  const environment = clean(options?.environment) || "production";
  const firebaseStatus = clean(options?.firebaseStatus) || "all";
  const defaultPurchaseDate = todayInputDate();
  const purchaseDateFrom = clean(options?.purchaseDateFrom) || defaultPurchaseDate;
  const purchaseDateTo = clean(options?.purchaseDateTo) || defaultPurchaseDate;
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
  const response = await fetchSystemTrackingApi(
    `/api/admin/iap/app-transactions?${params.toString()}`,
  );
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
