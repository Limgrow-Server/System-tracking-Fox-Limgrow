import "server-only";

import {
  filterScopedRecordsForSession,
  filterStoreMappingsForSession,
  hasAllAppAccess,
  scopedCredentialSecrets,
  scopedNotificationEvents,
  scopedNotificationSchedules,
} from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import { paginatedResult, type PaginationQuery } from "@/lib/server/api/pagination";
import { getAndroidCredentialConfigs } from "@/lib/server/services/credentials/android-credential.service";
import { getIosCredentialConfigs } from "@/lib/server/services/credentials/ios-credential.service";
import {
  getActiveDeviceTokenCountsForApps,
  getDeviceTokenStatsForApps,
  getDeviceTokenPageForApps,
  getDeviceTokenSummariesForDeviceIds,
  getDeviceTokenSummaryPageForApps,
  getNotificationEventPageForJob,
  getNotificationEventsForJobs,
  getNotificationJobPage,
  getNotificationJobById,
  getNotificationJobsForApps,
  getNotificationSchedulePage,
  getNotificationScheduleStatsForApps,
  getNotificationSchedulesForApps,
} from "@/lib/server/services/notifications/notification.service";
import { getAndroidStoreMappingDtos } from "@/lib/server/services/store-mappings/android-store-mapping.service";
import { getIosStoreMappingDtos } from "@/lib/server/services/store-mappings/ios-store-mapping.service";
import { valuesMatchSearch as fuzzyValuesMatchSearch } from "@/lib/search";
import type {
  NotificationCountStat,
  NotificationOverviewSummary,
  NotificationsPageData,
  PaginationMeta,
} from "@/lib/tracking/page-data";
import { sortMappings } from "@/lib/tracking/mappers/shared";
import type {
  NotificationJob,
  NotificationSchedule,
  StoreMapping,
} from "@/lib/tracking/types";

const ALL_FILTER_VALUE = "__all__";
const DEFAULT_PAGE_SIZE = 10;
const DEFAULT_APP_PAGE_SIZE = 10;
const DEFAULT_TOKEN_PAGE_SIZE = 10;
const DEFAULT_HISTORY_EVENT_PAGE_SIZE = 10;
const DETAIL_RECORD_LIMIT = 200;
const STORE_MAPPING_SCAN_LIMIT = 5000;
const EVENT_SCAN_LIMIT = 2000;

type NotificationListOptions = Partial<PaginationQuery> & {
  appId?: string;
  platform?: string;
  search?: string;
  store?: string;
};

const emptySummary: NotificationOverviewSummary = {
  activeSchedules: 0,
  activeTokens: 0,
  appCount: 0,
  totalSchedules: 0,
  totalTokens: 0,
};

function paginationFromOptions(
  options: Partial<PaginationQuery> | undefined,
  pageSize = DEFAULT_PAGE_SIZE,
): PaginationQuery {
  const page = options?.page ?? 1;
  const resolvedPageSize = options?.pageSize ?? pageSize;

  return {
    page,
    pageSize: resolvedPageSize,
    skip: options?.skip ?? (page - 1) * resolvedPageSize,
    take: options?.take ?? resolvedPageSize,
  };
}

function metaFromResult<T>(result: ReturnType<typeof paginatedResult<T>>): PaginationMeta {
  return {
    page: result.page,
    pageSize: result.pageSize,
    total: result.total,
    totalPages: result.totalPages,
  };
}

function emptyNotificationsData(): NotificationsPageData {
  return {
    canManageNotifications: false,
    credentialSecrets: [],
    deviceTokens: [],
    notificationDeviceCounts: {},
    notificationScheduleStats: {},
    notificationTokenStats: {},
    notificationDeliveryEvents: [],
    notificationEvents: [],
    notificationJobs: [],
    notificationPagination: {},
    notificationSchedules: [],
    notificationStoreOptions: [],
    notificationSummary: emptySummary,
    storeMappings: [],
  };
}

function notificationData(data: Partial<NotificationsPageData>): NotificationsPageData {
  return {
    ...emptyNotificationsData(),
    ...data,
    notificationPagination: {
      ...emptyNotificationsData().notificationPagination,
      ...data.notificationPagination,
    },
    notificationSummary: data.notificationSummary ?? emptySummary,
  };
}

async function getNotificationStoreMappings(session?: ConsoleSession) {
  const [androidMappings, iosMappings] = await Promise.all([
    getAndroidStoreMappingDtos({ take: STORE_MAPPING_SCAN_LIMIT }),
    getIosStoreMappingDtos({ take: STORE_MAPPING_SCAN_LIMIT }),
  ]);

  const mappings = sortMappings([...androidMappings, ...iosMappings]);
  return session ? filterStoreMappingsForSession(session, mappings) : mappings;
}

async function getFirebaseCredentialSecrets() {
  const [androidCredentials, iosCredentials] = await Promise.all([
    getAndroidCredentialConfigs(),
    getIosCredentialConfigs(),
  ]);

  return [...androidCredentials.credentials, ...iosCredentials.credentials].filter(
    (credential) => credential.credential_purpose === "firebase_admin",
  );
}

function scopedNotificationsData(
  session: ConsoleSession,
  data: NotificationsPageData,
): NotificationsPageData {
  const notificationJobs = filterScopedRecordsForSession(
    session,
    data.notificationJobs,
    data.storeMappings,
  );
  const deviceTokens = filterScopedRecordsForSession(
    session,
    data.deviceTokens,
    data.storeMappings,
  );
  const notificationSchedules = scopedNotificationSchedules(
    session,
    data.notificationSchedules,
    data.storeMappings,
  );

  return {
    canManageNotifications: session.role === "Admin",
    credentialSecrets: scopedCredentialSecrets(
      session,
      data.credentialSecrets,
      data.storeMappings,
    ),
    deviceTokens,
    notificationDeviceCounts: data.notificationDeviceCounts,
    notificationDeliveryEvents: scopedNotificationEvents(
      data.notificationDeliveryEvents,
      notificationJobs,
      deviceTokens,
    ),
    notificationEvents: scopedNotificationEvents(
      data.notificationEvents,
      notificationJobs,
      deviceTokens,
    ),
    notificationJobs,
    notificationPagination: data.notificationPagination,
    notificationSchedules,
    notificationScheduleStats: data.notificationScheduleStats,
    notificationStoreOptions: notificationStoreOptions(data.storeMappings),
    notificationSummary: data.notificationSummary,
    notificationTokenStats: data.notificationTokenStats,
    storeMappings: data.storeMappings,
  };
}

function normalizeFilter(value: string | null | undefined) {
  const cleanValue = value?.trim() ?? "";
  return cleanValue && cleanValue !== ALL_FILTER_VALUE ? cleanValue : "";
}

function valuesMatchSearch(values: Array<string | null | undefined>, search?: string) {
  return fuzzyValuesMatchSearch(values, search);
}

function mappingIdentifier(app: StoreMapping) {
  return app.package_name ?? app.bundle_id ?? app.app_id ?? app.app_name;
}

function routeAppMatches(app: StoreMapping, appId: string | null | undefined) {
  if (!appId) return false;
  const normalized = appId.toLowerCase();

  return (
    app.id === appId ||
    app.app_id?.toLowerCase() === normalized ||
    app.package_name?.toLowerCase() === normalized ||
    app.bundle_id?.toLowerCase() === normalized ||
    valuesMatchSearch([app.id, app.app_id, app.package_name, app.bundle_id], appId)
  );
}

function appFilterForRoute(apps: StoreMapping[], appId: string | null | undefined) {
  if (!normalizeFilter(appId)) return null;
  return apps.find((app) => app.id === appId || routeAppMatches(app, appId)) ?? null;
}

function appsForRecordQuery(
  session: ConsoleSession,
  apps: StoreMapping[],
  appId: string | null | undefined,
) {
  const filterApp = appFilterForRoute(apps, appId);
  if (filterApp) return [filterApp];
  return hasAllAppAccess(session) ? undefined : apps;
}

function notificationStoreOptions(mappings: StoreMapping[]) {
  return Array.from(
    new Set(
      mappings.flatMap((app) =>
        app.store_account_name ? [app.store_account_name] : [],
      ),
    ),
  ).sort((first, second) => first.localeCompare(second));
}

function filterMappings(mappings: StoreMapping[], options?: NotificationListOptions) {
  const platform = normalizeFilter(options?.platform);
  const store = normalizeFilter(options?.store);

  return mappings.filter((mapping) => {
    if (platform && mapping.platform !== platform) return false;
    if (store && mapping.store_account_name !== store) return false;

    return valuesMatchSearch(
      [
        mapping.app_name,
        mapping.app_id,
        mapping.package_name,
        mapping.bundle_id,
        mapping.store_account_name,
        mapping.status,
        mappingIdentifier(mapping),
      ],
      options?.search,
    );
  });
}

function countStatTotals(stats: Record<string, NotificationCountStat>) {
  return Object.values(stats).reduce(
    (total, stat) => ({
      active: total.active + stat.active,
      total: total.total + stat.total,
    }),
    { active: 0, total: 0 },
  );
}

function notificationSummaryFromStats(
  apps: StoreMapping[],
  tokenStats: Record<string, NotificationCountStat>,
  scheduleStats: Record<string, NotificationCountStat>,
): NotificationOverviewSummary {
  const tokens = countStatTotals(tokenStats);
  const schedules = countStatTotals(scheduleStats);

  return {
    activeSchedules: schedules.active,
    activeTokens: tokens.active,
    appCount: apps.length,
    totalSchedules: schedules.total,
    totalTokens: tokens.total,
  };
}

export async function getNotificationOverviewPageData(
  session: ConsoleSession,
  options?: NotificationListOptions,
): Promise<NotificationsPageData> {
  const pagination = paginationFromOptions(options, DEFAULT_APP_PAGE_SIZE);
  const storeMappings = await getNotificationStoreMappings(session);
  const filteredMappings = filterMappings(storeMappings, options);
  const appPage = paginatedResult(
    filteredMappings.slice(pagination.skip, pagination.skip + pagination.take),
    filteredMappings.length,
    pagination,
  );
  const [tokenStats, scheduleStats] = await Promise.all([
    getDeviceTokenStatsForApps(filteredMappings),
    getNotificationScheduleStatsForApps(filteredMappings),
  ]);
  const notificationDeviceCounts = Object.fromEntries(
    Object.entries(tokenStats).map(([mappingId, stat]) => [mappingId, stat.active]),
  );
  const scoped = scopedNotificationsData(
    session,
    notificationData({
      notificationDeviceCounts,
      notificationScheduleStats: scheduleStats,
      notificationTokenStats: tokenStats,
      storeMappings,
    }),
  );

  return {
    ...scoped,
    notificationPagination: {
      ...scoped.notificationPagination,
      overviewApps: metaFromResult(appPage),
    },
    notificationSchedules: scoped.notificationSchedules,
    notificationStoreOptions: notificationStoreOptions(scoped.storeMappings),
    notificationSummary: notificationSummaryFromStats(
      filteredMappings,
      tokenStats,
      scheduleStats,
    ),
    storeMappings: appPage.data,
  };
}

export async function getNotificationTokenDetailPageData(
  session: ConsoleSession,
  appId?: string,
  options?: NotificationListOptions,
): Promise<NotificationsPageData> {
  const pagination = paginationFromOptions(options, DEFAULT_TOKEN_PAGE_SIZE);
  const storeMappings = await getNotificationStoreMappings(session);
  const selectedApp = storeMappings.find((app) =>
    routeAppMatches(app, appId),
  );
  let tokenResult: Awaited<ReturnType<typeof getDeviceTokenPageForApps>> = {
    activeTotal: 0,
    data: [],
    total: 0,
  };
  let notificationSchedules: NotificationSchedule[] = [];
  let selectedJobs: NotificationJob[] = [];

  if (selectedApp) {
    [tokenResult, notificationSchedules, selectedJobs] = await Promise.all([
      getDeviceTokenPageForApps([selectedApp], {
        page: pagination.page,
        pageSize: pagination.pageSize,
        search: options?.search,
      }),
      getNotificationSchedulesForApps([selectedApp], DETAIL_RECORD_LIMIT),
      getNotificationJobsForApps([selectedApp], DETAIL_RECORD_LIMIT),
    ]);
  }

  const notificationEvents = await getNotificationEventsForJobs(
    selectedJobs.map((job) => job.id),
    EVENT_SCAN_LIMIT,
  );
  const tokenPage = paginatedResult(
    tokenResult.data,
    tokenResult.total,
    pagination,
  );
  const scoped = scopedNotificationsData(
    session,
    notificationData({
      deviceTokens: tokenResult.data,
      notificationEvents,
      notificationJobs: selectedJobs,
      notificationSchedules,
      storeMappings,
    }),
  );

  return {
    ...scoped,
    notificationPagination: {
      ...scoped.notificationPagination,
      tokens: metaFromResult(tokenPage),
    },
    notificationSummary: {
      ...emptySummary,
      activeTokens: tokenResult.activeTotal,
      appCount: selectedApp ? 1 : 0,
      totalTokens: tokenResult.total,
    },
  };
}

export async function getNotificationSendPageData(
  session: ConsoleSession,
): Promise<NotificationsPageData> {
  const [storeMappings, credentialSecrets] = await Promise.all([
    getNotificationStoreMappings(session),
    getFirebaseCredentialSecrets(),
  ]);
  const [scheduleStats, deviceCounts] = await Promise.all([
    getNotificationScheduleStatsForApps(storeMappings),
    getActiveDeviceTokenCountsForApps(storeMappings),
  ]);

  return scopedNotificationsData(
    session,
    notificationData({
      credentialSecrets,
      notificationDeviceCounts: deviceCounts,
      notificationScheduleStats: scheduleStats,
      storeMappings,
    }),
  );
}

export async function getNotificationSendDevicePageData(
  session: ConsoleSession,
  appId: string,
  options?: NotificationListOptions,
): Promise<NotificationsPageData> {
  const pagination = paginationFromOptions(options, 100);
  const storeMappings = await getNotificationStoreMappings(session);
  const selectedApp = appFilterForRoute(storeMappings, appId);
  let tokenResult: Awaited<ReturnType<typeof getDeviceTokenSummaryPageForApps>> = {
    activeTotal: 0,
    data: [],
    total: 0,
  };

  if (selectedApp) {
    tokenResult = await getDeviceTokenSummaryPageForApps([selectedApp], {
      activeOnly: true,
      page: pagination.page,
      pageSize: pagination.pageSize,
      search: options?.search,
    });
  }

  const tokenPage = paginatedResult(
    tokenResult.data,
    tokenResult.total,
    pagination,
  );
  const scoped = scopedNotificationsData(
    session,
    notificationData({
      deviceTokens: tokenResult.data,
      notificationDeviceCounts: selectedApp ? { [selectedApp.id]: tokenResult.total } : {},
      storeMappings,
    }),
  );

  return {
    ...scoped,
    notificationPagination: {
      ...scoped.notificationPagination,
      tokens: metaFromResult(tokenPage),
    },
    notificationSummary: {
      ...emptySummary,
      activeTokens: tokenResult.activeTotal,
      appCount: selectedApp ? 1 : 0,
      totalTokens: tokenResult.total,
    },
    storeMappings: selectedApp ? [selectedApp] : [],
  };
}

export async function getNotificationSchedulesPageData(
  session: ConsoleSession,
  options?: NotificationListOptions,
): Promise<NotificationsPageData> {
  const pagination = paginationFromOptions(options, DEFAULT_PAGE_SIZE);
  const storeMappings = await getNotificationStoreMappings(session);
  const queryApps = appsForRecordQuery(session, storeMappings, options?.appId);
  const scheduleResult = await getNotificationSchedulePage({
    apps: queryApps,
    page: pagination.page,
    pageSize: pagination.pageSize,
    search: options?.search,
    store: options?.store,
  });
  const schedulePage = paginatedResult(
    scheduleResult.data,
    scheduleResult.total,
    pagination,
  );
  const scoped = scopedNotificationsData(
    session,
    notificationData({
      notificationSchedules: schedulePage.data,
      storeMappings,
    }),
  );

  return {
    ...scoped,
    notificationPagination: {
      ...scoped.notificationPagination,
      schedules: metaFromResult(schedulePage),
    },
    notificationSchedules: schedulePage.data,
    notificationStoreOptions: notificationStoreOptions(scoped.storeMappings),
  };
}

export async function getNotificationHistoryPageData(
  session: ConsoleSession,
  options?: NotificationListOptions,
): Promise<NotificationsPageData> {
  const pagination = paginationFromOptions(options, DEFAULT_PAGE_SIZE);
  const storeMappings = await getNotificationStoreMappings(session);
  const queryApps = appsForRecordQuery(session, storeMappings, options?.appId);
  const jobResult = await getNotificationJobPage({
    apps: queryApps,
    page: pagination.page,
    pageSize: pagination.pageSize,
    search: options?.search,
    store: options?.store,
  });
  const jobPage = paginatedResult(
    jobResult.data,
    jobResult.total,
    pagination,
  );
  const scoped = scopedNotificationsData(
    session,
    notificationData({
      notificationJobs: jobPage.data,
      storeMappings,
    }),
  );

  return {
    ...scoped,
    notificationPagination: {
      ...scoped.notificationPagination,
      historyJobs: metaFromResult(jobPage),
    },
    notificationStoreOptions: notificationStoreOptions(scoped.storeMappings),
  };
}

export async function getNotificationHistoryDetailPageData(
  jobId: string,
  session: ConsoleSession,
  options?: Partial<PaginationQuery>,
): Promise<NotificationsPageData> {
  const pagination = paginationFromOptions(
    options,
    DEFAULT_HISTORY_EVENT_PAGE_SIZE,
  );
  const [storeMappings, detailJob] = await Promise.all([
    getNotificationStoreMappings(session),
    getNotificationJobById(jobId),
  ]);
  const scoped = scopedNotificationsData(
    session,
    notificationData({
      notificationJobs: detailJob ? [detailJob] : [],
      storeMappings,
    }),
  );
  const historyDetailJob =
    scoped.notificationJobs.find((job) => job.id === jobId) ?? null;
  const eventResult = historyDetailJob
    ? await getNotificationEventPageForJob(jobId, {
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
    : { data: [], total: 0 };
  const deliveryPage = paginatedResult(eventResult.data, eventResult.total, pagination);
  const deviceTokens = await getDeviceTokenSummariesForDeviceIds(
    deliveryPage.data
      .flatMap((event) => [event.device_id, event.target_value])
      .filter((value): value is string => Boolean(value)),
    Math.max(deliveryPage.data.length * 2, DEFAULT_HISTORY_EVENT_PAGE_SIZE),
  );

  return scopedNotificationsData(
    session,
    notificationData({
      deviceTokens,
      notificationDeliveryEvents: deliveryPage.data,
      notificationEvents: deliveryPage.data,
      notificationJobs: historyDetailJob ? [historyDetailJob] : [],
      notificationPagination: {
        deliveryEvents: metaFromResult(deliveryPage),
      },
      storeMappings,
    }),
  );
}

export async function getNotificationsPageData(
  session: ConsoleSession,
): Promise<NotificationsPageData> {
  return getNotificationOverviewPageData(session);
}
