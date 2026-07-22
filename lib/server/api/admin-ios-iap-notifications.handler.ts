import "server-only";

import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { badRequest } from "@/lib/server/api/errors";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import { retryFailedAppStoreServerNotification } from "@/lib/server/services/iap/ios-app-store-notification.service";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function handleAdminIosIapNotificationRetryPost(request: Request) {
  try {
    await requireConsoleApiSession(["Admin", "Marketing"]);
    const body = await parseJsonBody<Record<string, unknown>>(request);
    const eventId = clean(body.eventId);

    if (!eventId) throw badRequest("App Store notification event id is required.");

    return okJson(await retryFailedAppStoreServerNotification(eventId));
  } catch (error) {
    return errorJson(error, "Retry App Store notification failed.");
  }
}
