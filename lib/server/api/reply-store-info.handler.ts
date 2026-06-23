import "server-only";

import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  saveReplyStoreInfo,
  type SaveReplyStoreInfoPayload,
} from "@/lib/server/services/reviews/android-review.service";

export async function handleReplyStoreInfoPut(request: Request) {
  try {
    await requireConsoleApiSession(["Admin", "Marketing"]);
    const payload = await parseJsonBody<SaveReplyStoreInfoPayload>(request);

    return okJson(await saveReplyStoreInfo(payload));
  } catch (error) {
    return errorJson(error, "Save reply store info failed.");
  }
}
