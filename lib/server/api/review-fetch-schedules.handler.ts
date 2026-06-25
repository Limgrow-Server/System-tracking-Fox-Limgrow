import "server-only";

import { canAccessReviewApp, canAccessScopedRecord } from "@/lib/auth/app-scope";
import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { forbidden } from "@/lib/server/api/errors";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  removeReviewFetchSchedule,
  saveReviewFetchSchedule,
  updateReviewFetchScheduleStatus,
  type DeleteReviewFetchSchedulePayload,
  type SaveReviewFetchSchedulePayload,
  type UpdateReviewFetchScheduleStatusPayload,
} from "@/lib/server/services/reviews/android-review-schedule.service";
import { getReviewAppCards } from "@/lib/server/services/reviews/android-review.service";

const reviewRoles = ["Admin", "Dev", "Marketing"] as const;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function assertReviewPayloadAccess(
  session: Awaited<ReturnType<typeof requireConsoleApiSession>>,
  payload: { storeMappingId?: unknown; storeProfileId?: unknown },
) {
  if (session.role === "Admin") return;

  const storeMappingId = clean(payload.storeMappingId);
  const storeProfileId = clean(payload.storeProfileId);
  if (canAccessScopedRecord(session, { storeMappingId, storeProfileId })) return;

  if (storeProfileId) {
    const apps = await getReviewAppCards();
    if (
      apps.some(
        (app) =>
          app.storeProfileId === storeProfileId &&
          canAccessReviewApp(session, app),
      )
    ) {
      return;
    }
  }

  throw forbidden("This review app is outside your assigned app scope.");
}

export async function handleReviewFetchSchedulesPost(request: Request) {
  try {
    const session = await requireConsoleApiSession([...reviewRoles]);
    const payload = await parseJsonBody<SaveReviewFetchSchedulePayload>(request);
    await assertReviewPayloadAccess(session, payload);

    return okJson(await saveReviewFetchSchedule(payload, session.email));
  } catch (error) {
    return errorJson(error, "Save review fetch schedule failed.");
  }
}

export async function handleReviewFetchSchedulesPatch(request: Request) {
  try {
    const session = await requireConsoleApiSession([...reviewRoles]);
    const payload =
      await parseJsonBody<UpdateReviewFetchScheduleStatusPayload>(request);
    await assertReviewPayloadAccess(session, payload);

    return okJson(await updateReviewFetchScheduleStatus(payload, session.email));
  } catch (error) {
    return errorJson(error, "Update review fetch schedule failed.");
  }
}

export async function handleReviewFetchSchedulesDelete(request: Request) {
  try {
    const session = await requireConsoleApiSession([...reviewRoles]);
    const payload = await parseJsonBody<DeleteReviewFetchSchedulePayload>(request);
    await assertReviewPayloadAccess(session, payload);

    return okJson(await removeReviewFetchSchedule(payload));
  } catch (error) {
    return errorJson(error, "Delete review fetch schedule failed.");
  }
}
