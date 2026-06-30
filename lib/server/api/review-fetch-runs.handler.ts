import "server-only";

import { canAccessScopedRecord, hasAllAppAccess } from "@/lib/auth/app-scope";
import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { forbidden } from "@/lib/server/api/errors";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import { getActiveAndroidReviewMappings } from "@/lib/server/repositories/reviews/android-review.repository";
import {
  enqueueAndroidReviewFullScanRuns,
  fetchAndroidStoreReviews,
  type FetchAndroidReviewsPayload,
} from "@/lib/server/services/reviews/android-review-fetch.service";

const reviewRoles = ["Admin", "Dev", "Marketing"] as const;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isFullScan(payload: FetchAndroidReviewsPayload) {
  return clean(payload.scanMode).toLowerCase() === "full";
}

function isAllAppsScope(payload: FetchAndroidReviewsPayload) {
  return clean(payload.scope).toLowerCase() === "all";
}

export async function handleReviewFetchRunsPost(request: Request) {
  try {
    const session = await requireConsoleApiSession([...reviewRoles]);
    const payload = await parseJsonBody<FetchAndroidReviewsPayload>(request);
    if (isFullScan(payload)) {
      if (isAllAppsScope(payload)) {
        const mappings = await getActiveAndroidReviewMappings();
        const scopedMappings = hasAllAppAccess(session)
          ? mappings
          : mappings.filter((mapping) =>
              canAccessScopedRecord(session, {
                appName: mapping.appName,
                mappingId: mapping.id,
                packageName: mapping.packageName,
                storeAccountName: mapping.storeAccountName,
                storeMappingId: mapping.id,
                storeProfileId: mapping.storeProfileId,
              }),
            );

        return okJson({
          platform: "android",
          result: await enqueueAndroidReviewFullScanRuns({
            storeMappingIds: scopedMappings.map((mapping) => mapping.id),
          }),
        });
      }

      const storeMappingId = clean(payload.storeMappingId);
      if (
        session.role !== "Admin" &&
        !canAccessScopedRecord(session, { storeMappingId })
      ) {
        throw forbidden("This review app is outside your assigned app scope.");
      }

      return okJson({
        platform: "android",
        result: await enqueueAndroidReviewFullScanRuns({
          storeMappingIds: [storeMappingId],
        }),
      });
    }

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
