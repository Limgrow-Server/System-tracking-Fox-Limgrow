import "server-only";

import { forbidden } from "@/lib/server/api/errors";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  getMobileIngestQueueStats,
  runMobileIngestQueue,
} from "@/lib/server/services/mobile/mobile-ingest-queue.service";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function assertCronSecret(request: Request) {
  const expected =
    clean(process.env.MOBILE_INGEST_SECRET) ||
    clean(process.env.NOTIFICATION_QUEUE_SECRET);
  if (!expected) return;

  const provided =
    clean(request.headers.get("x-mobile-ingest-secret")) ||
    clean(request.headers.get("x-cron-secret")) ||
    clean(request.headers.get("x-notification-queue-secret"));

  if (provided !== expected) {
    throw forbidden("mobile_ingest_secret_required");
  }
}

function limitFromRequest(request: Request) {
  const url = new URL(request.url);
  const limit = Number.parseInt(clean(url.searchParams.get("limit")), 10);
  return Number.isFinite(limit) && limit >= 0 ? limit : undefined;
}

export async function handleMobileIngestCronGet(request: Request) {
  try {
    assertCronSecret(request);

    return okJson({
      result: await runMobileIngestQueue({
        limit: limitFromRequest(request),
      }),
      stats: await getMobileIngestQueueStats(),
    });
  } catch (error) {
    return errorJson(error, "Mobile ingest worker failed.");
  }
}

export async function handleMobileIngestCronPost(request: Request) {
  return handleMobileIngestCronGet(request);
}
