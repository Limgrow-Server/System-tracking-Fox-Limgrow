import "server-only";

import { canAccessScopedRecord } from "@/lib/auth/app-scope";
import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { forbidden } from "@/lib/server/api/errors";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  fetchAndroidStoreReviews,
  type FetchAndroidReviewsPayload,
} from "@/lib/server/services/reviews/android-review-fetch.service";

const reviewRoles = ["Admin", "Dev", "Marketing"] as const;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function handleReviewFetchRunsPost(request: Request) {
  try {
    const session = await requireConsoleApiSession([...reviewRoles]);
    const payload = await parseJsonBody<FetchAndroidReviewsPayload>(request);
    if (
      session.role !== "Admin" &&
      !canAccessScopedRecord(session, { storeMappingId: clean(payload.storeMappingId) })
    ) {
      throw forbidden("This review app is outside your assigned app scope.");
    }

    return okJson({
      platform: "android",
      result: await fetchAndroidStoreReviews(payload),
    });
  } catch (error) {
    return errorJson(error, "Fetch Google Play reviews failed.");
  }
}
