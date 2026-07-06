import "server-only";

import { Prisma, type DeviceToken as DeviceTokenModel } from "@prisma/client";
import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/prisma";
import { searchTextVariants } from "@/lib/search";
import { CACHE_TAGS } from "@/lib/server/cache-tags";
import { firstAppId } from "@/lib/tracking/identity";
import {
  deviceTokenToTracking,
  notificationEventToTracking,
  notificationJobToTracking,
  notificationScheduleToTracking,
} from "@/lib/tracking/mappers/notification";
import type { NotificationCountStat } from "@/lib/tracking/page-data";
import type { DeviceToken, NotificationJob, StoreMapping } from "@/lib/tracking/types";

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

type NotificationJobBatchProgress = {
  batchDoneCount: number;
  batchProcessedTargetCount: number;
  batchTargetCount: number;
  batchTotalCount: number;
};

type NotificationStatsScopeApp = Pick<
  StoreMapping,
  | "app_id"
  | "app_name"
  | "bundle_id"
  | "id"
  | "package_name"
  | "platform"
  | "store_account_name"
>;

type DateLike = Date | string | null | undefined;

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

function dateLikeToIso(value: DateLike) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function deviceTokenSummaryToTracking(
  device: DeviceTokenSummaryRecord,
  lastSentAt: DateLike = null,
): DeviceToken {
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
    last_sent_at: dateLikeToIso(lastSentAt),
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

async function getLastSentAtForDeviceTokenIds(tokenIds: string[]) {
  const ids = unique(tokenIds);
  if (!ids.length) return new Map<string, Date | null>();

  const rows = await prisma.notificationEvent.groupBy({
    by: ["deviceTokenId"],
    where: {
      deviceTokenId: { in: ids },
      eventType: "fcm_sent",
      status: "sent",
    },
    _max: {
      createdAt: true,
    },
  });

  return new Map(
    rows.flatMap((row) =>
      row.deviceTokenId
        ? [[row.deviceTokenId, row._max.createdAt]]
        : [],
    ),
  );
}

async function mapDeviceTokenSummariesWithLastSent(
  devices: DeviceTokenSummaryRecord[],
) {
  const lastSentByTokenId = await getLastSentAtForDeviceTokenIds(
    devices.map((device) => device.id),
  );

  return devices.map((device) =>
    deviceTokenSummaryToTracking(device, lastSentByTokenId.get(device.id) ?? null),
  );
}

async function mapDeviceTokensWithLastSent(
  devices: DeviceTokenModel[],
) {
  const lastSentByTokenId = await getLastSentAtForDeviceTokenIds(
    devices.map((device) => device.id),
  );

  return devices.map((device) =>
    deviceTokenToTracking(device, lastSentByTokenId.get(device.id) ?? null),
  );
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

async function getNotificationJobBatchProgress(jobIds: string[]) {
  if (!jobIds.length) return new Map<string, NotificationJobBatchProgress>();

  const rows = await prisma.$queryRaw<Array<{
    batch_done_count: number;
    batch_processed_target_count: number;
    batch_target_count: number;
    batch_total_count: number;
    job_id: string;
  }>>(Prisma.sql`
    select
      job_id::text,
      count(*)::int as batch_total_count,
      count(*) filter (
        where status not in ('queued', 'retrying', 'processing')
      )::int as batch_done_count,
      coalesce(sum(cardinality(target_values)), 0)::int as batch_target_count,
      coalesce(sum(cardinality(target_values)) filter (
        where status not in ('queued', 'retrying', 'processing')
      ), 0)::int as batch_processed_target_count
    from notification_job_batches
    where job_id::text in (${Prisma.join(jobIds)})
    group by job_id
  `);

  return new Map(
    rows.map((row) => [
      row.job_id,
      {
        batchDoneCount: Number(row.batch_done_count),
        batchProcessedTargetCount: Number(row.batch_processed_target_count),
        batchTargetCount: Number(row.batch_target_count),
        batchTotalCount: Number(row.batch_total_count),
      },
    ]),
  );
}

async function hydrateNotificationJobBatchProgress(jobs: NotificationJob[]) {
  if (!jobs.length) return jobs;

  const progressByJobId = await getNotificationJobBatchProgress(
    jobs.map((job) => job.id),
  );

  return jobs.map((job) => {
    const progress = progressByJobId.get(job.id);
    if (!progress) return job;

    return {
      ...job,
      batch_done_count: progress.batchDoneCount,
      batch_processed_target_count: progress.batchProcessedTargetCount,
      batch_target_count: progress.batchTargetCount,
      batch_total_count: progress.batchTotalCount,
    };
  });
}

export async function getNotificationJobs(take = 50) {
  const jobs = await prisma.notificationJob.findMany({
    orderBy: { createdAt: "desc" },
    take,
  });

  return hydrateNotificationJobBatchProgress(jobs.map(notificationJobToTracking));
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
    data: await hydrateNotificationJobBatchProgress(jobs.map(notificationJobToTracking)),
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

  return hydrateNotificationJobBatchProgress(jobs.map(notificationJobToTracking));
}

export async function getNotificationJobById(id: string) {
  const job = await prisma.notificationJob.findUnique({
    where: { id },
  });

  if (!job) return null;

  const [hydratedJob] = await hydrateNotificationJobBatchProgress([
    notificationJobToTracking(job),
  ]);
  return hydratedJob ?? null;
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

  return mapDeviceTokensWithLastSent(devices);
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

  return mapDeviceTokenSummariesWithLastSent(devices);
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

  return mapDeviceTokenSummariesWithLastSent(devices);
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

  return mapDeviceTokenSummariesWithLastSent(devices);
}

function textArraySql(values: string[]) {
  return values.length
    ? Prisma.sql`array[${Prisma.join(values)}]::text[]`
    : Prisma.sql`array[]::text[]`;
}

function statsScopeApps(apps: StoreMapping[]): NotificationStatsScopeApp[] {
  return apps.map((app) => ({
    app_id: app.app_id,
    app_name: app.app_name,
    bundle_id: app.bundle_id,
    id: app.id,
    package_name: app.package_name,
    platform: app.platform,
    store_account_name: app.store_account_name,
  }));
}

function deviceTokenScopeRows(apps: NotificationStatsScopeApp[]) {
  return apps.map((app) => {
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
}

function emptyCountStats(apps: NotificationStatsScopeApp[]) {
  return Object.fromEntries(
    apps.map((app) => [
      app.id,
      {
        active: 0,
        lastSentAt: null,
        lastSeenAt: null,
        total: 0,
      } satisfies NotificationCountStat,
    ]),
  ) as Record<string, NotificationCountStat>;
}

async function getDeviceTokenStatsForScopeApps(apps: NotificationStatsScopeApp[]) {
  if (!apps.length) return {};

  const stats = emptyCountStats(apps);
  const appRows = deviceTokenScopeRows(apps);

  const rows = await prisma.$queryRaw<Array<{
    active: number;
    lastSeenAt: Date | string | null;
    mappingId: string;
    total: number;
  }>>(Prisma.sql`
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
      count(device_tokens.id)::int as "total",
      count(device_tokens.id) filter (where device_tokens.status = 'active')::int as "active",
      max(device_tokens.last_seen_at) as "lastSeenAt"
    from app_scope
    left join public.device_tokens
      on device_tokens.platform = app_scope.platform
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

  rows.forEach((row) => {
    stats[row.mappingId] = {
      active: Number(row.active),
      lastSentAt: null,
      lastSeenAt: row.lastSeenAt
        ? row.lastSeenAt instanceof Date
          ? row.lastSeenAt.toISOString()
          : new Date(row.lastSeenAt).toISOString()
        : null,
      total: Number(row.total),
    };
  });

  return stats;
}

async function getLastSentAtForScopeApps(apps: NotificationStatsScopeApp[]) {
  if (!apps.length) return new Map<string, string | null>();

  const appRows = scheduleScopeRows(apps);
  const rows = await prisma.$queryRaw<Array<{
    lastSentAt: Date | string | null;
    mappingId: string;
  }>>(Prisma.sql`
    with app_scope(
      mapping_id,
      platform,
      app_ids,
      package_names,
      bundle_ids,
      app_name,
      store_account_name
    ) as (
      values ${Prisma.join(appRows)}
    )
    select
      app_scope.mapping_id as "mappingId",
      max(notification_jobs.sent_at) as "lastSentAt"
    from app_scope
    left join public.notification_jobs
      on notification_jobs.platform = app_scope.platform
      and notification_jobs.sent_at is not null
      and (
        notification_jobs.app_mapping_id::text = app_scope.mapping_id
        or notification_jobs.app_id = any(app_scope.app_ids)
        or notification_jobs.package_name = any(app_scope.package_names)
        or notification_jobs.bundle_id = any(app_scope.bundle_ids)
        or (
          notification_jobs.app_name = app_scope.app_name
          and notification_jobs.store_account_name = app_scope.store_account_name
        )
      )
    group by app_scope.mapping_id
  `);

  return new Map(
    rows.map((row) => [
      row.mappingId,
      dateLikeToIso(row.lastSentAt),
    ]),
  );
}

const getCachedDeviceTokenStatsForScopeApps = unstable_cache(
  async (apps: NotificationStatsScopeApp[]) => {
    const [stats, lastSentByMappingId] = await Promise.all([
      getDeviceTokenStatsForScopeApps(apps),
      getLastSentAtForScopeApps(apps),
    ]);

    Object.entries(stats).forEach(([mappingId, stat]) => {
      stat.lastSentAt = lastSentByMappingId.get(mappingId) ?? null;
    });

    return stats;
  },
  ["notification-device-token-stats-v3"],
  {
    revalidate: 30,
    tags: [
      CACHE_TAGS.androidStoreMappings,
      CACHE_TAGS.deviceTokens,
      CACHE_TAGS.iosStoreMappings,
      CACHE_TAGS.notificationJobs,
    ],
  },
);

export async function getDeviceTokenStatsForApps(apps: StoreMapping[]) {
  return getCachedDeviceTokenStatsForScopeApps(statsScopeApps(apps));
}

export async function getActiveDeviceTokenCountsForApps(apps: StoreMapping[]) {
  const stats = await getDeviceTokenStatsForApps(apps);
  return Object.fromEntries(
    Object.entries(stats).map(([mappingId, stat]) => [mappingId, stat.active]),
  ) as Record<string, number>;
}

function scheduleScopeRows(apps: NotificationStatsScopeApp[]) {
  return apps.map((app) => {
    const appIds = uniqueSearchValues([app.app_id]);
    const packageNames = uniqueSearchValues([app.package_name]);
    const bundleIds = uniqueSearchValues([app.bundle_id]);

    return Prisma.sql`(
      ${app.id}::text,
      ${app.platform}::text,
      ${textArraySql(appIds)},
      ${textArraySql(packageNames)},
      ${textArraySql(bundleIds)},
      ${clean(app.app_name)}::text,
      ${clean(app.store_account_name)}::text
    )`;
  });
}

async function getNotificationScheduleStatsForScopeApps(
  apps: NotificationStatsScopeApp[],
) {
  if (!apps.length) return {};

  const stats = emptyCountStats(apps);
  const appRows = scheduleScopeRows(apps);

  const rows = await prisma.$queryRaw<Array<{
    active: number;
    mappingId: string;
    total: number;
  }>>(Prisma.sql`
    with app_scope(
      mapping_id,
      platform,
      app_ids,
      package_names,
      bundle_ids,
      app_name,
      store_account_name
    ) as (
      values ${Prisma.join(appRows)}
    )
    select
      app_scope.mapping_id as "mappingId",
      count(notification_schedules.id)::int as "total",
      count(notification_schedules.id) filter (where notification_schedules.status = 'active')::int as "active"
    from app_scope
    left join public.notification_schedules
      on notification_schedules.platform = app_scope.platform
      and (
        notification_schedules.app_mapping_id::text = app_scope.mapping_id
        or notification_schedules.app_id = any(app_scope.app_ids)
        or notification_schedules.package_name = any(app_scope.package_names)
        or notification_schedules.bundle_id = any(app_scope.bundle_ids)
        or (
          notification_schedules.app_name = app_scope.app_name
          and notification_schedules.store_account_name = app_scope.store_account_name
        )
      )
    group by app_scope.mapping_id
  `);

  rows.forEach((row) => {
    stats[row.mappingId] = {
      active: Number(row.active),
      lastSentAt: null,
      lastSeenAt: null,
      total: Number(row.total),
    };
  });

  return stats;
}

const getCachedNotificationScheduleStatsForScopeApps = unstable_cache(
  getNotificationScheduleStatsForScopeApps,
  ["notification-schedule-stats-v2"],
  {
    revalidate: 30,
    tags: [
      CACHE_TAGS.androidStoreMappings,
      CACHE_TAGS.iosStoreMappings,
      CACHE_TAGS.notificationSchedules,
    ],
  },
);

export async function getNotificationScheduleStatsForApps(apps: StoreMapping[]) {
  return getCachedNotificationScheduleStatsForScopeApps(statsScopeApps(apps));
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
    data: await mapDeviceTokenSummariesWithLastSent(devices),
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
    data: await mapDeviceTokensWithLastSent(devices),
    total,
  };
}
