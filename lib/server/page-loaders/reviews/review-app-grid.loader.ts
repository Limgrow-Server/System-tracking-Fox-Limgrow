import "server-only";

import { canAccessReviewApp } from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import {
  filterReviewAppCards,
  getReviewAppCards,
  paginateReviewAppCards,
  reviewStoreOptions,
} from "@/lib/server/services/reviews/review.service";
import type { PaginationQuery } from "@/lib/server/api/pagination";
import type { ReviewAppGridPageData } from "@/lib/tracking/page-data";

export async function getReviewAppGridPageData(
  session: ConsoleSession,
  options?: Partial<PaginationQuery> & {
    search?: string;
    storeProfileId?: string;
  },
): Promise<ReviewAppGridPageData> {
  const pagination = {
    page: options?.page ?? 1,
    pageSize: options?.pageSize ?? 12,
    skip: options?.skip ?? 0,
    take: options?.take ?? 12,
  };
  const apps = (await getReviewAppCards()).filter((app) =>
    canAccessReviewApp(session, app),
  );
  const filteredApps = filterReviewAppCards(apps, {
    search: options?.search,
    storeProfileId: options?.storeProfileId,
  });
  const appPage = paginateReviewAppCards(filteredApps, pagination);
  const storeOptions = reviewStoreOptions(apps);

  return {
    appPagination: {
      page: appPage.page,
      pageSize: appPage.pageSize,
      total: appPage.total,
      totalPages: appPage.totalPages,
    },
    apps: appPage.data,
    filters: {
      search: options?.search ?? "",
      storeProfileId: options?.storeProfileId ?? "all",
    },
    storeNames: storeOptions.map((store) => store.name),
    storeOptions,
  };
}
