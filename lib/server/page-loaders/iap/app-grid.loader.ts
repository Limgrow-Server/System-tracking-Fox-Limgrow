import "server-only";

import { canAccessIapApp } from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import {
  getIapAppCards,
  getIapAppCardsPage,
} from "@/lib/server/services/iap/iap-app.service";
import type { IapAppGridPageData } from "@/lib/tracking/page-data";

const IAP_APP_PAGE_SIZE = 12;

type IapAppGridOptions = {
  page?: number;
  search?: string;
  storeAccountName?: string;
};

function pageNumber(value: number | undefined) {
  return Number.isFinite(value) && value && value > 0 ? value : 1;
}

export async function getIapAppGridPageData(
  session: ConsoleSession,
  options?: IapAppGridOptions,
): Promise<IapAppGridPageData> {
  const search = options?.search?.trim() ?? "";
  const storeAccountName = options?.storeAccountName?.trim() ?? "";
  const page = pageNumber(options?.page);
  const pagination = {
    page,
    pageSize: IAP_APP_PAGE_SIZE,
    skip: (page - 1) * IAP_APP_PAGE_SIZE,
    take: IAP_APP_PAGE_SIZE,
  };
  const [allApps, matchingApps] = await Promise.all([
    getIapAppCards(),
    getIapAppCards({
      search: search || undefined,
      storeAccountName: storeAccountName || undefined,
    }),
  ]);
  const scopedApps = matchingApps.filter((app) => canAccessIapApp(session, app));
  const appPage = getIapAppCardsPage(scopedApps, pagination);
  const scopedStoreApps = allApps.filter((app) => canAccessIapApp(session, app));
  const storeNames = Array.from(
    new Set(scopedStoreApps.map((app) => app.storeAccountName)),
  ).sort();

  return {
    appPagination: {
      page: appPage.page,
      pageSize: appPage.pageSize,
      total: appPage.total,
      totalPages: appPage.totalPages,
    },
    apps: appPage.data,
    filters: {
      search,
      storeAccountName,
    },
    storeNames,
  };
}
