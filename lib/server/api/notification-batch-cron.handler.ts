import "server-only";

import { errorJson, okJson } from "@/lib/server/api/responses";
import { runNotificationBatchQueue } from "@/lib/server/services/notifications/notification-batch-queue.service";
import { dispatchDueNotificationsOnServer } from "@/lib/server/services/notifications/notification-dispatcher.service";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function assertQueueCronSecret(request: Request) {
  const expected = clean(process.env.NOTIFICATION_DISPATCH_SECRET) || clean(process.env.NOTIFICATION_QUEUE_SECRET);
  if (!expected) throw new Error("notification_queue_secret_not_configured");

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
    const dispatched = await dispatchDueNotificationsOnServer({
      actorEmail: clean(process.env.NOTIFICATION_SCHEDULER_ACTOR_EMAIL) || "notification-scheduler@system.local",
      limit: limitFromRequest(request),
    });

    return okJson({
      dispatched,
      result: await runNotificationBatchQueue({ limit: limitFromRequest(request) }),
    });
  } catch (error) {
    return errorJson(error, "Queued notification worker failed.");
  }
}

export async function handleNotificationBatchCronPost(request: Request) {
  return handleNotificationBatchCronGet(request);
}
