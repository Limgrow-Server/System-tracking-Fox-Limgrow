import "server-only";

import { errorJson, okJson } from "@/lib/server/api/responses";
import { runDueReviewFetchSchedules } from "@/lib/server/services/reviews/review-fetch-schedule.service";

export async function handleReviewFetchCronGet() {
  try {
    return okJson({
      result: await runDueReviewFetchSchedules(),
    });
  } catch (error) {
    return errorJson(error, "Scheduled store review fetch failed.");
  }
}

export async function handleReviewFetchCronPost() {
  try {
    return okJson({
      result: await runDueReviewFetchSchedules(),
    });
  } catch (error) {
    return errorJson(error, "Scheduled store review fetch failed.");
  }
}
