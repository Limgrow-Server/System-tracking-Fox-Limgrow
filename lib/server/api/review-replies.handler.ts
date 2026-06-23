import "server-only";

import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  sendAndroidReviewReply,
  type SendAndroidReviewReplyPayload,
} from "@/lib/server/services/reviews/android-review.service";

export async function handleReviewRepliesPost(request: Request) {
  try {
    await requireConsoleApiSession(["Admin", "Marketing"]);
    const payload = await parseJsonBody<SendAndroidReviewReplyPayload>(request);

    return okJson(await sendAndroidReviewReply(payload));
  } catch (error) {
    return errorJson(error, "Send review reply failed.");
  }
}
