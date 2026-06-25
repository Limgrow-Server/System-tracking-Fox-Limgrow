import "server-only";

import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import { verifyIosIapTransaction } from "@/lib/server/services/iap/ios-iap-verify.service";

export async function handleAdminIosIapVerifyPost(request: Request) {
  try {
    await requireConsoleApiSession(["Admin", "Marketing"]);
    return okJson(await verifyIosIapTransaction(await parseJsonBody(request)));
  } catch (error) {
    return errorJson(error, "iOS IAP verification failed.");
  }
}
