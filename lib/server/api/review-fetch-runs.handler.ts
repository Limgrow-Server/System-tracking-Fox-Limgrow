import "server-only";

import { canAccessScopedRecord, hasAllAppAccess } from "@/lib/auth/app-scope";
import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { forbidden } from "@/lib/server/api/errors";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import { getActiveAndroidReviewMappings } from "@/lib/server/repositories/reviews/android-review.repository";
import { getActiveIosReviewMappings } from "@/lib/server/repositories/reviews/ios-review.repository";
import {
  enqueueAndroidReviewFullScanRuns,
  fetchAndroidStoreReviews,
  type FetchAndroidReviewsPayload,
} from "@/lib/server/services/reviews/android-review-fetch.service";
import {
  enqueueIosReviewFullScanRuns,
  fetchIosStoreReviews,
  type FetchIosReviewsPayload,
} from "@/lib/server/services/reviews/ios-review-fetch.service";

const reviewRoles = ["Admin", "Dev", "Marketing"] as const;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

type FetchReviewsPayload = FetchAndroidReviewsPayload &
  FetchIosReviewsPayload & {
    platform?: unknown;
  };

type ReviewFullScanResult = Awaited<
  ReturnType<typeof enqueueAndroidReviewFullScanRuns>
>;

function emptyFullScanResult(): ReviewFullScanResult {
  return {
    enqueued: 0,
    requested: 0,
    scanMode: "full",
    skipped: 0,
    skippedStoreMappingIds: [],
    status: "empty",
  };
}

function isFullScan(payload: FetchReviewsPayload) {
  return clean(payload.scanMode).toLowerCase() === "full";
}

function isAllAppsScope(payload: FetchReviewsPayload) {
  return clean(payload.scope).toLowerCase() === "all";
}

function reviewPlatform(payload: FetchReviewsPayload) {
  return clean(payload.platform).toLowerCase() === "ios" ? "ios" : "android";
}

export async function handleReviewFetchRunsPost(request: Request) {
  try {
    const session = await requireConsoleApiSession([...reviewRoles]);
    const payload = await parseJsonBody<FetchReviewsPayload>(request);
    const platform = reviewPlatform(payload);

    if (isFullScan(payload)) {
      if (isAllAppsScope(payload)) {
        const [androidMappings, iosMappings] = await Promise.all([
          getActiveAndroidReviewMappings(),
          getActiveIosReviewMappings(),
        ]);
        const scopedAndroidMappings = hasAllAppAccess(session)
          ? androidMappings
          : androidMappings.filter((mapping) =>
              canAccessScopedRecord(session, {
                appName: mapping.appName,
                mappingId: mapping.id,
                packageName: mapping.packageName,
                storeAccountName: mapping.storeAccountName,
                storeMappingId: mapping.id,
                storeProfileId: mapping.storeProfileId,
              }),
            );
        const scopedIosMappings = hasAllAppAccess(session)
          ? iosMappings
          : iosMappings.filter((mapping) =>
              canAccessScopedRecord(session, {
                appName: mapping.appName,
                bundleId: mapping.bundleId,
                mappingId: mapping.id,
                storeAccountName: mapping.storeAccountName,
                storeMappingId: mapping.id,
                storeProfileId: mapping.storeProfileId,
              }),
            );
        const [androidResult, iosResult] = await Promise.all([
          scopedAndroidMappings.length
            ? enqueueAndroidReviewFullScanRuns({
                storeMappingIds: scopedAndroidMappings.map((mapping) => mapping.id),
              })
            : Promise.resolve(emptyFullScanResult()),
          scopedIosMappings.length
            ? enqueueIosReviewFullScanRuns({
                storeMappingIds: scopedIosMappings.map((mapping) => mapping.id),
              })
            : Promise.resolve(emptyFullScanResult()),
        ]);

        return okJson({
          platform: "mixed",
          result: {
            android: androidResult,
            enqueued: androidResult.enqueued + iosResult.enqueued,
            ios: iosResult,
            requested: androidResult.requested + iosResult.requested,
            skipped: androidResult.skipped + iosResult.skipped,
            status:
              androidResult.status === "queued" || iosResult.status === "queued"
                ? "queued"
                : "empty",
          },
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
        platform,
        result:
          platform === "ios"
            ? await enqueueIosReviewFullScanRuns({
                storeMappingIds: [storeMappingId],
              })
            : await enqueueAndroidReviewFullScanRuns({
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
      platform,
      result:
        platform === "ios"
          ? await fetchIosStoreReviews(payload)
          : await fetchAndroidStoreReviews(payload),
    });
  } catch (error) {
    return errorJson(error, "Fetch store reviews failed.");
  }
}

