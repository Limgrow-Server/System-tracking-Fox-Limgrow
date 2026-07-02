import "server-only";

import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { errorJson, okJson } from "@/lib/server/api/responses";
import { listBackgroundJobsForSession } from "@/lib/server/services/background-jobs/background-job.service";
import { consoleRoles } from "@/lib/auth/rbac";

export async function handleBackgroundJobsGet() {
  try {
    const session = await requireConsoleApiSession([...consoleRoles]);
    return okJson(await listBackgroundJobsForSession(session));
  } catch (error) {
    return errorJson(error, "List background jobs failed.");
  }
}
