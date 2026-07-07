import "server-only";

import { canAccessScopedRecord, hasAllAppAccess } from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import {
  getPaginatedReviewAppCards,
  getReviewAppCardsPage,
} from "@/lib/server/services/reviews/review.service";
import type { PaginationQuery } from "@/lib/server/api/pagination";
import type { ReviewAppGridPageData } from "@/lib/tracking/page-data";

export async function getReviewAppGridPageData(
  session: ConsoleSession,
  options?: Partial<PaginationQuery> & {
    platform?: string;
    search?: string;
    storeProfileId?: string;
  },
): Promise<ReviewAppGridPageData> {
  const platform =
    options?.platform === "android" || options?.platform === "ios"
      ? options.platform
      : "all";
  const pagination = {
    page: options?.page ?? 1,
    pageSize: options?.pageSize ?? 12,
    skip: options?.skip ?? 0,
    take: options?.take ?? 12,
  };
  const page = hasAllAppAccess(session)
    ? await getPaginatedReviewAppCards({
        ...pagination,
        platform,
        search: options?.search,
        storeProfileId: options?.storeProfileId,
      })
    : await getReviewAppCardsPage({
        ...pagination,
        canAccess: (app) => canAccessScopedRecord(session, app),
        platform,
        search: options?.search,
        storeProfileId: options?.storeProfileId,
      });

  return {
    appPagination: page.appPagination,
    apps: page.apps,
    filters: {
      platform,
      search: options?.search ?? "",
      storeProfileId: options?.storeProfileId ?? "all",
    },
    storeNames: page.storeOptions.map((store) => store.name),
    storeOptions: page.storeOptions,
  };
}
