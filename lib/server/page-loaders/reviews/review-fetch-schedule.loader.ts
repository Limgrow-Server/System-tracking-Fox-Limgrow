import "server-only";

import { getAndroidReviewFetchSchedules } from "@/lib/server/repositories/reviews/android-review.repository";
import { getReviewAppCards } from "@/lib/server/services/reviews/android-review.service";
import { reviewFetchScheduleDto } from "@/lib/server/services/reviews/android-review-schedule.service";
import type { ReviewFetchSchedulePageData } from "@/lib/tracking/page-data";

export async function getReviewFetchSchedulePageData(): Promise<ReviewFetchSchedulePageData> {
  const apps = await getReviewAppCards();
  const schedules = await getAndroidReviewFetchSchedules(
    apps.map((app) => app.mappingId),
  );
  const scheduleByMappingId = new Map(
    schedules.map((schedule) => [schedule.storeMappingId, schedule]),
  );
  const storeNames = Array.from(
    new Set(apps.map((app) => app.storeAccountName)),
  ).sort();

  return {
    apps: apps.map((app) => ({
      ...app,
      fetchSchedule: reviewFetchScheduleDto(
        scheduleByMappingId.get(app.mappingId) ?? null,
      ),
    })),
    storeNames,
  };
}
