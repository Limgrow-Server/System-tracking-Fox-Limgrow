import "server-only";

import { canAccessReviewApp } from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import type { PaginationQuery } from "@/lib/server/api/pagination";
import { getAndroidReviewFetchSchedules } from "@/lib/server/repositories/reviews/android-review.repository";
import {
  filterReviewAppCards,
  getReviewAppCards,
  paginateReviewAppCards,
  reviewStoreOptions,
} from "@/lib/server/services/reviews/android-review.service";
import { reviewFetchScheduleDto } from "@/lib/server/services/reviews/android-review-schedule.service";
import type { ReviewFetchScheduleApp, ReviewFetchSchedulePageData } from "@/lib/tracking/page-data";

function scheduleSummary(apps: ReviewFetchScheduleApp[]) {
  const scheduledCount = apps.filter((app) => app.fetchSchedule).length;
  const activeCount = apps.filter(
    (app) => app.fetchSchedule?.status === "active",
  ).length;
  const pausedCount = apps.filter(
    (app) => app.fetchSchedule?.status === "paused",
  ).length;
  const unscheduledCount = apps.length - scheduledCount;
  const scheduleStatus =
    scheduledCount === 0
      ? "no_schedule"
      : unscheduledCount > 0 || (activeCount > 0 && pausedCount > 0)
        ? "mixed"
        : activeCount > 0
          ? "active"
          : "paused";
  const nextRunAt =
    apps
      .map((app) => app.fetchSchedule?.nextRunAt)
      .filter(Boolean)
      .sort()[0] ?? null;

  return {
    activeCount,
    appCount: apps.length,
    nextRunAt,
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
  const schedules = await getAndroidReviewFetchSchedules(
    apps.map((app) => app.mappingId),
  );
  const scheduleByMappingId = new Map(
    schedules.map((schedule) => [schedule.storeMappingId, schedule]),
  );
  const appsWithSchedules = apps.map((app) => ({
    ...app,
    fetchSchedule: reviewFetchScheduleDto(
      scheduleByMappingId.get(app.mappingId) ?? null,
    ),
  }));
  const filteredApps = filterReviewAppCards(appsWithSchedules, {
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
    storeNames: storeOptions.map((store) => store.name),
    storeOptions,
    summary: scheduleSummary(filteredApps),
  };
}
