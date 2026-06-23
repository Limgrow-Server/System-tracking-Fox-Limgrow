import "server-only";

import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  saveReviewReplyTemplates,
  type SaveReviewReplyTemplatesPayload,
} from "@/lib/server/services/reviews/android-review.service";

export async function handleReviewReplyTemplatesPut(request: Request) {
  try {
    const session = await requireConsoleApiSession(["Admin", "Marketing"]);
    const payload = await parseJsonBody<SaveReviewReplyTemplatesPayload>(request);

    return okJson(await saveReviewReplyTemplates(payload, session.email));
  } catch (error) {
    return errorJson(error, "Save review reply templates failed.");
  }
}
