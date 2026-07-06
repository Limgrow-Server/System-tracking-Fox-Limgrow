import "server-only";

import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { badRequest, notFound } from "@/lib/server/api/errors";
import { errorJson, okJson } from "@/lib/server/api/responses";
import { prisma } from "@/lib/prisma";
import {
  listBackgroundJobsForSession,
} from "@/lib/server/services/background-jobs/background-job.service";
import {
  pauseNotificationQueueJob,
  resumeNotificationQueueJob,
} from "@/lib/server/services/notifications/notification-batch-queue.service";
import { consoleRoles } from "@/lib/auth/rbac";

export async function handleBackgroundJobsGet() {
  try {
    const session = await requireConsoleApiSession([...consoleRoles]);
    return okJson(await listBackgroundJobsForSession(session));
  } catch (error) {
    return errorJson(error, "List background jobs failed.");
  }
}

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function handleBackgroundJobsPatch(request: Request) {
  try {
    const session = await requireConsoleApiSession([...consoleRoles]);
    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      id?: unknown;
    };
    const action = clean(body.action);
    const id = clean(body.id);

    if (!id) throw badRequest("Background job id is required.");
    if (action !== "pause" && action !== "resume") {
      throw badRequest("Background job action must be pause or resume.");
    }

    const backgroundJob = await prisma.backgroundJob.findFirst({
      where: {
        id,
        memberId: session.memberId,
      },
      select: {
        id: true,
        sourceJobId: true,
        type: true,
      },
    });

    if (!backgroundJob) throw notFound("Background job was not found.");
    if (backgroundJob.type !== "NOTIFICATION_SEND" || !backgroundJob.sourceJobId) {
      throw badRequest("Only notification background jobs can be paused.");
    }

    const result = action === "pause"
      ? await pauseNotificationQueueJob(backgroundJob.sourceJobId)
      : await resumeNotificationQueueJob(backgroundJob.sourceJobId);

    return okJson({
      result,
      ...(await listBackgroundJobsForSession(session)),
    });
  } catch (error) {
    return errorJson(error, "Update background job failed.");
  }
}
