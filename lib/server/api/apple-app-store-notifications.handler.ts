import "server-only";

import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import { processAppStoreServerNotification } from "@/lib/server/services/iap/ios-app-store-notification.service";

export async function handleAppleAppStoreNotificationsPost(request: Request) {
  try {
    const payload = await parseJsonBody<Record<string, unknown>>(request);
    return okJson(await processAppStoreServerNotification(payload));
  } catch (error) {
    return errorJson(error, "Process App Store notification failed.");
  }
}
