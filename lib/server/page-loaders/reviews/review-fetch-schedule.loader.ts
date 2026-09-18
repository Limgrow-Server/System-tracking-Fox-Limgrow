import "server-only";

import { canAccessScopedRecord, hasAllAppAccess } from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import type { PaginationQuery } from "@/lib/server/api/pagination";
import { getGlobalReviewFetchSchedule } from "@/lib/server/repositories/reviews/review.repository";
import {
  getPaginatedReviewAppCards,
  getReviewAppCardsPage,
} from "@/lib/server/services/reviews/review.service";
import { reviewFetchScheduleDto } from "@/lib/server/services/reviews/review-fetch-schedule.service";
import type {
  ReviewFetchScheduleApp,
  ReviewFetchScheduleDto,
  ReviewFetchSchedulePageData,
} from "@/lib/tracking/page-data";

function scheduleSummary(
  appCount: number,
  schedule: ReviewFetchScheduleDto | null,
) {
  const scheduledCount = schedule ? appCount : 0;
  const activeCount = schedule?.status === "active" ? appCount : 0;
  const pausedCount = schedule?.status === "paused" ? appCount : 0;
  const unscheduledCount = appCount - scheduledCount;
  const scheduleStatus = schedule?.status ?? "no_schedule";

  return {
    activeCount,
    appCount,
    nextRunAt: schedule?.nextRunAt ?? null,
    pausedCount,
    scheduleStatus,
    scheduledCount,
    unscheduledCount,
  };
}

export async function getReviewFetchSchedulePageData(
  session: ConsoleSession,
  options?: Partial<PaginationQuery> & {
    search?: string;
    storeProfileId?: string;
  },
): Promise<ReviewFetchSchedulePageData> {
  const pagination = {
    page: options?.page ?? 1,
    pageSize: options?.pageSize ?? 10,
    skip: options?.skip ?? 0,
    take: options?.take ?? 10,
  };
  const [page, schedule] = await Promise.all([
    hasAllAppAccess(session)
      ? getPaginatedReviewAppCards({
          ...pagination,
          search: options?.search,
          storeProfileId: options?.storeProfileId,
        })
      : getReviewAppCardsPage({
          ...pagination,
          canAccess: (app) => canAccessScopedRecord(session, app),
          search: options?.search,
          storeProfileId: options?.storeProfileId,
        }),
    getGlobalReviewFetchSchedule().then(reviewFetchScheduleDto),
  ]);
  return {
    appPagination: page.appPagination,
    apps: page.apps as ReviewFetchScheduleApp[],
    filters: {
      search: options?.search ?? "",
      storeProfileId: options?.storeProfileId ?? "all",
    },
    schedule,
    storeNames: page.storeOptions.map((store) => store.name),
    storeOptions: page.storeOptions,
    summary: scheduleSummary(page.appPagination.total, schedule),
  };
}
