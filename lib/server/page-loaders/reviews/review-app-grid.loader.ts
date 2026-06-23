import "server-only";

import { getReviewAppCards } from "@/lib/server/services/reviews/android-review.service";
import type { ReviewAppGridPageData } from "@/lib/tracking/page-data";

export async function getReviewAppGridPageData(): Promise<ReviewAppGridPageData> {
  const apps = await getReviewAppCards();
  const storeNames = Array.from(
    new Set(apps.map((app) => app.storeAccountName)),
  ).sort();

  return {
    apps,
    storeNames,
  };
}
