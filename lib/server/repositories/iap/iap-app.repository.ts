import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { searchTextVariants } from "@/lib/search";
import { convertCurrencyAmountToVnd } from "@/lib/server/currency-conversion";
import type {
  IapAppCard,
  IapAppMetrics,
  IapRevenueBucket,
  IapRevenueGranularity,
} from "@/lib/tracking/page-data";

const androidTransactionListSelect = {
  id: true,
  storeProfileId: true,
  packageName: true,
  productId: true,
  purchaseKind: true,
  purchaseToken: true,
  orderId: true,
  linkedPurchaseToken: true,
  state: true,
  acknowledged: true,
  consumed: true,
  autoRenewing: true,
  purchaseDate: true,
  expiresDate: true,
  revenueMicros: true,
  currency: true,
  regionCode: true,
  basePlanId: true,
  offerId: true,
  isTestPurchase: true,
  verifiedAt: true,
  createdAt: true,
  updatedAt: true,
  storeProfile: {
    select: { storeAccountName: true },
  },
} satisfies Prisma.IapAndroidSelect;

const iosTransactionSummarySelect = {
  id: true,
  transactionId: true,
  originalTransactionId: true,
  productId: true,
  userId: true,
  bundleId: true,
  purchaseDate: true,
  expiresDate: true,
  state: true,
  revenueMicros: true,
  priceMilliunits: true,
  currency: true,
  isTrial: true,
  transactionReason: true,
  offerDiscountType: true,
  offerPeriod: true,
  billingPlanType: true,
  storefront: true,
  revocationDate: true,
  environment: true,
  rawReceipt: true,
  verifiedAt: true,
  createdAt: true,
} satisfies Prisma.IosIapTransactionSelect;

const iosTrialAnalyticsTransactionSelect = {
  id: true,
  transactionId: true,
  originalTransactionId: true,
  isTrial: true,
  offerDiscountType: true,
  offerType: true,
  revenueMicros: true,
  priceMilliunits: true,
  purchaseDate: true,
  expiresDate: true,
  state: true,
  revocationDate: true,
  revocationType: true,
  verifiedAt: true,
  createdAt: true,
} satisfies Prisma.IosIapTransactionSelect;

const iosNotificationEventSummarySelect = {
  id: true,
  notificationUuid: true,
  notificationType: true,
  subtype: true,
  environment: true,
  bundleId: true,
  appAppleId: true,
  originalTransactionId: true,
  transactionId: true,
  signedDate: true,
  status: true,
  errorMessage: true,
  decodedPayload: true,
  receivedAt: true,
  processedAt: true,
} satisfies Prisma.IosIapNotificationEventSelect;

export type IosTrialAnalyticsTransaction =
  Prisma.IosIapTransactionGetPayload<{
    select: typeof iosTrialAnalyticsTransactionSelect;
  }>;

export type IosNotificationEventSummary =
  Prisma.IosIapNotificationEventGetPayload<{
    select: typeof iosNotificationEventSummarySelect;
  }>;

type IapAppMappingOptions = {
  platform?: string;
  search?: string;
  storeAccountName?: string;
};

type IapAppMappingPageOptions = IapAppMappingOptions & {
  skip: number;
  take: number;
};

type IapAppMappingRow = IapAppCard & {
  appId: string | null;
};

type CountRow = {
  total: number | bigint | null;
};

type StoreNameRow = {
  storeAccountName: string | null;
};

function activeStatusSql() {
  return Prisma.sql`'active'::mapping_status`;
}

function searchSql(search: string | undefined, columns: Prisma.Sql[]) {
  const variants = searchTextVariants(search?.trim() ?? "");
  if (!variants.length) return Prisma.empty;

  const conditions = variants.flatMap((variant) => {
    const pattern = `%${variant}%`;
    return columns.map((column) => Prisma.sql`${column} ILIKE ${pattern}`);
  });

  return Prisma.sql`AND (${Prisma.join(conditions, " OR ")})`;
}

function storeAccountSql(storeAccountName: string | undefined) {
  const normalized = storeAccountName?.trim();
  if (!normalized) return Prisma.empty;

  return Prisma.sql`
    AND lower(coalesce(profile."store_account_name", mapping."store_account_name")) = lower(${normalized})
  `;
}

function androidIapAppSelectSql(options?: IapAppMappingOptions) {
  return Prisma.sql`
    SELECT
      mapping."id"::text AS "mappingId",
      'android' AS "platform",
      mapping."app_id" AS "appId",
      mapping."app_name" AS "appName",
      mapping."package_name" AS "identifier",
      mapping."app_icon_url" AS "appIconUrl",
      mapping."app_link" AS "appLink",
      coalesce(profile."store_account_name", mapping."store_account_name") AS "storeAccountName",
      mapping."store_profile_id"::text AS "storeProfileId",
      NULL::numeric AS "revenueMicros",
      NULL::text AS "revenueCurrency",
      NULL::integer AS "transactionCount"
    FROM "android_store_mappings" mapping
    LEFT JOIN "android_store_profiles" profile
      ON profile."id" = mapping."store_profile_id"
    WHERE mapping."status" = ${activeStatusSql()}
      ${storeAccountSql(options?.storeAccountName)}
      ${searchSql(options?.search, [
        Prisma.sql`mapping."app_name"`,
        Prisma.sql`mapping."app_id"`,
        Prisma.sql`mapping."package_name"`,
        Prisma.sql`mapping."store_account_name"`,
        Prisma.sql`profile."store_account_name"`,
      ])}
  `;
}

function iosIapAppSelectSql(options?: IapAppMappingOptions) {
  return Prisma.sql`
    SELECT
      mapping."id"::text AS "mappingId",
      'ios' AS "platform",
      mapping."app_id" AS "appId",
      mapping."app_name" AS "appName",
      mapping."bundle_id" AS "identifier",
      mapping."app_icon_url" AS "appIconUrl",
      mapping."app_link" AS "appLink",
      coalesce(profile."store_account_name", mapping."store_account_name") AS "storeAccountName",
      mapping."store_profile_id"::text AS "storeProfileId",
      NULL::numeric AS "revenueMicros",
      NULL::text AS "revenueCurrency",
      NULL::integer AS "transactionCount"
    FROM "ios_store_mappings" mapping
    LEFT JOIN "ios_store_profiles" profile
      ON profile."id" = mapping."store_profile_id"
    WHERE mapping."status" = ${activeStatusSql()}
      ${storeAccountSql(options?.storeAccountName)}
      ${searchSql(options?.search, [
        Prisma.sql`mapping."app_name"`,
        Prisma.sql`mapping."app_id"`,
        Prisma.sql`mapping."apple_app_id"`,
        Prisma.sql`mapping."bundle_id"`,
        Prisma.sql`mapping."store_account_name"`,
        Prisma.sql`profile."store_account_name"`,
      ])}
  `;
}

function iapAppBaseSql(options?: IapAppMappingOptions) {
  if (options?.platform === "android") {
    return androidIapAppSelectSql(options);
  }

  if (options?.platform === "ios") {
    return iosIapAppSelectSql(options);
  }

  return Prisma.sql`
    ${androidIapAppSelectSql(options)}
    UNION ALL
    ${iosIapAppSelectSql(options)}
  `;
}

function androidMappingWhere(
  options?: IapAppMappingOptions,
): Prisma.AndroidStoreMappingWhereInput {
  const where: Prisma.AndroidStoreMappingWhereInput = { status: "ACTIVE" };
  const search = options?.search?.trim();
  const storeAccountName = options?.storeAccountName?.trim();

  if (storeAccountName) {
    where.OR = [
      { storeAccountName: { equals: storeAccountName, mode: "insensitive" } },
      {
        storeProfile: {
          storeAccountName: { equals: storeAccountName, mode: "insensitive" },
        },
      },
    ];
  }

  if (search) {
    const searchOr: Prisma.AndroidStoreMappingWhereInput[] = searchTextVariants(search).flatMap((variant) => {
      const contains = { contains: variant, mode: "insensitive" as const };

      return [
        { appName: contains },
        { appId: contains },
        { packageName: contains },
        { storeAccountName: contains },
        { storeProfile: { storeAccountName: contains } },
      ];
    });

    where.AND = [...(where.AND instanceof Array ? where.AND : []), { OR: searchOr }];
  }

  return where;
}

function iosMappingWhere(
  options?: IapAppMappingOptions,
): Prisma.IosStoreMappingWhereInput {
  const where: Prisma.IosStoreMappingWhereInput = { status: "ACTIVE" };
  const search = options?.search?.trim();
  const storeAccountName = options?.storeAccountName?.trim();

  if (storeAccountName) {
    where.OR = [
      { storeAccountName: { equals: storeAccountName, mode: "insensitive" } },
      {
        storeProfile: {
          storeAccountName: { equals: storeAccountName, mode: "insensitive" },
        },
      },
    ];
  }

  if (search) {
    const searchOr: Prisma.IosStoreMappingWhereInput[] = searchTextVariants(search).flatMap((variant) => {
      const contains = { contains: variant, mode: "insensitive" as const };

      return [
        { appName: contains },
        { appId: contains },
        { bundleId: contains },
        { storeAccountName: contains },
        { storeProfile: { storeAccountName: contains } },
      ];
    });

    where.AND = [...(where.AND instanceof Array ? where.AND : []), { OR: searchOr }];
  }

  return where;
}

export async function getAllActiveStoreMappings(options?: IapAppMappingOptions) {
  const [androidMappings, iosMappings] = await Promise.all([
    prisma.androidStoreMapping.findMany({
      where: androidMappingWhere(options),
      include: {
        storeProfile: {
          select: { storeAccountName: true },
        },
      },
      orderBy: { appName: "asc" },
    }),
    prisma.iosStoreMapping.findMany({
      where: iosMappingWhere(options),
      include: {
        storeProfile: {
          select: { storeAccountName: true },
        },
      },
      orderBy: { appName: "asc" },
    }),
  ]);

  return { androidMappings, iosMappings };
}

export async function getActiveIapAppMappingsPage(
  options: IapAppMappingPageOptions,
) {
  const baseSql = iapAppBaseSql(options);
  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<IapAppMappingRow[]>(Prisma.sql`
      SELECT *
      FROM (${baseSql}) apps
      ORDER BY "appName" ASC, "identifier" ASC, "mappingId" ASC
      LIMIT ${options.take}
      OFFSET ${options.skip}
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS total
      FROM (${baseSql}) apps
    `),
  ]);
  const total = Number(countRows[0]?.total ?? 0);

  return {
    apps: rows.map((row) => ({
      appIconUrl: row.appIconUrl,
      appLink: row.appLink,
      appName: row.appName,
      identifier: row.identifier,
      mappingId: row.mappingId,
      platform: row.platform,
      revenueCurrency: row.revenueCurrency,
      revenueMicros: row.revenueMicros,
      storeAccountName: row.storeAccountName,
      storeProfileId: row.storeProfileId,
      transactionCount: row.transactionCount,
    })),
    total,
  };
}

export async function getActiveIapStoreNames(options?: IapAppMappingOptions) {
  const baseSql = iapAppBaseSql({ platform: options?.platform });
  const rows = await prisma.$queryRaw<StoreNameRow[]>(Prisma.sql`
    SELECT DISTINCT "storeAccountName"
    FROM (${baseSql}) apps
    WHERE "storeAccountName" IS NOT NULL AND "storeAccountName" <> ''
    ORDER BY "storeAccountName" ASC
  `);

  return rows
    .map((row) => row.storeAccountName?.trim() ?? "")
    .filter(Boolean);
}

export async function getAndroidMappingById(id: string) {
  return prisma.androidStoreMapping.findUnique({
    where: { id },
    include: {
      storeProfile: {
        select: { storeAccountName: true },
      },
    },
  });
}

export async function getIosMappingById(id: string) {
  return prisma.iosStoreMapping.findUnique({
    where: { id },
    include: {
      storeProfile: {
        select: { storeAccountName: true },
      },
    },
  });
}

type AndroidTransactionPageOptions = {
  environment?: string;
  includeTotal?: boolean;
  kind?: string;
  page: number;
  pageSize: number;
  purchaseDateFrom?: string;
  purchaseDateTo?: string;
  revenueGranularity?: string;
  revenueSort?: string;
  skip: number;
  state?: string;
  take: number;
};

type IapMetricsRow = {
  activeCount: number | bigint | null;
  canceledCount: number | bigint | null;
  latestTimestamp: number | string | null;
  last7Orders: number | bigint | null;
  previous7Orders: number | bigint | null;
  totalCount: number | bigint | null;
};

type IapCurrencyRevenueRow = {
  currency: string | null;
  last7Revenue: number | string | null;
  previous7Revenue: number | string | null;
  totalRevenue: number | string | null;
};

type IapRevenueBucketRow = {
  currency: string | null;
  label: string | null;
  prod: number | string | null;
  sand: number | string | null;
};

function numberValue(value: number | string | bigint | null | undefined) {
  if (value === null || value === undefined) return 0;
  const numeric = typeof value === "bigint" ? Number(value) : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function inputDate(value: string | null | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.trim() ?? "");
  if (!match) return null;

  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function purchaseDateRange(
  fromValue: string | null | undefined,
  toValue: string | null | undefined,
) {
  const from = inputDate(fromValue);
  const to = inputDate(toValue);
  if (!from && !to) return null;

  const start = from ?? undefined;
  const end = to ? new Date(to) : undefined;
  end?.setDate(end.getDate() + 1);

  return { end, start };
}

function normalizeRevenueGranularity(
  value: string | null | undefined,
): IapRevenueGranularity {
  const normalized = value?.trim().toLowerCase();
  return normalized === "day" || normalized === "week" || normalized === "month"
    ? normalized
    : "month";
}

function revenueSortOrder(value: string | null | undefined): Prisma.SortOrder | null {
  const normalized = value?.trim().toLowerCase();
  return normalized === "asc" || normalized === "desc" ? normalized : null;
}

function revenueBucketSql(granularity: IapRevenueGranularity) {
  if (granularity === "day") {
    return {
      anchorSql: Prisma.sql`date_trunc('day', coalesce(max(purchase_date), now()))`,
      intervalSql: Prisma.sql`interval '13 days'`,
      joinSql: Prisma.sql`date_trunc('day', metric_source.purchase_date) = buckets.bucket_start`,
      labelSql: Prisma.sql`to_char(buckets.bucket_start, 'Mon DD')`,
      stepSql: Prisma.sql`interval '1 day'`,
    };
  }

  if (granularity === "week") {
    return {
      anchorSql: Prisma.sql`date_trunc('week', coalesce(max(purchase_date), now()))`,
      intervalSql: Prisma.sql`interval '11 weeks'`,
      joinSql: Prisma.sql`date_trunc('week', metric_source.purchase_date) = buckets.bucket_start`,
      labelSql: Prisma.sql`to_char(buckets.bucket_start, 'Mon DD') || ' - ' || to_char(buckets.bucket_start + interval '6 days', 'Mon DD')`,
      stepSql: Prisma.sql`interval '1 week'`,
    };
  }

  return {
    anchorSql: Prisma.sql`date_trunc('month', coalesce(max(purchase_date), now()))`,
    intervalSql: Prisma.sql`interval '11 months'`,
    joinSql: Prisma.sql`date_trunc('month', metric_source.purchase_date) = buckets.bucket_start`,
    labelSql: Prisma.sql`to_char(buckets.bucket_start, 'Mon')`,
    stepSql: Prisma.sql`interval '1 month'`,
  };
}

function joinSql(parts: Prisma.Sql[], separator: Prisma.Sql) {
  if (!parts.length) return Prisma.empty;
  return parts.slice(1).reduce(
    (sql, part) => Prisma.sql`${sql} ${separator} ${part}`,
    parts[0],
  );
}

async function iapMetricsFromRows(
  rows: IapMetricsRow[],
  revenueRows: IapCurrencyRevenueRow[],
  bucketRows: IapRevenueBucketRow[],
): Promise<IapAppMetrics> {
  const row = rows[0];
  const [totalRevenue, last7Revenue, previous7Revenue] = await Promise.all([
    convertRevenueRows(revenueRows, "totalRevenue"),
    convertRevenueRows(revenueRows, "last7Revenue"),
    convertRevenueRows(revenueRows, "previous7Revenue"),
  ]);
  const revenueBuckets = await convertBucketRows(bucketRows);

  return {
    activeCount: numberValue(row?.activeCount),
    canceledCount: numberValue(row?.canceledCount),
    latestTimestamp: numberValue(row?.latestTimestamp),
    last7Orders: numberValue(row?.last7Orders),
    last7Revenue,
    previous7Orders: numberValue(row?.previous7Orders),
    previous7Revenue,
    revenueBuckets,
    totalCount: numberValue(row?.totalCount),
    totalRevenue,
  };
}

async function convertRevenueRows(
  rows: IapCurrencyRevenueRow[],
  field: "last7Revenue" | "previous7Revenue" | "totalRevenue",
) {
  const convertedRows = await Promise.all(
    rows.map((row) =>
      convertCurrencyAmountToVnd(numberValue(row[field]), row.currency),
    ),
  );

  return convertedRows.reduce((total, amount) => total + amount, 0);
}

async function convertBucketRows(rows: IapRevenueBucketRow[]) {
  const convertedRows = await Promise.all(
    rows.map(async (bucket) => ({
      label: bucket.label ?? "",
      prod: await convertCurrencyAmountToVnd(
        numberValue(bucket.prod),
        bucket.currency,
      ),
      sand: await convertCurrencyAmountToVnd(
        numberValue(bucket.sand),
        bucket.currency,
      ),
    })),
  );
  const bucketsByLabel = new Map<string, IapRevenueBucket>();

  for (const bucket of convertedRows) {
    const existing = bucketsByLabel.get(bucket.label) ?? {
      label: bucket.label,
      prod: 0,
      sand: 0,
    };

    existing.prod += bucket.prod;
    existing.sand += bucket.sand;
    bucketsByLabel.set(bucket.label, existing);
  }

  return [...bucketsByLabel.values()];
}

async function getIapMetrics(
  sourceSql: Prisma.Sql,
  whereSql: Prisma.Sql,
  testExpression: Prisma.Sql,
  options?: {
    includeTest?: boolean;
    revenueGranularity?: string;
  },
) {
  const metricScopeSql = options?.includeTest
    ? Prisma.sql`true`
    : Prisma.sql`not is_test`;
  const bucketSql = revenueBucketSql(
    normalizeRevenueGranularity(options?.revenueGranularity),
  );

  const [metricsRows, revenueRows, bucketRows] = await Promise.all([
    prisma.$queryRaw<IapMetricsRow[]>(Prisma.sql`
      with filtered as (
        select
          state,
          purchase_date,
          revenue_micros,
          ${testExpression} as is_test
        from ${sourceSql}
        ${whereSql}
      ),
      metric_source as (
        select *
        from filtered
        where ${metricScopeSql}
      ),
      anchor as (
        select max(purchase_date) as latest from metric_source
      )
      select
        count(*)::int as "totalCount",
        count(*) filter (where lower(state) in ('active', 'purchased'))::int as "activeCount",
        count(*) filter (where lower(state) in ('canceled', 'expired', 'refunded', 'revoked'))::int as "canceledCount",
        coalesce(extract(epoch from (select latest from anchor)) * 1000, 0)::float8 as "latestTimestamp",
        count(*) filter (
          where coalesce(revenue_micros, 0) > 0
            and purchase_date >= (select latest from anchor) - interval '7 days'
        )::int as "last7Orders",
        count(*) filter (
          where coalesce(revenue_micros, 0) > 0
            and purchase_date >= (select latest from anchor) - interval '14 days'
            and purchase_date < (select latest from anchor) - interval '7 days'
        )::int as "previous7Orders"
      from metric_source
    `),
    prisma.$queryRaw<IapCurrencyRevenueRow[]>(Prisma.sql`
      with filtered as (
        select
          purchase_date,
          revenue_micros,
          currency,
          ${testExpression} as is_test
        from ${sourceSql}
        ${whereSql}
      ),
      metric_source as (
        select *
        from filtered
        where ${metricScopeSql}
      ),
      anchor as (
        select max(purchase_date) as latest from metric_source
      )
      select
        upper(coalesce(nullif(trim(currency), ''), 'VND')) as currency,
        coalesce(sum((revenue_micros::numeric / 1000000.0)) filter (
          where coalesce(revenue_micros, 0) > 0
        ), 0)::float8 as "totalRevenue",
        coalesce(sum((revenue_micros::numeric / 1000000.0)) filter (
          where coalesce(revenue_micros, 0) > 0
            and purchase_date >= (select latest from anchor) - interval '7 days'
        ), 0)::float8 as "last7Revenue",
        coalesce(sum((revenue_micros::numeric / 1000000.0)) filter (
          where coalesce(revenue_micros, 0) > 0
            and purchase_date >= (select latest from anchor) - interval '14 days'
            and purchase_date < (select latest from anchor) - interval '7 days'
        ), 0)::float8 as "previous7Revenue"
      from metric_source
      group by upper(coalesce(nullif(trim(currency), ''), 'VND'))
    `),
    prisma.$queryRaw<IapRevenueBucketRow[]>(Prisma.sql`
      with filtered as (
        select
          purchase_date,
          revenue_micros,
          currency,
          ${testExpression} as is_test
        from ${sourceSql}
        ${whereSql}
      ),
      metric_source as (
        select *
        from filtered
        where ${metricScopeSql}
      ),
      anchor as (
        select ${bucketSql.anchorSql} as chart_end
        from metric_source
      ),
      buckets as (
        select generate_series(
          (select chart_end from anchor) - ${bucketSql.intervalSql},
          (select chart_end from anchor),
          ${bucketSql.stepSql}
        ) as bucket_start
      )
      select
        ${bucketSql.labelSql} as label,
        upper(coalesce(nullif(trim(metric_source.currency), ''), 'VND')) as currency,
        coalesce(sum((metric_source.revenue_micros::numeric / 1000000.0)) filter (
          where not metric_source.is_test
            and coalesce(metric_source.revenue_micros, 0) > 0
        ), 0)::float8 as prod,
        coalesce(sum((metric_source.revenue_micros::numeric / 1000000.0)) filter (
          where metric_source.is_test
            and coalesce(metric_source.revenue_micros, 0) > 0
        ), 0)::float8 as sand
      from buckets
      left join metric_source
        on ${bucketSql.joinSql}
      group by buckets.bucket_start, upper(coalesce(nullif(trim(metric_source.currency), ''), 'VND'))
      order by buckets.bucket_start
    `),
  ]);

  return iapMetricsFromRows(metricsRows, revenueRows, bucketRows);
}

function androidTransactionWhere(
  packageName: string,
  storeProfileId: string,
  options?: Partial<AndroidTransactionPageOptions>,
): Prisma.IapAndroidWhereInput {
  const where: Prisma.IapAndroidWhereInput = {
    packageName,
    storeProfileId,
  };
  const environment = options?.environment?.trim();
  const state = options?.state?.trim();
  const kind = options?.kind?.trim();
  const purchaseDate = purchaseDateRange(
    options?.purchaseDateFrom,
    options?.purchaseDateTo,
  );

  if (environment === "production") {
    where.isTestPurchase = false;
  }

  if (environment === "test") {
    where.isTestPurchase = true;
  }

  if (state && state !== "all") {
    where.state = { equals: state, mode: "insensitive" };
  }

  if (kind && kind !== "all") {
    where.purchaseKind = { equals: kind, mode: "insensitive" };
  }

  if (purchaseDate) {
    where.purchaseDate = {};
    if (purchaseDate.start) where.purchaseDate.gte = purchaseDate.start;
    if (purchaseDate.end) where.purchaseDate.lt = purchaseDate.end;
  }

  return where;
}

export async function getAndroidTransactionsByPackageAndProfilePage(
  packageName: string,
  storeProfileId: string,
  options: AndroidTransactionPageOptions,
) {
  const where = androidTransactionWhere(packageName, storeProfileId, options);
  const rowsPromise = prisma.iapAndroid.findMany({
    where,
    orderBy: revenueSortOrder(options.revenueSort)
      ? [
          { revenueMicros: revenueSortOrder(options.revenueSort) ?? "desc" },
          { verifiedAt: "desc" },
        ]
      : { verifiedAt: "desc" },
    skip: options.skip,
    take: options.take,
    select: androidTransactionListSelect,
  });

  if (options.includeTotal === false) {
    return [await rowsPromise, null] as const;
  }

  const [rows, total] = await prisma.$transaction([
    rowsPromise,
    prisma.iapAndroid.count({ where }),
  ]);

  return [rows, total] as const;
}

export function getAndroidIapTransactionById(id: string) {
  return prisma.iapAndroid.findUnique({
    where: { id },
    include: {
      storeProfile: {
        select: { storeAccountName: true },
      },
    },
  });
}

export function getAndroidTransactionsByPackageAndProfileMetrics(
  packageName: string,
  storeProfileId: string,
  options: Partial<AndroidTransactionPageOptions>,
) {
  const conditions = [
    Prisma.sql`package_name = ${packageName}`,
    Prisma.sql`store_profile_id = ${storeProfileId}::uuid`,
  ];
  const environment = options.environment?.trim();
  const state = options.state?.trim();
  const kind = options.kind?.trim();

  if (environment === "production") {
    conditions.push(Prisma.sql`not is_test_purchase`);
  }
  if (environment === "test") {
    conditions.push(Prisma.sql`is_test_purchase`);
  }
  if (state && state !== "all") {
    conditions.push(Prisma.sql`lower(state) = ${state.toLowerCase()}`);
  }
  if (kind && kind !== "all") {
    conditions.push(Prisma.sql`lower(purchase_kind) = ${kind.toLowerCase()}`);
  }

  return getIapMetrics(
    Prisma.sql`public.iap_android`,
    Prisma.sql`where ${joinSql(conditions, Prisma.sql`and`)}`,
    Prisma.sql`is_test_purchase`,
    {
      includeTest: environment !== "production",
      revenueGranularity: options.revenueGranularity,
    },
  );
}

export async function getAndroidTransactionStatesByPackageAndProfile(
  packageName: string,
  storeProfileId: string,
  options?: Partial<AndroidTransactionPageOptions>,
) {
  const rows = await prisma.iapAndroid.groupBy({
    by: ["state"],
    where: androidTransactionWhere(packageName, storeProfileId, options),
    orderBy: { state: "asc" },
  });

  return rows.map((row) => row.state);
}

type IosTransactionPageOptions = {
  includeTotal?: boolean;
  page: number;
  pageSize: number;
  purchaseDateFrom?: string;
  purchaseDateTo?: string;
  revenueGranularity?: string;
  revenueSort?: string;
  skip: number;
  state?: string;
  take: number;
  trial?: string;
};

function iosFreeTrialWhere(): Prisma.IosIapTransactionWhereInput {
  return {
    OR: [
      { isTrial: true },
      { offerDiscountType: { equals: "free_trial", mode: "insensitive" } },
      {
        offerType: 1,
        priceMilliunits: BigInt(0),
        revenueMicros: BigInt(0),
      },
    ],
  };
}

function iosTransactionWhere(
  bundleId: string,
  storeProfileId?: string,
  options?: Partial<IosTransactionPageOptions>,
): Prisma.IosIapTransactionWhereInput {
  const where: Prisma.IosIapTransactionWhereInput = {
    bundleId,
    environment: "production",
  };
  const state = options?.state?.trim();
  const trial = options?.trial?.trim();
  const purchaseDate = purchaseDateRange(
    options?.purchaseDateFrom,
    options?.purchaseDateTo,
  );
  const andConditions: Prisma.IosIapTransactionWhereInput[] = [];

  if (storeProfileId) {
    andConditions.push({ OR: [{ storeProfileId }, { storeProfileId: null }] });
  }

  if (state && state !== "all") {
    where.state = { equals: state, mode: "insensitive" };
  }

  if (trial === "trial") {
    andConditions.push(iosFreeTrialWhere());
  }

  if (trial === "non_trial") {
    andConditions.push({ NOT: iosFreeTrialWhere() });
  }

  if (purchaseDate) {
    where.purchaseDate = {};
    if (purchaseDate.start) where.purchaseDate.gte = purchaseDate.start;
    if (purchaseDate.end) where.purchaseDate.lt = purchaseDate.end;
  }

  if (andConditions.length) {
    where.AND = andConditions;
  }

  return where;
}

export async function getIosTransactionsByBundleIdPage(
  bundleId: string,
  storeProfileId: string | undefined,
  options: IosTransactionPageOptions,
) {
  const where = iosTransactionWhere(bundleId, storeProfileId, options);
  const rowsPromise = prisma.iosIapTransaction.findMany({
    where,
    orderBy: revenueSortOrder(options.revenueSort)
      ? [
          { revenueMicros: revenueSortOrder(options.revenueSort) ?? "desc" },
          { verifiedAt: "desc" },
        ]
      : { verifiedAt: "desc" },
    skip: options.skip,
    take: options.take,
    select: iosTransactionSummarySelect,
  });

  if (options.includeTotal === false) {
    return [await rowsPromise, null] as const;
  }

  const [rows, total] = await prisma.$transaction([
    rowsPromise,
    prisma.iosIapTransaction.count({ where }),
  ]);

  return [rows, total] as const;
}

export function getIosIapTransactionById(id: string) {
  return prisma.iosIapTransaction.findUnique({
    where: { id },
    include: {
      storeProfile: {
        select: { storeAccountName: true },
      },
    },
  });
}

export function getIosTransactionsByBundleIdMetrics(
  bundleId: string,
  storeProfileId: string | undefined,
  options: Partial<IosTransactionPageOptions>,
) {
  const conditions = [
    Prisma.sql`bundle_id = ${bundleId}`,
    Prisma.sql`environment = 'production'`,
  ];
  const state = options.state?.trim();
  const trial = options.trial?.trim();

  if (storeProfileId) {
    conditions.push(
      Prisma.sql`(store_profile_id = ${storeProfileId}::uuid or store_profile_id is null)`,
    );
  }
  if (state && state !== "all") {
    conditions.push(Prisma.sql`lower(state) = ${state.toLowerCase()}`);
  }
  if (trial === "trial") {
    conditions.push(Prisma.sql`(
      is_trial is true
      or lower(coalesce(offer_discount_type, '')) = 'free_trial'
      or (
        offer_type = 1
        and coalesce(price_milliunits, 0) = 0
        and coalesce(revenue_micros, 0) = 0
      )
    )`);
  }
  if (trial === "non_trial") {
    conditions.push(Prisma.sql`not (
      is_trial is true
      or lower(coalesce(offer_discount_type, '')) = 'free_trial'
      or (
        offer_type = 1
        and coalesce(price_milliunits, 0) = 0
        and coalesce(revenue_micros, 0) = 0
      )
    )`);
  }

  return getIapMetrics(
    Prisma.sql`public.ios_iap_transactions`,
    Prisma.sql`where ${joinSql(conditions, Prisma.sql`and`)}`,
    Prisma.sql`lower(environment) = 'sandbox'`,
    { revenueGranularity: options.revenueGranularity },
  );
}

export function getIosTrialAnalyticsTransactions(
  bundleId: string,
  storeProfileId: string | undefined,
) {
  return prisma.iosIapTransaction.findMany({
    where: iosTransactionWhere(bundleId, storeProfileId),
    orderBy: [
      { originalTransactionId: "asc" },
      { purchaseDate: "asc" },
      { verifiedAt: "asc" },
    ],
    select: iosTrialAnalyticsTransactionSelect,
  });
}

export function getIosIapNotificationEventsByBundleId(
  bundleId: string,
  storeProfileId: string | undefined,
  take = 8,
) {
  return prisma.iosIapNotificationEvent.findMany({
    where: {
      bundleId,
      environment: "production",
      ...(storeProfileId ? { storeProfileId } : {}),
    },
    orderBy: { receivedAt: "desc" },
    take,
    select: iosNotificationEventSummarySelect,
  });
}

export async function getIosIapNotificationEventSummaryByBundleId(
  bundleId: string,
  storeProfileId: string | undefined,
) {
  const where: Prisma.IosIapNotificationEventWhereInput = {
    bundleId,
    environment: "production",
    ...(storeProfileId ? { storeProfileId } : {}),
  };
  const [counts, latest] = await Promise.all([
    prisma.iosIapNotificationEvent.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
    }),
    prisma.iosIapNotificationEvent.findFirst({
      where,
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true },
    }),
  ]);

  return { counts, latest };
}

export async function getIosTransactionStatesByBundleId(
  bundleId: string,
  storeProfileId?: string,
) {
  const rows = await prisma.iosIapTransaction.groupBy({
    by: ["state"],
    where: iosTransactionWhere(bundleId, storeProfileId),
    orderBy: { state: "asc" },
  });

  return rows.map((row) => row.state);
}
