import "server-only";

import { CACHE_TAGS, revalidateCacheTags } from "@/lib/server/cache-tags";
import { notificationPrisma as prisma } from "@/lib/prisma";
import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { badRequest, notFound } from "@/lib/server/api/errors";
import { paginatedJson, paginationFromSearchParams } from "@/lib/server/api/pagination";
import { parseJsonBody } from "@/lib/server/api/request";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  pauseNotificationQueueJob,
  resumeNotificationQueueJob,
} from "@/lib/server/services/notifications/notification-batch-queue.service";
import { getNotificationJobById } from "@/lib/server/services/notifications/notification.service";
import {
  getNotificationHistoryDetailPageData,
  getNotificationHistoryPageData,
  getNotificationOverviewPageData,
  getNotificationSendDevicePageData,
  getNotificationSchedulesPageData,
  getNotificationTokenDetailPageData,
} from "@/lib/server/page-loaders/notifications/notifications.loader";
import { normalizeAppId } from "@/lib/tracking/identity";

const notificationRoles = ["Admin", "Dev", "Marketing"] as const;
const notificationManageRoles = ["Admin"] as const;

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => typeof item === "string" ? item.trim() : "")
        .filter(Boolean),
    ),
  );
}

function pagination(url: URL, defaultPageSize = 10) {
  return paginationFromSearchParams(url.searchParams, {
    defaultPageSize,
    maxPageSize: defaultPageSize,
  });
}

export async function handleAdminNotificationOverviewAppsGet(request: Request) {
  try {
    const session = await requireConsoleApiSession([...notificationRoles]);
    const url = new URL(request.url);
    const data = await getNotificationOverviewPageData(session, {
      ...pagination(url, 10),
      platform: clean(url.searchParams.get("platform")) || undefined,
      search: clean(url.searchParams.get("search")) || undefined,
      store: clean(url.searchParams.get("store")) || undefined,
    });
    const page = data.notificationPagination.overviewApps;

    return paginatedJson(
      {
        data: data.storeMappings,
        page: page?.page ?? 1,
        pageSize: page?.pageSize ?? 10,
        total: page?.total ?? data.storeMappings.length,
        totalPages: page?.totalPages ?? 1,
      },
      {
        deviceTokens: data.deviceTokens,
        notificationDeviceCounts: data.notificationDeviceCounts,
        notificationScheduleStats: data.notificationScheduleStats,
        notificationTokenStats: data.notificationTokenStats,
        notificationSchedules: data.notificationSchedules,
        storeOptions: data.notificationStoreOptions,
        summary: data.notificationSummary,
      },
    );
  } catch (error) {
    return errorJson(error, "List notification apps failed.");
  }
}

export async function handleAdminNotificationTokensGet(request: Request) {
  try {
    const session = await requireConsoleApiSession([...notificationRoles]);
    const url = new URL(request.url);
    const appId = normalizeAppId(url.searchParams.get("appId"));
    if (!appId) throw badRequest("Notification app id is required.");

    const data = await getNotificationTokenDetailPageData(session, appId, {
      ...pagination(url, 10),
      search: clean(url.searchParams.get("search")) || undefined,
    });
    const page = data.notificationPagination.tokens;

    return paginatedJson(
      {
        data: data.deviceTokens,
        page: page?.page ?? 1,
        pageSize: page?.pageSize ?? 10,
        total: page?.total ?? data.deviceTokens.length,
        totalPages: page?.totalPages ?? 1,
      },
      {
        notificationEvents: data.notificationEvents,
        notificationJobs: data.notificationJobs,
        notificationSchedules: data.notificationSchedules,
        summary: data.notificationSummary,
      },
    );
  } catch (error) {
    return errorJson(error, "List notification tokens failed.");
  }
}

export async function handleAdminNotificationTokensDelete(request: Request) {
  try {
    await requireConsoleApiSession([...notificationManageRoles]);
    const url = new URL(request.url);
    const id = clean(url.searchParams.get("id"));
    const body = await parseJsonBody<{ ids?: unknown }>(request);
    const ids = id ? [id] : stringArray(body.ids);
    if (!ids.length) throw badRequest("FCM token id is required.");
    if (ids.length > 200) throw badRequest("You can delete up to 200 FCM tokens at once.");

    const result = await prisma.deviceToken.deleteMany({
      where: {
        id: { in: ids },
      },
    });
    if (!result.count) throw notFound("FCM token not found.");

    revalidateCacheTags([CACHE_TAGS.deviceTokens]);

    return okJson({
      deleted: id || ids,
      deletedCount: result.count,
      message: result.count === 1 ? "FCM token deleted." : "FCM tokens deleted.",
    });
  } catch (error) {
    return errorJson(error, "Delete notification token failed.");
  }
}

export async function handleAdminNotificationSendDevicesGet(request: Request) {
  try {
    const session = await requireConsoleApiSession([...notificationManageRoles]);
    const url = new URL(request.url);
    const appId = normalizeAppId(url.searchParams.get("appId"));
    if (!appId) throw badRequest("Notification app id is required.");

    const data = await getNotificationSendDevicePageData(session, appId, {
      ...pagination(url, 100),
      search: clean(url.searchParams.get("search")) || undefined,
    });
    const page = data.notificationPagination.tokens;

    return paginatedJson(
      {
        data: data.deviceTokens,
        page: page?.page ?? 1,
        pageSize: page?.pageSize ?? 100,
        total: page?.total ?? data.deviceTokens.length,
        totalPages: page?.totalPages ?? 1,
      },
      {
        notificationDeviceCounts: data.notificationDeviceCounts,
        summary: data.notificationSummary,
      },
    );
  } catch (error) {
    return errorJson(error, "List notification send devices failed.");
  }
}

export async function handleAdminNotificationHistoryJobsGet(request: Request) {
  try {
    const session = await requireConsoleApiSession([...notificationRoles]);
    const url = new URL(request.url);
    const data = await getNotificationHistoryPageData(session, {
      ...pagination(url, 10),
      appId: normalizeAppId(url.searchParams.get("appId")) || undefined,
      search: clean(url.searchParams.get("search")) || undefined,
      store: clean(url.searchParams.get("store")) || undefined,
    });
    const page = data.notificationPagination.historyJobs;

    return paginatedJson(
      {
        data: data.notificationJobs,
        page: page?.page ?? 1,
        pageSize: page?.pageSize ?? 10,
        total: page?.total ?? data.notificationJobs.length,
        totalPages: page?.totalPages ?? 1,
      },
      {
        storeMappings: data.storeMappings,
        storeOptions: data.notificationStoreOptions,
      },
    );
  } catch (error) {
    return errorJson(error, "List notification history failed.");
  }
}

export async function handleAdminNotificationHistoryJobsPatch(request: Request) {
  try {
    await requireConsoleApiSession([...notificationManageRoles]);
    const payload = await parseJsonBody<Record<string, unknown>>(request);
    const id = clean(payload.id);
    const action = clean(payload.action);

    if (!id) throw badRequest("Notification job id is required.");
    if (action !== "pause" && action !== "resume") {
      throw badRequest("Notification job action must be pause or resume.");
    }

    const result = action === "pause"
      ? await pauseNotificationQueueJob(id)
      : await resumeNotificationQueueJob(id);
    const job = await getNotificationJobById(id);
    if (!job) throw notFound("Notification job was not found.");

    revalidateCacheTags([
      CACHE_TAGS.notificationJobs,
    ]);

    return okJson({
      job,
      result,
    });
  } catch (error) {
    return errorJson(error, "Update notification history job failed.");
  }
}

export async function handleAdminNotificationHistoryEventsGet(request: Request) {
  try {
    const session = await requireConsoleApiSession([...notificationRoles]);
    const url = new URL(request.url);
    const jobId = clean(url.searchParams.get("jobId"));
    if (!jobId) throw badRequest("Notification job id is required.");

    const data = await getNotificationHistoryDetailPageData(jobId, session, {
      ...pagination(url, 10),
    });
    const page = data.notificationPagination.deliveryEvents;

    return paginatedJson(
      {
        data: data.notificationDeliveryEvents,
        page: page?.page ?? 1,
        pageSize: page?.pageSize ?? 10,
        total: page?.total ?? data.notificationDeliveryEvents.length,
        totalPages: page?.totalPages ?? 1,
      },
      {
        notificationEvents: data.notificationEvents,
        notificationJobs: data.notificationJobs,
        deviceTokens: data.deviceTokens,
      },
    );
  } catch (error) {
    return errorJson(error, "List notification delivery events failed.");
  }
}

export async function handleAdminNotificationSchedulesGet(request: Request) {
  try {
    const session = await requireConsoleApiSession([...notificationRoles]);
    const url = new URL(request.url);
    const data = await getNotificationSchedulesPageData(session, {
      ...pagination(url, 10),
      appId: normalizeAppId(url.searchParams.get("appId")) || undefined,
      search: clean(url.searchParams.get("search")) || undefined,
      store: clean(url.searchParams.get("store")) || undefined,
    });
    const page = data.notificationPagination.schedules;

    return paginatedJson(
      {
        data: data.notificationSchedules,
        page: page?.page ?? 1,
        pageSize: page?.pageSize ?? 10,
        total: page?.total ?? data.notificationSchedules.length,
        totalPages: page?.totalPages ?? 1,
      },
      {
        storeMappings: data.storeMappings,
        storeOptions: data.notificationStoreOptions,
      },
    );
  } catch (error) {
    return errorJson(error, "List notification schedules failed.");
  }
}
