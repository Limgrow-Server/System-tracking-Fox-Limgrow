import "server-only";

import { errorJson, okJson } from "@/lib/server/api/responses";
import { runNotificationBatchQueue } from "@/lib/server/services/notifications/notification-batch-queue.service";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function assertQueueCronSecret(request: Request) {
  const expected = clean(process.env.NOTIFICATION_DISPATCH_SECRET) || clean(process.env.NOTIFICATION_QUEUE_SECRET);
  if (!expected) return;

  const provided =
    clean(request.headers.get("x-dispatch-secret")) ||
    clean(request.headers.get("x-notification-queue-secret"));

  if (provided !== expected) {
    throw new Error("notification_queue_secret_required");
  }
}

function limitFromRequest(request: Request) {
  const url = new URL(request.url);
  const limit = Number(url.searchParams.get("limit"));
  return Number.isFinite(limit) ? limit : undefined;
}

export async function handleNotificationBatchCronGet(request: Request) {
  try {
    assertQueueCronSecret(request);

    return okJson({
      result: await runNotificationBatchQueue({ limit: limitFromRequest(request) }),
    });
  } catch (error) {
    return errorJson(error, "Queued notification worker failed.");
  }
}

export async function handleNotificationBatchCronPost(request: Request) {
  return handleNotificationBatchCronGet(request);
}
