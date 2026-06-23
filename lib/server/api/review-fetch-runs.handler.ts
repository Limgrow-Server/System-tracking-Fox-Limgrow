import "server-only";

import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  fetchAndroidStoreReviews,
  type FetchAndroidReviewsPayload,
} from "@/lib/server/services/reviews/android-review-fetch.service";

export async function handleReviewFetchRunsPost(request: Request) {
  try {
    await requireConsoleApiSession(["Admin", "Marketing"]);
    const payload = await parseJsonBody<FetchAndroidReviewsPayload>(request);

    return okJson({
      platform: "android",
      result: await fetchAndroidStoreReviews(payload),
    });
  } catch (error) {
    return errorJson(error, "Fetch Google Play reviews failed.");
  }
}
