import "server-only";

import { canAccessIapApp } from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import { getIapAppDetail } from "@/lib/server/services/iap/iap-app.service";
import type {
  IapAppDetailPageData,
  IapRevenueGranularity,
} from "@/lib/tracking/page-data";

const IAP_TRANSACTION_PAGE_SIZE = 10;

type IapAppDetailOptions = {
  environment?: string;
  kind?: string;
  page?: number;
  purchaseDateFrom?: string;
  purchaseDateTo?: string;
  revenueGranularity?: string;
  revenueSort?: string;
  state?: string;
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
  session: ConsoleSession,
  options?: IapAppDetailOptions,
): Promise<IapAppDetailPageData | null> {
  const page = pageNumber(options?.page);
  const state = clean(options?.state) || "all";
  const kind = clean(options?.kind) || "all";
  const environment = clean(options?.environment) || "production";
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
  const trial = clean(options?.trial) || "all";
  const {
    appCard,
    metrics,
    transactions,
    transactionStates,
    trialAnalytics,
    twoHourChecks,
  } = await getIapAppDetail(mappingId, platform, {
    environment,
    includeContext: false,
    includeTrialAnalytics: false,
    kind,
    page,
    pageSize: IAP_TRANSACTION_PAGE_SIZE,
    purchaseDateFrom,
    purchaseDateTo,
    revenueGranularity: selectedRevenueGranularity,
    revenueSort,
    skip: (page - 1) * IAP_TRANSACTION_PAGE_SIZE,
    state,
    take: IAP_TRANSACTION_PAGE_SIZE,
    trial,
  });
  if (!canAccessIapApp(session, appCard)) return null;

  return {
    app: appCard,
    filters: {
      environment,
      kind,
      purchaseDateFrom,
      purchaseDateTo,
      revenueGranularity: selectedRevenueGranularity,
      revenueSort,
      state,
      trial,
    },
    trialAnalytics,
    metrics,
    metricsLoaded: false,
    transactionPagination: {
      page: transactions.page,
      pageSize: transactions.pageSize,
      total: transactions.total,
      totalPages: transactions.totalPages,
    },
    transactionStates,
    transactions: transactions.data,
    twoHourChecks,
  };
}
