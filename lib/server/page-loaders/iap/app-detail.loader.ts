import "server-only";

import { canAccessIapApp } from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import { getIapAppDetail } from "@/lib/server/services/iap/iap-app.service";
import type { IapAppDetailPageData } from "@/lib/tracking/page-data";

const IAP_TRANSACTION_PAGE_SIZE = 10;

type IapAppDetailOptions = {
  kind?: string;
  page?: number;
  search?: string;
  state?: string;
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
  const search = clean(options?.search);
  const state = clean(options?.state) || "all";
  const kind = clean(options?.kind) || "all";
  const { appCard, metricTransactions, transactions, transactionStates } =
    await getIapAppDetail(mappingId, platform, {
      kind,
      page,
      pageSize: IAP_TRANSACTION_PAGE_SIZE,
      search: search || undefined,
      skip: (page - 1) * IAP_TRANSACTION_PAGE_SIZE,
      state,
      take: IAP_TRANSACTION_PAGE_SIZE,
    });
  if (!canAccessIapApp(session, appCard)) return null;

  return {
    app: appCard,
    filters: {
      kind,
      search,
      state,
    },
    metricTransactions,
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
