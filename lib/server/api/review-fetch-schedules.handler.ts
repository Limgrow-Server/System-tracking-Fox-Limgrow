import "server-only";

import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  removeReviewFetchSchedule,
  saveReviewFetchSchedule,
  updateReviewFetchScheduleStatus,
  type SaveReviewFetchSchedulePayload,
  type UpdateReviewFetchScheduleStatusPayload,
} from "@/lib/server/services/reviews/android-review-schedule.service";

const reviewRoles = ["Admin", "Dev", "Marketing"] as const;

export async function handleReviewFetchSchedulesPost(request: Request) {
  try {
    const session = await requireConsoleApiSession([...reviewRoles]);
    const payload = await parseJsonBody<SaveReviewFetchSchedulePayload>(request);

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

    return okJson(await updateReviewFetchScheduleStatus(payload, session.email));
  } catch (error) {
    return errorJson(error, "Update review fetch schedule failed.");
  }
}

export async function handleReviewFetchSchedulesDelete(request: Request) {
  try {
    void request;
    await requireConsoleApiSession([...reviewRoles]);

    return okJson(await removeReviewFetchSchedule());
  } catch (error) {
    return errorJson(error, "Delete review fetch schedule failed.");
  }
}
