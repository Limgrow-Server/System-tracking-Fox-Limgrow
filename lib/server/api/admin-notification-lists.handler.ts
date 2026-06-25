import "server-only";

import { CACHE_TAGS, revalidateCacheTags } from "@/lib/server/cache-tags";
import { prisma } from "@/lib/prisma";
import { requireConsoleApiSession } from "@/lib/server/api/auth";
import { badRequest, notFound } from "@/lib/server/api/errors";
import { paginatedJson, paginationFromSearchParams } from "@/lib/server/api/pagination";
import { errorJson, okJson } from "@/lib/server/api/responses";
import {
  getNotificationHistoryDetailPageData,
  getNotificationHistoryPageData,
  getNotificationOverviewPageData,
  getNotificationSchedulesPageData,
  getNotificationTokenDetailPageData,
} from "@/lib/server/page-loaders/notifications/notifications.loader";

const notificationRoles = ["Admin", "Dev", "Marketing"] as const;
const notificationManageRoles = ["Admin"] as const;

function clean(value: string | null) {
  return value?.trim() ?? "";
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
    const appId = clean(url.searchParams.get("appId"));
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
    if (!id) throw badRequest("FCM token id is required.");

    const token = await prisma.deviceToken.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!token) throw notFound("FCM token not found.");

    await prisma.deviceToken.delete({ where: { id } });
    revalidateCacheTags([CACHE_TAGS.deviceTokens]);

    return okJson({
      deleted: id,
      message: "FCM token deleted.",
    });
  } catch (error) {
    return errorJson(error, "Delete notification token failed.");
  }
}

export async function handleAdminNotificationHistoryJobsGet(request: Request) {
  try {
    const session = await requireConsoleApiSession([...notificationRoles]);
    const url = new URL(request.url);
    const data = await getNotificationHistoryPageData(session, {
      ...pagination(url, 10),
      appId: clean(url.searchParams.get("appId")) || undefined,
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
        notificationEvents: data.notificationEvents,
        storeOptions: data.notificationStoreOptions,
      },
    );
  } catch (error) {
    return errorJson(error, "List notification history failed.");
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
      appId: clean(url.searchParams.get("appId")) || undefined,
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
        storeOptions: data.notificationStoreOptions,
      },
    );
  } catch (error) {
    return errorJson(error, "List notification schedules failed.");
  }
}
