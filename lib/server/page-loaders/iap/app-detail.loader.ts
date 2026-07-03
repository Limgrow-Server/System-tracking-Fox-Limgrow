import "server-only";

import { canAccessIapApp } from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import { getIapAppDetail } from "@/lib/server/services/iap/iap-app.service";
import type { IapAppDetailPageData } from "@/lib/tracking/page-data";

const IAP_TRANSACTION_PAGE_SIZE = 10;

type IapAppDetailOptions = {
  environment?: string;
  kind?: string;
  page?: number;
  state?: string;
  trial?: string;
};

function clean(value: string | undefined) {
  return value?.trim() ?? "";
}

function pageNumber(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? value : 1;
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
  const environment =
    platform === "android" ? clean(options?.environment) || "all" : "production";
  const trial = clean(options?.trial) || "all";
  const { appCard, metrics, transactions, transactionStates, trialAnalytics } =
    await getIapAppDetail(mappingId, platform, {
      environment,
      includeContext: false,
      includeTrialAnalytics: false,
      kind,
      page,
      pageSize: IAP_TRANSACTION_PAGE_SIZE,
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
  };
}
