import "server-only";

import { canAccessReviewApp } from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import { getReviewAppCards } from "@/lib/server/services/reviews/android-review.service";
import type { ReviewAppGridPageData } from "@/lib/tracking/page-data";

export async function getReviewAppGridPageData(
  session: ConsoleSession,
): Promise<ReviewAppGridPageData> {
  const apps = (await getReviewAppCards()).filter((app) =>
    canAccessReviewApp(session, app),
  );
  const storeNames = Array.from(
    new Set(apps.map((app) => app.storeAccountName)),
  ).sort();

  return {
    apps,
    storeNames,
  };
}
