import "server-only";

import { canAccessReviewApp } from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import type { PaginationQuery } from "@/lib/server/api/pagination";
import { getGlobalAndroidReviewFetchSchedule } from "@/lib/server/repositories/reviews/android-review.repository";
import {
  filterReviewAppCards,
  getReviewAppCards,
  paginateReviewAppCards,
  reviewStoreOptions,
} from "@/lib/server/services/reviews/android-review.service";
import { reviewFetchScheduleDto } from "@/lib/server/services/reviews/android-review-schedule.service";
import type {
  ReviewFetchScheduleApp,
  ReviewFetchScheduleDto,
  ReviewFetchSchedulePageData,
} from "@/lib/tracking/page-data";

function scheduleSummary(
  apps: ReviewFetchScheduleApp[],
  schedule: ReviewFetchScheduleDto | null,
) {
  const scheduledCount = schedule ? apps.length : 0;
  const activeCount = schedule?.status === "active" ? apps.length : 0;
  const pausedCount = schedule?.status === "paused" ? apps.length : 0;
  const unscheduledCount = apps.length - scheduledCount;
  const scheduleStatus = schedule?.status ?? "no_schedule";

  return {
    activeCount,
    appCount: apps.length,
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
  const apps = (await getReviewAppCards()).filter((app) =>
    canAccessReviewApp(session, app),
  );
  const schedule = reviewFetchScheduleDto(
    await getGlobalAndroidReviewFetchSchedule(),
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
    apps: appPage.data as ReviewFetchScheduleApp[],
    filters: {
      search: options?.search ?? "",
      storeProfileId: options?.storeProfileId ?? "all",
    },
    schedule,
    storeNames: storeOptions.map((store) => store.name),
    storeOptions,
    summary: scheduleSummary(filteredApps, schedule),
  };
}
