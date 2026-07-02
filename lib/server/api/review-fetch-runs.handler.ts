import "server-only";

import { canAccessScopedRecord, hasAllAppAccess } from "@/lib/auth/app-scope";
import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { forbidden } from "@/lib/server/api/errors";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import { createBackgroundJob } from "@/lib/server/services/background-jobs/background-job.service";
import { getActiveAndroidReviewMappings } from "@/lib/server/repositories/reviews/android-review.repository";
import { getActiveIosReviewMappings } from "@/lib/server/repositories/reviews/ios-review.repository";
import {
  enqueueAndroidReviewFetchRuns,
  enqueueAndroidReviewFullScanRuns,
  type FetchAndroidReviewsPayload,
} from "@/lib/server/services/reviews/android-review-fetch.service";
import {
  enqueueIosReviewFetchRuns,
  enqueueIosReviewFullScanRuns,
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
    runIds: [],
    scanMode: "full",
    skipped: 0,
    skippedStoreMappingIds: [],
    status: "empty",
  };
}

type ReviewQueueResult = ReviewFullScanResult & {
  runIds?: string[];
};

function reviewBackgroundTitle(input: {
  appName?: string | null;
  platform?: string | null;
  scope?: string;
}) {
  if (input.scope === "all") return "Fetch comments · All apps";
  if (input.appName) return `Fetch comments · ${input.appName}`;
  return input.platform === "ios"
    ? "Fetch comments · iOS app"
    : "Fetch comments · Android app";
}

async function createReviewBackgroundJob(input: {
  appName?: string | null;
  createdBy: string;
  memberId: string;
  platform: "android" | "ios" | "mixed";
  result: ReviewQueueResult;
  scope?: string;
  storeAccountName?: string | null;
}) {
  const runIds = input.result.runIds ?? [];
  if (!runIds.length) return null;

  return createBackgroundJob({
    appName: input.appName ?? null,
    createdBy: input.createdBy,
    description: `${input.result.enqueued} comment fetch run(s) queued. ${input.result.skipped} already running or queued.`,
    memberId: input.memberId,
    metadata: {
      requested: input.result.requested,
      scanMode: input.result.scanMode,
      skipped: input.result.skipped,
    },
    platform: input.platform,
    progressTotal: runIds.length,
    sourceRunIds: runIds,
    status: "QUEUED",
    storeAccountName: input.storeAccountName ?? null,
    title: reviewBackgroundTitle(input),
    type: "REVIEW_FETCH",
  });
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
        const result = {
          android: androidResult,
          enqueued: androidResult.enqueued + iosResult.enqueued,
          ios: iosResult,
          requested: androidResult.requested + iosResult.requested,
          runIds: [
            ...(androidResult.runIds ?? []),
            ...(iosResult.runIds ?? []),
          ],
          scanMode: "full",
          skipped: androidResult.skipped + iosResult.skipped,
          skippedStoreMappingIds: [
            ...androidResult.skippedStoreMappingIds,
            ...iosResult.skippedStoreMappingIds,
          ],
          status:
            androidResult.status === "queued" || iosResult.status === "queued"
              ? "queued"
              : "empty",
        };
        const backgroundJob = await createReviewBackgroundJob({
          createdBy: session.email,
          memberId: session.memberId,
          platform: "mixed",
          result,
          scope: "all",
        });

        return okJson({
          platform: "mixed",
          result,
          backgroundJob,
        });
      }

      const storeMappingId = clean(payload.storeMappingId);
      if (
        session.role !== "Admin" &&
        !canAccessScopedRecord(session, { storeMappingId })
      ) {
        throw forbidden("This review app is outside your assigned app scope.");
      }
      const mappings =
        platform === "ios"
          ? await getActiveIosReviewMappings()
          : await getActiveAndroidReviewMappings();
      const mapping = mappings.find((item) => item.id === storeMappingId);
      const result =
        platform === "ios"
          ? await enqueueIosReviewFullScanRuns({
              storeMappingIds: [storeMappingId],
            })
          : await enqueueAndroidReviewFullScanRuns({
              storeMappingIds: [storeMappingId],
            });
      const backgroundJob = await createReviewBackgroundJob({
        appName: mapping?.appName,
        createdBy: session.email,
        memberId: session.memberId,
        platform,
        result,
        storeAccountName: mapping?.storeAccountName,
      });

      return okJson({
        platform,
        result,
        backgroundJob,
      });
    }

    if (
      session.role !== "Admin" &&
      !canAccessScopedRecord(session, { storeMappingId: clean(payload.storeMappingId) })
    ) {
      throw forbidden("This review app is outside your assigned app scope.");
    }
    const storeMappingId = clean(payload.storeMappingId);
    const mappings =
      platform === "ios"
        ? await getActiveIosReviewMappings()
        : await getActiveAndroidReviewMappings();
    const mapping = mappings.find((item) => item.id === storeMappingId);
    const result =
      platform === "ios"
        ? await enqueueIosReviewFetchRuns({
            maxResults:
              typeof payload.maxResults === "number"
                ? payload.maxResults
                : undefined,
            scanMode: clean(payload.scanMode) || "limited",
            storeMappingId,
          })
        : await enqueueAndroidReviewFetchRuns({
            fromDate: clean(payload.fromDate) || undefined,
            maxResults:
              typeof payload.maxResults === "number"
                ? payload.maxResults
                : undefined,
            scanMode: clean(payload.scanMode) || "limited",
            storeMappingId,
            toDate: clean(payload.toDate) || undefined,
          });
    const backgroundJob = await createReviewBackgroundJob({
      appName: mapping?.appName,
      createdBy: session.email,
      memberId: session.memberId,
      platform,
      result,
      storeAccountName: mapping?.storeAccountName,
    });

    return okJson({
      platform,
      result,
      backgroundJob,
    });
  } catch (error) {
    return errorJson(error, "Fetch store reviews failed.");
  }
}
