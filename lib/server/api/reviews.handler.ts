import "server-only";

import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { badRequest, forbidden, notFound } from "@/lib/server/api/errors";
import { paginatedJson, paginationFromSearchParams } from "@/lib/server/api/pagination";
import { errorJson } from "@/lib/server/api/responses";
import { getReplyConfigPageDataLoader, getReplyStoreListPageDataLoader } from "@/lib/server/page-loaders/reviews/reply-config.loader";
import { getReviewAppDetailPageData } from "@/lib/server/page-loaders/reviews/review-app-detail.loader";
import { getReviewAppGridPageData } from "@/lib/server/page-loaders/reviews/review-app-grid.loader";
import { getReviewFetchSchedulePageData } from "@/lib/server/page-loaders/reviews/review-fetch-schedule.loader";

const reviewRoles = ["Admin", "Dev", "Marketing"] as const;

function clean(value: string | null) {
  return value?.trim() ?? "";
}

function reviewPagination(url: URL, defaultPageSize = 10) {
  return paginationFromSearchParams(url.searchParams, {
    defaultPageSize,
    maxPageSize: defaultPageSize,
  });
}

export async function handleReviewAppsGet(request: Request) {
  try {
    const session = await requireConsoleApiSession([...reviewRoles]);
    const url = new URL(request.url);
    const data = await getReviewAppGridPageData(session, {
      ...reviewPagination(url, 12),
      search: clean(url.searchParams.get("search")) || undefined,
      storeProfileId: clean(url.searchParams.get("storeProfileId")) || undefined,
    });

    return paginatedJson(
      {
        data: data.apps,
        ...data.appPagination,
      },
      {
        filters: data.filters,
        storeNames: data.storeNames,
        storeOptions: data.storeOptions,
      },
    );
  } catch (error) {
    return errorJson(error, "List comment apps failed.");
  }
}

export async function handleReviewCommentsGet(request: Request) {
  try {
    const session = await requireConsoleApiSession([...reviewRoles]);
    const url = new URL(request.url);
    const mappingId = clean(url.searchParams.get("mappingId"));
    if (!mappingId) throw badRequest("Comment app mapping id is required.");

    const data = await getReviewAppDetailPageData(mappingId, session, {
      includeMockData: ["1", "true"].includes(clean(url.searchParams.get("mock")).toLowerCase()),
      rating: clean(url.searchParams.get("rating")) || "all",
      reply: clean(url.searchParams.get("reply")) || "all",
      reviewPagination: reviewPagination(url, 10),
      search: clean(url.searchParams.get("search")) || undefined,
    });
    if (!data) throw forbidden("You do not have access to this comment app.");

    return paginatedJson(
      {
        data: data.reviews,
        ...data.reviewPagination,
      },
      {
        fetchRuns: data.fetchRuns,
        fetchSchedule: data.fetchSchedule,
        isMockData: data.isMockData,
        replyTemplates: data.replyTemplates,
        reviewFilters: data.reviewFilters,
        stats: data.stats,
        syncState: data.syncState,
      },
    );
  } catch (error) {
    return errorJson(error, "List comments failed.");
  }
}

export async function handleReviewScheduleAppsGet(request: Request) {
  try {
    const session = await requireConsoleApiSession([...reviewRoles]);
    const url = new URL(request.url);
    const data = await getReviewFetchSchedulePageData(session, {
      ...reviewPagination(url, 10),
      search: clean(url.searchParams.get("search")) || undefined,
      storeProfileId: clean(url.searchParams.get("storeProfileId")) || undefined,
    });

    return paginatedJson(
      {
        data: data.apps,
        ...data.appPagination,
      },
      {
        filters: data.filters,
        schedule: data.schedule,
        storeNames: data.storeNames,
        storeOptions: data.storeOptions,
        summary: data.summary,
      },
    );
  } catch (error) {
    return errorJson(error, "List comment schedules failed.");
  }
}

export async function handleReplyStoresGet(request: Request) {
  try {
    const session = await requireConsoleApiSession([...reviewRoles]);
    const url = new URL(request.url);
    const data = await getReplyStoreListPageDataLoader(session, {
      ...reviewPagination(url, 10),
      search: clean(url.searchParams.get("search")) || undefined,
    });

    return paginatedJson(
      {
        data: data.stores,
        ...data.storePagination,
      },
      {
        filters: data.filters,
      },
    );
  } catch (error) {
    return errorJson(error, "List reply stores failed.");
  }
}

export async function handleReplyStoreAppsGet(request: Request) {
  try {
    const session = await requireConsoleApiSession([...reviewRoles]);
    const url = new URL(request.url);
    const storeProfileId = clean(url.searchParams.get("storeProfileId"));
    if (!storeProfileId) throw badRequest("Reply store profile id is required.");

    const data = await getReplyConfigPageDataLoader(storeProfileId, session, {
      ...reviewPagination(url, 10),
      search: clean(url.searchParams.get("search")) || undefined,
    });
    if (!data) throw notFound("Reply store was not found.");

    return paginatedJson(
      {
        data: data.apps,
        ...data.appPagination,
      },
      {
        filters: data.filters,
        store: data.store,
        templatesByMappingId: data.templatesByMappingId,
      },
    );
  } catch (error) {
    return errorJson(error, "List reply store apps failed.");
  }
}
