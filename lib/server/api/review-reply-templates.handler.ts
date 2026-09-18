import "server-only";

import { canAccessScopedRecord } from "@/lib/auth/app-scope";
import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { forbidden } from "@/lib/server/api/errors";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  saveReviewReplyTemplates,
  type SaveReviewReplyTemplatesPayload,
} from "@/lib/server/services/reviews/review.service";

const reviewRoles = ["Admin", "Dev", "Marketing"] as const;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function handleReviewReplyTemplatesPut(request: Request) {
  try {
    const session = await requireConsoleApiSession([...reviewRoles]);
    const payload =
      await parseJsonBody<SaveReviewReplyTemplatesPayload>(request);
    if (
      session.role !== "Admin" &&
      !canAccessScopedRecord(session, {
        storeMappingId: clean(payload.storeMappingId),
      })
    ) {
      throw forbidden("This review app is outside your assigned app scope.");
    }

    return okJson(await saveReviewReplyTemplates(payload, session.email));
  } catch (error) {
    return errorJson(error, "Save review reply templates failed.");
  }
}
