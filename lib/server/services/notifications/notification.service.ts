import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { searchTextVariants } from "@/lib/search";
import { firstAppId } from "@/lib/tracking/identity";
import {
  deviceTokenToTracking,
  notificationEventToTracking,
  notificationJobToTracking,
  notificationScheduleToTracking,
} from "@/lib/tracking/mappers/notification";
import type { DeviceToken, StoreMapping } from "@/lib/tracking/types";

const deviceTokenSummarySelect = {
  appId: true,
  appIdentifier: true,
  appVersion: true,
  bundleId: true,
  createdAt: true,
  deviceId: true,
  deviceManufacturer: true,
  deviceModel: true,
  deviceType: true,
  firebaseAppId: true,
  firebaseProjectId: true,
  id: true,
  lastSeenAt: true,
  locale: true,
  osVersion: true,
  packageName: true,
  platform: true,
  productAppId: true,
  status: true,
  storeAccountName: true,
  storePlatform: true,
  updatedAt: true,
  userId: true,
} satisfies Prisma.DeviceTokenSelect;

type DeviceTokenSummaryRecord = Prisma.DeviceTokenGetPayload<{
  select: typeof deviceTokenSummarySelect;
}>;

type DeviceTokenPageOptions = {
  activeOnly?: boolean;
  page?: number;
  pageSize?: number;
  search?: string;
  skip?: number;
  take?: number;
};

type NotificationRecordPageOptions = {
  apps?: StoreMapping[];
  page?: number;
  pageSize?: number;
  search?: string;
  skip?: number;
  store?: string;
  take?: number;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: unknown[]) {
  return Array.from(
    new Set(values.map(clean).filter(Boolean)),
  );
}

function uniqueSearchValues(values: unknown[]) {
  return unique(values.flatMap((value) => searchTextVariants(value)));
}

function deviceTokenSummaryToTracking(device: DeviceTokenSummaryRecord): DeviceToken {
  return {
    id: device.id,
    user_id: device.userId,
    app_id: device.appId,
    device_id: device.deviceId,
    platform: device.platform,
    firebase_app_id: device.firebaseAppId,
    firebase_project_id: device.firebaseProjectId,
    app_identifier: device.appIdentifier,
    fcm_token: "",
    app_version: device.appVersion,
    os_version: device.osVersion,
    locale: device.locale,
    status: device.status,
    last_seen_at: device.lastSeenAt.toISOString(),
    store_platform: device.storePlatform,
    store_account_name: device.storeAccountName,
    product_app_id: device.productAppId,
    package_name: device.packageName,
    bundle_id: device.bundleId,
    device_type: device.deviceType,
    device_model: device.deviceModel,
    device_manufacturer: device.deviceManufacturer,
    created_at: device.createdAt.toISOString(),
    updated_at: device.updatedAt.toISOString(),
  };
}

function deviceTokenClausesForApp(app: StoreMapping): Prisma.DeviceTokenWhereInput[] {
  const appIds = uniqueSearchValues([app.app_id]);
  const packageNames = uniqueSearchValues([app.package_name]);
  const bundleIds = uniqueSearchValues([app.bundle_id]);
  const identifiers = app.platform === "android" ? packageNames : bundleIds;
  const hasStableIdentifier = Boolean(identifiers.length || packageNames.length || bundleIds.length);
  const clauses: Prisma.DeviceTokenWhereInput[] = [];

  if (identifiers.length) {
    clauses.push({ appIdentifier: { in: identifiers }, platform: app.platform });
  }
  if (packageNames.length) {
    clauses.push({ packageName: { in: packageNames }, platform: app.platform });
  }
  if (bundleIds.length) {
    clauses.push({ bundleId: { in: bundleIds }, platform: app.platform });
  }
  if (!hasStableIdentifier && appIds.length) {
    clauses.push(
      { appId: { in: appIds }, platform: app.platform },
      { platform: app.platform, productAppId: { in: appIds } },
    );
  }

  if (!clauses.length && app.store_account_name) {
    clauses.push({
      appId: null,
      appIdentifier: null,
      bundleId: null,
      packageName: null,
      platform: app.platform,
      productAppId: null,
      storeAccountName: app.store_account_name,
    });
  }

  return clauses;
}

type NotificationDeviceTargetInput = {
  appId?: unknown;
  bundleId?: unknown;
  packageName?: unknown;
  platform?: unknown;
  productAppId?: unknown;
  storeAccountName?: unknown;
};

function inferTargetPlatform(input: NotificationDeviceTargetInput) {
  const platform = clean(input.platform);
  if (platform === "android" || platform === "ios") return platform;
  return clean(input.bundleId) ? "ios" : "android";
}

export function deviceTokenWhereForNotificationTarget(
  input: NotificationDeviceTargetInput,
  options?: { activeOnly?: boolean },
): Prisma.DeviceTokenWhereInput {
  const platform = inferTargetPlatform(input);
  const appIds = uniqueSearchValues([firstAppId(input.appId, input.productAppId)]);
  const packageNames = uniqueSearchValues([input.packageName]);
  const bundleIds = uniqueSearchValues([input.bundleId]);
  const identifiers = platform === "android" ? packageNames : bundleIds;
  const hasStableIdentifier = Boolean(identifiers.length || packageNames.length || bundleIds.length);
  const clauses: Prisma.DeviceTokenWhereInput[] = [];

  if (identifiers.length) clauses.push({ appIdentifier: { in: identifiers } });
  if (packageNames.length) clauses.push({ packageName: { in: packageNames } });
  if (bundleIds.length) clauses.push({ bundleId: { in: bundleIds } });
  if (!hasStableIdentifier && appIds.length) clauses.push({ appId: { in: appIds } }, { productAppId: { in: appIds } });

  if (!clauses.length && clean(input.storeAccountName)) {
    clauses.push({
      appId: null,
      appIdentifier: null,
      bundleId: null,
      packageName: null,
      productAppId: null,
      storeAccountName: clean(input.storeAccountName),
    });
  }

  const and: Prisma.DeviceTokenWhereInput[] = [
    { platform },
    clauses.length ? { OR: clauses } : { id: { in: [] } },
  ];
  if (options?.activeOnly) and.push({ status: "active" });

  return { AND: and };
}

function deviceTokenWhereForApps(
  apps: StoreMapping[],
  options?: { activeOnly?: boolean; search?: string },
): Prisma.DeviceTokenWhereInput {
  const appClauses = apps.flatMap(deviceTokenClausesForApp);
  if (!appClauses.length) return { id: { in: [] } };

  const and: Prisma.DeviceTokenWhereInput[] = [{ OR: appClauses }];
  if (options?.activeOnly) and.push({ status: "active" });

  const search = clean(options?.search);
  if (search) {
    and.push({
      OR: [
        { appId: { contains: search, mode: "insensitive" } },
        { appIdentifier: { contains: search, mode: "insensitive" } },
        { appVersion: { contains: search, mode: "insensitive" } },
        { bundleId: { contains: search, mode: "insensitive" } },
        { deviceId: { contains: search, mode: "insensitive" } },
        { deviceType: { contains: search, mode: "insensitive" } },
        { fcmToken: { contains: search, mode: "insensitive" } },
        { locale: { contains: search, mode: "insensitive" } },
        { osVersion: { contains: search, mode: "insensitive" } },
        { packageName: { contains: search, mode: "insensitive" } },
        { productAppId: { contains: search, mode: "insensitive" } },
        { status: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  return { AND: and };
}

function pageWindow(options: { page?: number; pageSize?: number; skip?: number; take?: number }) {
  const pageSize = options.pageSize ?? options.take ?? 10;
  const page = options.page ?? 1;
  return {
    page,
    pageSize,
    skip: options.skip ?? (page - 1) * pageSize,
  };
}

function jobClausesForApp(app: StoreMapping): Prisma.NotificationJobWhereInput[] {
  const appIds = uniqueSearchValues([app.app_id]);
  const packageNames = uniqueSearchValues([app.package_name]);
  const bundleIds = uniqueSearchValues([app.bundle_id]);
  const clauses: Prisma.NotificationJobWhereInput[] = [
    { appMappingId: app.id, platform: app.platform },
  ];

  if (appIds.length) clauses.push({ appId: { in: appIds }, platform: app.platform });
  if (packageNames.length) clauses.push({ packageName: { in: packageNames }, platform: app.platform });
  if (bundleIds.length) clauses.push({ bundleId: { in: bundleIds }, platform: app.platform });
  if (app.app_name && app.store_account_name) {
    clauses.push({
      appName: app.app_name,
      platform: app.platform,
      storeAccountName: app.store_account_name,
    });
  }

  return clauses;
}

function scheduleClausesForApp(app: StoreMapping): Prisma.NotificationScheduleWhereInput[] {
  const appIds = uniqueSearchValues([app.app_id]);
  const packageNames = uniqueSearchValues([app.package_name]);
  const bundleIds = uniqueSearchValues([app.bundle_id]);
  const clauses: Prisma.NotificationScheduleWhereInput[] = [
    { appMappingId: app.id, platform: app.platform },
  ];

  if (appIds.length) clauses.push({ appId: { in: appIds }, platform: app.platform });
  if (packageNames.length) clauses.push({ packageName: { in: packageNames }, platform: app.platform });
  if (bundleIds.length) clauses.push({ bundleId: { in: bundleIds }, platform: app.platform });
  if (app.app_name && app.store_account_name) {
    clauses.push({
      appName: app.app_name,
      platform: app.platform,
      storeAccountName: app.store_account_name,
    });
  }

  return clauses;
}

function notificationJobWhere(options: NotificationRecordPageOptions = {}): Prisma.NotificationJobWhereInput {
  const and: Prisma.NotificationJobWhereInput[] = [];

  if (options.apps) {
    const clauses = options.apps.flatMap(jobClausesForApp);
    and.push(clauses.length ? { OR: clauses } : { id: { in: [] } });
  }

  const store = clean(options.store);
  if (store) and.push({ storeAccountName: store });

  const search = clean(options.search);
  if (search) {
    and.push({
      OR: [
        { appId: { contains: search, mode: "insensitive" } },
        { appName: { contains: search, mode: "insensitive" } },
        { bundleId: { contains: search, mode: "insensitive" } },
        { message: { contains: search, mode: "insensitive" } },
        { packageName: { contains: search, mode: "insensitive" } },
        { platform: { contains: search, mode: "insensitive" } },
        { status: { contains: search, mode: "insensitive" } },
        { storeAccountName: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
        { topicBase: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

function notificationScheduleWhere(options: NotificationRecordPageOptions = {}): Prisma.NotificationScheduleWhereInput {
  const and: Prisma.NotificationScheduleWhereInput[] = [];

  if (options.apps) {
    const clauses = options.apps.flatMap(scheduleClausesForApp);
    and.push(clauses.length ? { OR: clauses } : { id: { in: [] } });
  }

  const store = clean(options.store);
  if (store) and.push({ storeAccountName: store });

  const search = clean(options.search);
  if (search) {
    and.push({
      OR: [
        { appId: { contains: search, mode: "insensitive" } },
        { appName: { contains: search, mode: "insensitive" } },
        { bundleId: { contains: search, mode: "insensitive" } },
        { lastStatus: { contains: search, mode: "insensitive" } },
        { message: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
        { packageName: { contains: search, mode: "insensitive" } },
        { scheduleType: { contains: search, mode: "insensitive" } },
        { status: { contains: search, mode: "insensitive" } },
        { storeAccountName: { contains: search, mode: "insensitive" } },
        { title: { contains: search, mode: "insensitive" } },
      ],
    });
  }

  return and.length ? { AND: and } : {};
}

export async function getNotificationJobs(take = 50) {
  const jobs = await prisma.notificationJob.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });

  return jobs.map(notificationJobToTracking);
}

export async function getNotificationJobPage(options: NotificationRecordPageOptions = {}) {
  const page = pageWindow(options);
  const where = notificationJobWhere(options);
  const [total, jobs] = await prisma.$transaction([
    prisma.notificationJob.count({ where }),
    prisma.notificationJob.findMany({
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.pageSize,
      where,
    }),
  ]);

  return {
    data: jobs.map(notificationJobToTracking),
    total,
  };
}

export async function getNotificationJobsForApps(apps: StoreMapping[], take = 50) {
  if (!apps.length) return [];

  const jobs = await prisma.notificationJob.findMany({
    orderBy: { createdAt: "desc" },
    take,
    where: notificationJobWhere({ apps }),
  });

  return jobs.map(notificationJobToTracking);
}

export async function getNotificationJobById(id: string) {
  const job = await prisma.notificationJob.findUnique({
    where: { id },
  });

  return job ? notificationJobToTracking(job) : null;
}

export async function getNotificationSchedules(take = 50) {
  const schedules = await prisma.notificationSchedule.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });

  return schedules.map(notificationScheduleToTracking);
}

export async function getNotificationSchedulePage(options: NotificationRecordPageOptions = {}) {
  const page = pageWindow(options);
  const where = notificationScheduleWhere(options);
  const [total, schedules] = await prisma.$transaction([
    prisma.notificationSchedule.count({ where }),
    prisma.notificationSchedule.findMany({
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.pageSize,
      where,
    }),
  ]);

  return {
    data: schedules.map(notificationScheduleToTracking),
    total,
  };
}

export async function getNotificationSchedulesForApps(apps: StoreMapping[], take = 50) {
  if (!apps.length) return [];

  const schedules = await prisma.notificationSchedule.findMany({
    orderBy: { createdAt: "desc" },
    take,
    where: notificationScheduleWhere({ apps }),
  });

  return schedules.map(notificationScheduleToTracking);
}

export async function getNotificationEvents(take = 80) {
  const events = await prisma.notificationEvent.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });

  return events.map(notificationEventToTracking);
}

export async function getNotificationEventPageForJob(
  jobId: string,
  options: { page?: number; pageSize?: number; skip?: number; take?: number } = {},
) {
  const page = pageWindow(options);
  const where = { jobId };
  const [total, events] = await prisma.$transaction([
    prisma.notificationEvent.count({ where }),
    prisma.notificationEvent.findMany({
      orderBy: { createdAt: "desc" },
      skip: page.skip,
      take: page.pageSize,
      where,
    }),
  ]);

  return {
    data: events.map(notificationEventToTracking),
    total,
  };
}

export async function getNotificationEventsForJob(jobId: string, take = 2000) {
  const events = await prisma.notificationEvent.findMany({
    orderBy: { createdAt: "desc" },
    take,
    where: { jobId },
  });

  return events.map(notificationEventToTracking);
}

export async function getNotificationEventsForJobs(jobIds: string[], take = 2000) {
  if (!jobIds.length) return [];

  const events = await prisma.notificationEvent.findMany({
    orderBy: { createdAt: "desc" },
    take,
    where: { jobId: { in: jobIds } },
  });

  return events.map(notificationEventToTracking);
}

export async function getDeviceTokens(take = 120) {
  const devices = await prisma.deviceToken.findMany({
    orderBy: { lastSeenAt: "desc" },
    take,
  });

  return devices.map(deviceTokenToTracking);
}

export async function getDeviceTokenSummariesForDeviceIds(
  deviceIds: string[],
  take = 200,
) {
  const ids = unique(deviceIds);
  if (!ids.length) return [];

  const devices = await prisma.deviceToken.findMany({
    orderBy: { lastSeenAt: "desc" },
    select: deviceTokenSummarySelect,
    take,
    where: { deviceId: { in: ids } },
  });

  return devices.map(deviceTokenSummaryToTracking);
}

export async function getDeviceTokenSummaries(
  take = 120,
  options?: { activeOnly?: boolean },
) {
  const devices = await prisma.deviceToken.findMany({
    orderBy: { lastSeenAt: "desc" },
    select: deviceTokenSummarySelect,
    take,
    where: options?.activeOnly ? { status: "active" } : undefined,
  });

  return devices.map(deviceTokenSummaryToTracking);
}

export async function getDeviceTokenSummariesForApps(
  apps: StoreMapping[],
  take = 120,
  options?: { activeOnly?: boolean },
) {
  if (!apps.length) return [];

  const devices = await prisma.deviceToken.findMany({
    orderBy: { lastSeenAt: "desc" },
    select: deviceTokenSummarySelect,
    take,
    where: deviceTokenWhereForApps(apps, options),
  });

  return devices.map(deviceTokenSummaryToTracking);
}

function textArraySql(values: string[]) {
  return values.length
    ? Prisma.sql`array[${Prisma.join(values)}]::text[]`
    : Prisma.sql`array[]::text[]`;
}

export async function getActiveDeviceTokenCountsForApps(apps: StoreMapping[]) {
  if (!apps.length) return {};

  const appRows = apps.map((app) => {
    const appIds = uniqueSearchValues([app.app_id]);
    const packageNames = uniqueSearchValues([app.package_name]);
    const bundleIds = uniqueSearchValues([app.bundle_id]);
    const identifiers = app.platform === "android" ? packageNames : bundleIds;
    const hasStableIdentifier = Boolean(packageNames.length || bundleIds.length || identifiers.length);
    const scopedAppIds = hasStableIdentifier ? [] : appIds;
    const hasIdentifier = Boolean(scopedAppIds.length || packageNames.length || bundleIds.length || identifiers.length);

    return Prisma.sql`(
      ${app.id}::text,
      ${app.platform}::text,
      ${textArraySql(scopedAppIds)},
      ${textArraySql(packageNames)},
      ${textArraySql(bundleIds)},
      ${textArraySql(identifiers)},
      ${clean(app.store_account_name)}::text,
      ${!hasIdentifier && Boolean(clean(app.store_account_name))}::boolean
    )`;
  });

  const rows = await prisma.$queryRaw<Array<{ count: number; mappingId: string }>>(Prisma.sql`
    with app_scope(
      mapping_id,
      platform,
      app_ids,
      package_names,
      bundle_ids,
      identifiers,
      store_account_name,
      store_fallback
    ) as (
      values ${Prisma.join(appRows)}
    )
    select
      app_scope.mapping_id as "mappingId",
      count(device_tokens.id)::int as "count"
    from app_scope
    left join public.device_tokens
      on device_tokens.platform = app_scope.platform
      and device_tokens.status = 'active'
      and (
        device_tokens.app_identifier = any(app_scope.identifiers)
        or device_tokens.package_name = any(app_scope.package_names)
        or device_tokens.bundle_id = any(app_scope.bundle_ids)
        or device_tokens.app_id = any(app_scope.app_ids)
        or device_tokens.product_app_id = any(app_scope.app_ids)
        or (
          app_scope.store_fallback
          and device_tokens.app_id is null
          and device_tokens.app_identifier is null
          and device_tokens.bundle_id is null
          and device_tokens.package_name is null
          and device_tokens.product_app_id is null
          and device_tokens.store_account_name = app_scope.store_account_name
        )
      )
    group by app_scope.mapping_id
  `);

  return Object.fromEntries(rows.map((row) => [row.mappingId, Number(row.count)])) as Record<string, number>;
}

export async function getActiveDeviceIdsForNotificationTarget(
  input: NotificationDeviceTargetInput,
  take: number,
) {
  const rows = await prisma.deviceToken.groupBy({
    by: ["deviceId"],
    orderBy: {
      _max: {
        lastSeenAt: "desc",
      },
    },
    take,
    where: deviceTokenWhereForNotificationTarget(input, { activeOnly: true }),
    _max: {
      lastSeenAt: true,
    },
  });

  return rows.map((row) => row.deviceId).filter(Boolean);
}

export async function getActiveDeviceTokenIdsForNotificationTarget(
  input: NotificationDeviceTargetInput,
  take: number,
) {
  const devices = await prisma.deviceToken.findMany({
    orderBy: { lastSeenAt: "desc" },
    select: { id: true },
    take,
    where: deviceTokenWhereForNotificationTarget(input, { activeOnly: true }),
  });

  return devices.map((device) => device.id).filter(Boolean);
}

export async function getDeviceTokenSummaryPageForApps(
  apps: StoreMapping[],
  options: DeviceTokenPageOptions = {},
) {
  if (!apps.length) {
    return { activeTotal: 0, data: [], total: 0 };
  }

  const pageSize = options.pageSize ?? options.take ?? 10;
  const page = options.page ?? 1;
  const skip = options.skip ?? (page - 1) * pageSize;
  const where = deviceTokenWhereForApps(apps, {
    activeOnly: options.activeOnly,
    search: options.search,
  });
  const activeWhere = deviceTokenWhereForApps(apps, {
    activeOnly: true,
    search: options.search,
  });
  const [total, activeTotal, devices] = await prisma.$transaction([
    prisma.deviceToken.count({ where }),
    prisma.deviceToken.count({ where: activeWhere }),
    prisma.deviceToken.findMany({
      orderBy: { lastSeenAt: "desc" },
      select: deviceTokenSummarySelect,
      skip,
      take: pageSize,
      where,
    }),
  ]);

  return {
    activeTotal,
    data: devices.map(deviceTokenSummaryToTracking),
    total,
  };
}

export async function getDeviceTokenPageForApps(
  apps: StoreMapping[],
  options: DeviceTokenPageOptions = {},
) {
  if (!apps.length) {
    return { activeTotal: 0, data: [], total: 0 };
  }

  const pageSize = options.pageSize ?? options.take ?? 10;
  const page = options.page ?? 1;
  const skip = options.skip ?? (page - 1) * pageSize;
  const where = deviceTokenWhereForApps(apps, {
    activeOnly: options.activeOnly,
    search: options.search,
  });
  const activeWhere = deviceTokenWhereForApps(apps, {
    activeOnly: true,
    search: options.search,
  });
  const [total, activeTotal, devices] = await prisma.$transaction([
    prisma.deviceToken.count({ where }),
    prisma.deviceToken.count({ where: activeWhere }),
    prisma.deviceToken.findMany({
      orderBy: { lastSeenAt: "desc" },
      skip,
      take: pageSize,
      where,
    }),
  ]);

  return {
    activeTotal,
    data: devices.map(deviceTokenToTracking),
    total,
  };
}
