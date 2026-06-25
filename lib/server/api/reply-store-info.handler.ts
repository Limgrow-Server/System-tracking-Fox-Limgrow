import "server-only";

import { canAccessReviewApp, canAccessScopedRecord } from "@/lib/auth/app-scope";
import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { forbidden } from "@/lib/server/api/errors";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  saveReplyStoreInfo,
  type SaveReplyStoreInfoPayload,
  getReviewAppCards,
} from "@/lib/server/services/reviews/android-review.service";

const reviewRoles = ["Admin", "Dev", "Marketing"] as const;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function handleReplyStoreInfoPut(request: Request) {
  try {
    const session = await requireConsoleApiSession([...reviewRoles]);
    const payload = await parseJsonBody<SaveReplyStoreInfoPayload>(request);
    const storeProfileId = clean(payload.storeProfileId);
    const hasDirectStoreScope = canAccessScopedRecord(session, { storeProfileId });
    const hasScopedAppInStore =
      session.role === "Admin" ||
      (await getReviewAppCards()).some(
        (app) =>
          app.storeProfileId === storeProfileId &&
          canAccessReviewApp(session, app),
      );
    if (session.role !== "Admin" && !hasDirectStoreScope && !hasScopedAppInStore) {
      throw forbidden("This reply store is outside your assigned app scope.");
    }

    return okJson(await saveReplyStoreInfo(payload));
  } catch (error) {
    return errorJson(error, "Save reply store info failed.");
  }
}
