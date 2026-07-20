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
import type { IosIapTwoHourCheckRecord } from "@/lib/server/repositories/iap/ios-iap-two-hour-check.repository";
import type { IosIapTransactionSummaryRecord } from "@/lib/tracking/mappers/ios";

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
  verifiedAt: true,
  createdAt: true,
} satisfies Prisma.IosIapTransactionSelect;

const androidMappingByIdSelect = {
  id: true,
  appId: true,
  storeProfileId: true,
  storeAccountName: true,
  appName: true,
  appIconUrl: true,
  appLink: true,
  packageName: true,
  storeProfile: {
    select: { storeAccountName: true },
  },
} satisfies Prisma.AndroidStoreMappingSelect;

const iosMappingByIdSelect = {
  id: true,
  appId: true,
  storeProfileId: true,
  storeAccountName: true,
  appName: true,
  appIconUrl: true,
  appLink: true,
  bundleId: true,
  storeProfile: {
    select: { storeAccountName: true },
  },
} satisfies Prisma.IosStoreMappingSelect;

type IosMappingById = Prisma.IosStoreMappingGetPayload<{
  select: typeof iosMappingByIdSelect;
}>;

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

export type IosTrialAnalyticsTransaction = Prisma.IosIapTransactionGetPayload<{
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
    const searchOr: Prisma.AndroidStoreMappingWhereInput[] = searchTextVariants(
      search,
    ).flatMap((variant) => {
      const contains = { contains: variant, mode: "insensitive" as const };

      return [
        { appName: contains },
        { appId: contains },
        { packageName: contains },
        { storeAccountName: contains },
        { storeProfile: { storeAccountName: contains } },
      ];
    });

    where.AND = [
      ...(where.AND instanceof Array ? where.AND : []),
      { OR: searchOr },
    ];
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
    const searchOr: Prisma.IosStoreMappingWhereInput[] = searchTextVariants(
      search,
    ).flatMap((variant) => {
      const contains = { contains: variant, mode: "insensitive" as const };

      return [
        { appName: contains },
        { appId: contains },
        { bundleId: contains },
        { storeAccountName: contains },
        { storeProfile: { storeAccountName: contains } },
      ];
    });

    where.AND = [
      ...(where.AND instanceof Array ? where.AND : []),
      { OR: searchOr },
    ];
  }

  return where;
}

export async function getAllActiveStoreMappings(
  options?: IapAppMappingOptions,
) {
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

  return rows.map((row) => row.storeAccountName?.trim() ?? "").filter(Boolean);
}

export async function getAndroidMappingById(id: string) {
  return prisma.androidStoreMapping.findUnique({
    where: { id },
    select: androidMappingByIdSelect,
  });
}

export async function getIosMappingById(id: string) {
  return prisma.iosStoreMapping.findUnique({
    where: { id },
    select: iosMappingByIdSelect,
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

function revenueSortOrder(
  value: string | null | undefined,
): Prisma.SortOrder | null {
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
  return parts
    .slice(1)
    .reduce((sql, part) => Prisma.sql`${sql} ${separator} ${part}`, parts[0]);
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
  const loadRows = () =>
    prisma.iapAndroid.findMany({
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
    return [await loadRows(), null] as const;
  }

  const [rows, total] = await Promise.all([
    loadRows(),
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
  adjustStatus?: string;
  environment?: string;
  firebaseStatus?: string;
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
  twoHourStatus?: string;
  trial?: string;
};

type IosTransactionListPageRow = {
  paidContinuationPurchaseDate: Date | null;
  paidContinuationTransactionId: string | null;
  checkAdjustAdid: string | null;
  checkAppInstanceId: string | null;
  checkAttempts: number | null;
  checkAt: Date | null;
  checkBundleId: string | null;
  checkCreatedAt: Date | null;
  checkEnvironment: string | null;
  checkFirebaseAppId: string | null;
  checkGa4EventName: string | null;
  checkGa4SentAt: Date | null;
  checkId: string | null;
  checkIdfa: string | null;
  checkIdfv: string | null;
  checkLastError: string | null;
  checkOriginalTransactionId: string | null;
  checkProductId: string | null;
  checkRawContext: Prisma.JsonValue | null;
  checkRenewalStatus: string | null;
  checkRenewed: boolean | null;
  checkStatus: string | null;
  checkStoreProfileId: string | null;
  checkTransactionId: string | null;
  checkUpdatedAt: Date | null;
  checkUserId: string | null;
  mappingAppId: string | null;
  mappingAppIconUrl: string | null;
  mappingAppLink: string | null;
  mappingAppName: string;
  mappingBundleId: string;
  mappingId: string;
  mappingProfileStoreAccountName: string | null;
  mappingStoreAccountName: string;
  mappingStoreProfileId: string;
  totalCount: bigint | number | null;
  txBillingPlanType: string | null;
  txBundleId: string | null;
  txCreatedAt: Date | null;
  txCurrency: string | null;
  txDecodedRenewalInfo: Prisma.JsonValue | null;
  txEnvironment: string | null;
  txExpiresDate: Date | null;
  txHasDecodedNotification: boolean | null;
  txHasSignedTransactionInfo: boolean | null;
  txId: string | null;
  txIsTrial: boolean | null;
  txOfferDiscountType: string | null;
  txOfferPeriod: string | null;
  txOriginalTransactionId: string | null;
  txPriceMilliunits: bigint | null;
  txProductId: string | null;
  txPurchaseDate: Date | null;
  txRawReceiptSource: string | null;
  txRawReceiptSubtype: string | null;
  txRevenueMicros: bigint | null;
  txRevocationDate: Date | null;
  txState: string | null;
  txStorefront: string | null;
  txTransactionId: string | null;
  txTransactionReason: string | null;
  txUserId: string | null;
  txVerifiedAt: Date | null;
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

function iosFreeTrialSqlCondition() {
  return Prisma.sql`(
    t.is_trial = true
    OR lower(t.offer_discount_type) = 'free_trial'
    OR (t.offer_type = 1 AND t.price_milliunits = 0 AND t.revenue_micros = 0)
  )`;
}

function iosTwoHourExistsSql(condition: Prisma.Sql = Prisma.sql`true`) {
  return Prisma.sql`EXISTS (
    SELECT 1
    FROM public.ios_iap_two_hour_checks c
    WHERE c.transaction_id = t.transaction_id
      AND ${condition}
  )`;
}

function iosTwoHourMissingSql() {
  return Prisma.sql`NOT EXISTS (
    SELECT 1
    FROM public.ios_iap_two_hour_checks c
    WHERE c.transaction_id = t.transaction_id
  )`;
}

function providerStatusSql(provider: "adjust" | "ga4") {
  return Prisma.sql`lower(coalesce(
    jsonb_extract_path_text(c.raw_context::jsonb, 'delivery', ${provider}, 'status'),
    jsonb_extract_path_text(c.raw_context::jsonb, ${provider}, 'status'),
    ''
  ))`;
}

function providerResponseStatusSql(
  provider: "adjust" | "ga4",
  section: "delivery" | "legacy",
) {
  const value =
    section === "delivery"
      ? Prisma.sql`jsonb_extract_path_text(c.raw_context::jsonb, 'delivery', ${provider}, 'result', 'responseStatus')`
      : Prisma.sql`jsonb_extract_path_text(c.raw_context::jsonb, ${provider}, 'responseStatus')`;

  return Prisma.sql`(
    CASE
      WHEN ${value} ~ '^[0-9]+$' THEN (${value})::int BETWEEN 200 AND 299
      ELSE false
    END
  )`;
}

function providerDeliveredSql(provider: "adjust" | "ga4") {
  return Prisma.sql`(
    ${providerStatusSql(provider)} = 'delivered'
    OR ${providerResponseStatusSql(provider, "delivery")}
    OR ${providerResponseStatusSql(provider, "legacy")}
    ${
      provider === "ga4"
        ? Prisma.sql`OR (c.renewed = true AND c.ga4_sent_at IS NOT NULL)`
        : Prisma.empty
    }
  )`;
}

function providerSkippedSql(provider: "adjust" | "ga4") {
  return Prisma.sql`(
    jsonb_extract_path_text(c.raw_context::jsonb, 'delivery', ${provider}, 'result', 'skipped') = 'true'
    OR jsonb_extract_path_text(c.raw_context::jsonb, ${provider}, 'result', 'skipped') = 'true'
    OR jsonb_extract_path_text(c.raw_context::jsonb, ${provider}, 'skipped') = 'true'
  )`;
}

function providerRetryingSql(provider: "adjust" | "ga4") {
  return Prisma.sql`${providerStatusSql(provider)} = 'retryable_error'`;
}

function providerFailedSql(provider: "adjust" | "ga4") {
  return Prisma.sql`(
    ${providerStatusSql(provider)} IN ('failed', 'error', 'validation_failed')
    OR (
      ${providerStatusSql(provider)} NOT IN ('delivered', 'retryable_error')
      AND (
        nullif(jsonb_extract_path_text(c.raw_context::jsonb, 'delivery', ${provider}, 'message'), '') IS NOT NULL
        OR nullif(jsonb_extract_path_text(c.raw_context::jsonb, 'delivery', ${provider}, 'result', 'error'), '') IS NOT NULL
        OR nullif(jsonb_extract_path_text(c.raw_context::jsonb, ${provider}, 'error'), '') IS NOT NULL
        OR ${
          provider === "ga4"
            ? Prisma.sql`coalesce(c.last_error, '') ~* '(ga4|firebase|measurement|api_secret|app_instance)'`
            : Prisma.sql`coalesce(c.last_error, '') ~* '(adjust|adid|idfa|idfv)'`
        }
      )
    )
  )`;
}

function providerNoDataSql(provider: "adjust" | "ga4") {
  return Prisma.sql`(
    lower(coalesce(c.status, '')) NOT IN ('pending', 'processing')
    AND c.renewed IS DISTINCT FROM false
    AND NOT ${providerDeliveredSql(provider)}
    AND NOT ${providerSkippedSql(provider)}
    AND NOT ${providerRetryingSql(provider)}
    AND NOT ${providerFailedSql(provider)}
  )`;
}

function iosTwoHourStatusSql(status: string | undefined) {
  switch (status?.trim().toLowerCase()) {
    case "passed":
      return iosTwoHourExistsSql(
        Prisma.sql`lower(c.status) = 'sent' AND c.renewed = true`,
      );
    case "cancelled":
      return iosTwoHourExistsSql(
        Prisma.sql`lower(c.status) = 'sent' AND c.renewed = false`,
      );
    case "checked":
      return iosTwoHourExistsSql(
        Prisma.sql`lower(c.status) = 'sent' AND c.renewed IS NULL`,
      );
    case "failed":
      return iosTwoHourExistsSql(Prisma.sql`lower(c.status) = 'failed'`);
    case "processing":
    case "checking":
      return iosTwoHourExistsSql(Prisma.sql`lower(c.status) = 'processing'`);
    case "retrying":
      return iosTwoHourExistsSql(Prisma.sql`lower(c.status) = 'retrying'`);
    case "pending":
      return iosTwoHourExistsSql(Prisma.sql`lower(c.status) = 'pending'`);
    case "not_scheduled":
      return Prisma.sql`${iosTwoHourMissingSql()} AND ${iosFreeTrialSqlCondition()}`;
    case "not_applicable":
      return Prisma.sql`${iosTwoHourMissingSql()} AND NOT ${iosFreeTrialSqlCondition()}`;
    default:
      return null;
  }
}

function iosProviderStatusSql(
  provider: "adjust" | "ga4",
  status: string | undefined,
) {
  switch (status?.trim().toLowerCase()) {
    case "sent":
      return iosTwoHourExistsSql(providerDeliveredSql(provider));
    case "skipped":
      return iosTwoHourExistsSql(providerSkippedSql(provider));
    case "failed":
      return iosTwoHourExistsSql(providerFailedSql(provider));
    case "retrying":
      return iosTwoHourExistsSql(
        Prisma.sql`${providerRetryingSql(provider)} OR lower(c.status) = 'retrying'`,
      );
    case "pending":
      return iosTwoHourExistsSql(
        Prisma.sql`lower(c.status) IN ('pending', 'processing')`,
      );
    case "not_sent":
      return iosTwoHourExistsSql(Prisma.sql`c.renewed = false`);
    case "not_scheduled":
      return Prisma.sql`${iosTwoHourMissingSql()} AND ${iosFreeTrialSqlCondition()}`;
    case "no_data":
      return iosTwoHourExistsSql(providerNoDataSql(provider));
    default:
      return null;
  }
}

function iosTransactionWhere(
  bundleId: string,
  storeProfileId?: string,
  options?: Partial<IosTransactionPageOptions>,
): Prisma.IosIapTransactionWhereInput {
  const where: Prisma.IosIapTransactionWhereInput = {
    bundleId,
  };
  const environment = options?.environment?.trim().toLowerCase();
  if (environment === "sandbox" || environment === "test") {
    where.environment = "sandbox";
  } else if (environment !== "all") {
    where.environment = "production";
  }
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

function iosTransactionSqlConditions(
  options: Partial<IosTransactionPageOptions>,
) {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`t.bundle_id = m.bundle_id`,
    Prisma.sql`(t.store_profile_id = m.store_profile_id OR t.store_profile_id IS NULL)`,
  ];
  const environment = options.environment?.trim().toLowerCase();
  const testMapping = Prisma.sql`replace(lower(coalesce(m.app_id, '')), '-', '') = 'li000'`;
  if (environment === "sandbox" || environment === "test") {
    conditions.push(
      Prisma.sql`lower(t.environment) = 'sandbox' AND ${testMapping}`,
    );
  } else if (environment === "all") {
    conditions.push(Prisma.sql`(
      lower(t.environment) = 'production'
      OR (lower(t.environment) = 'sandbox' AND ${testMapping})
    )`);
  } else {
    conditions.push(Prisma.sql`lower(t.environment) = 'production'`);
  }
  const state = options.state?.trim();
  const trial = options.trial?.trim();
  const twoHourStatus = iosTwoHourStatusSql(options.twoHourStatus);
  const firebaseStatus = iosProviderStatusSql("ga4", options.firebaseStatus);
  const adjustStatus = iosProviderStatusSql("adjust", options.adjustStatus);
  const purchaseDate = purchaseDateRange(
    options.purchaseDateFrom,
    options.purchaseDateTo,
  );
  const freeTrialCondition = iosFreeTrialSqlCondition();

  if (state && state !== "all") {
    conditions.push(Prisma.sql`lower(t.state) = ${state.toLowerCase()}`);
  }

  if (trial === "trial") {
    conditions.push(freeTrialCondition);
  }

  if (trial === "non_trial") {
    conditions.push(Prisma.sql`NOT ${freeTrialCondition}`);
  }

  if (purchaseDate?.start) {
    conditions.push(Prisma.sql`t.purchase_date >= ${purchaseDate.start}`);
  }

  if (purchaseDate?.end) {
    conditions.push(Prisma.sql`t.purchase_date < ${purchaseDate.end}`);
  }

  if (twoHourStatus) {
    conditions.push(twoHourStatus);
  }

  if (firebaseStatus) {
    conditions.push(firebaseStatus);
  }

  if (adjustStatus) {
    conditions.push(adjustStatus);
  }

  return conditions;
}

function iosTransactionSqlOrderBy(revenueSort: string | null | undefined) {
  const sort = revenueSortOrder(revenueSort);

  if (sort === "asc") {
    return Prisma.sql`ORDER BY t.revenue_micros ASC NULLS LAST, t.verified_at DESC`;
  }

  if (sort === "desc") {
    return Prisma.sql`ORDER BY t.revenue_micros DESC NULLS LAST, t.verified_at DESC`;
  }

  return Prisma.sql`ORDER BY t.verified_at DESC`;
}

function compactJsonObject(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([, value]) => value !== null && value !== undefined,
    ),
  );
}

function minimalIosRawReceipt(row: IosTransactionListPageRow) {
  const receipt = compactJsonObject({
    decodedNotification: row.txHasDecodedNotification ? {} : null,
    decodedRenewalInfo: row.txDecodedRenewalInfo,
    signedTransactionInfo: row.txHasSignedTransactionInfo ? "present" : null,
    source: row.txRawReceiptSource,
    subtype: row.txRawReceiptSubtype,
  });

  return Object.keys(receipt).length ? (receipt as Prisma.JsonObject) : null;
}

function iosTransactionFromListPageRow(
  row: IosTransactionListPageRow,
): IosIapTransactionSummaryRecord | null {
  if (!row.txId || !row.txTransactionId || !row.txProductId || !row.txState) {
    return null;
  }

  return {
    billingPlanType: row.txBillingPlanType,
    bundleId: row.txBundleId,
    createdAt: row.txCreatedAt ?? new Date(0),
    currency: row.txCurrency,
    environment: row.txEnvironment ?? "production",
    expiresDate: row.txExpiresDate,
    id: row.txId,
    isTrial: row.txIsTrial,
    offerDiscountType: row.txOfferDiscountType,
    offerPeriod: row.txOfferPeriod,
    originalTransactionId: row.txOriginalTransactionId,
    paidContinuationPurchaseDate: row.paidContinuationPurchaseDate,
    paidContinuationTransactionId: row.paidContinuationTransactionId,
    priceMilliunits: row.txPriceMilliunits,
    productId: row.txProductId,
    purchaseDate: row.txPurchaseDate,
    rawReceipt: minimalIosRawReceipt(row),
    revenueMicros: row.txRevenueMicros,
    revocationDate: row.txRevocationDate,
    state: row.txState,
    storefront: row.txStorefront,
    transactionId: row.txTransactionId,
    transactionReason: row.txTransactionReason,
    userId: row.txUserId,
    verifiedAt: row.txVerifiedAt ?? new Date(0),
  };
}

function iosTwoHourCheckFromListPageRow(
  row: IosTransactionListPageRow,
): IosIapTwoHourCheckRecord | null {
  if (
    !row.checkId ||
    !row.checkTransactionId ||
    !row.checkBundleId ||
    !row.checkProductId ||
    !row.checkEnvironment ||
    !row.checkAppInstanceId ||
    !row.checkGa4EventName ||
    !row.checkAt ||
    !row.checkStatus ||
    row.checkAttempts === null ||
    !row.checkCreatedAt ||
    !row.checkUpdatedAt
  ) {
    return null;
  }

  return {
    adjustAdid: row.checkAdjustAdid,
    appInstanceId: row.checkAppInstanceId,
    attempts: row.checkAttempts,
    bundleId: row.checkBundleId,
    checkAt: row.checkAt,
    createdAt: row.checkCreatedAt,
    environment: row.checkEnvironment,
    firebaseAppId: row.checkFirebaseAppId,
    ga4EventName: row.checkGa4EventName,
    ga4SentAt: row.checkGa4SentAt,
    id: row.checkId,
    idfa: row.checkIdfa,
    idfv: row.checkIdfv,
    lastError: row.checkLastError,
    originalTransactionId: row.checkOriginalTransactionId,
    productId: row.checkProductId,
    rawContext: row.checkRawContext ?? {},
    renewalStatus: row.checkRenewalStatus,
    renewed: row.checkRenewed,
    status: row.checkStatus,
    storeProfileId: row.checkStoreProfileId,
    transactionId: row.checkTransactionId,
    updatedAt: row.checkUpdatedAt,
    userId: row.checkUserId,
  };
}

function iosMappingFromListPageRow(
  row: IosTransactionListPageRow | undefined,
): IosMappingById | null {
  if (!row) return null;

  return {
    appId: row.mappingAppId,
    appIconUrl: row.mappingAppIconUrl,
    appLink: row.mappingAppLink,
    appName: row.mappingAppName,
    bundleId: row.mappingBundleId,
    id: row.mappingId,
    storeAccountName: row.mappingStoreAccountName,
    storeProfile: {
      storeAccountName:
        row.mappingProfileStoreAccountName ?? row.mappingStoreAccountName,
    },
    storeProfileId: row.mappingStoreProfileId,
  };
}

export async function getIosTransactionsListPageByMappingId(
  mappingId: string,
  options: IosTransactionPageOptions,
) {
  const conditions = iosTransactionSqlConditions(options);
  const orderBy = iosTransactionSqlOrderBy(options.revenueSort);
  const joinedConditions = joinSql(conditions, Prisma.sql`AND`);
  const totalCte =
    options.includeTotal === false
      ? Prisma.sql`transaction_total AS (SELECT NULL::bigint AS total),`
      : Prisma.sql`
        transaction_total AS (
          SELECT count(*) AS total
          FROM public.ios_iap_transactions t
          JOIN mapping m ON true
          WHERE ${joinedConditions}
        ),
      `;
  const rows = await prisma.$queryRaw<IosTransactionListPageRow[]>(Prisma.sql`
        WITH mapping AS (
          SELECT
            m.id,
            m.app_id,
            m.store_profile_id,
            m.store_account_name,
            m.app_name,
            m.app_icon_url,
            m.app_link,
            m.bundle_id,
            sp.store_account_name AS profile_store_account_name
          FROM public.ios_store_mappings m
          LEFT JOIN public.ios_store_profiles sp ON sp.id = m.store_profile_id
          WHERE m.id = ${mappingId}::uuid
        ),
        ${totalCte}
        paged_transactions AS (
          SELECT t.*
          FROM public.ios_iap_transactions t
          JOIN mapping m ON true
          WHERE ${joinedConditions}
          ${orderBy}
          LIMIT ${options.take}
          OFFSET ${options.skip}
        )
        SELECT
          m.id AS "mappingId",
          m.app_id AS "mappingAppId",
          m.store_profile_id AS "mappingStoreProfileId",
          m.store_account_name AS "mappingStoreAccountName",
          m.app_name AS "mappingAppName",
          m.app_icon_url AS "mappingAppIconUrl",
          m.app_link AS "mappingAppLink",
          m.bundle_id AS "mappingBundleId",
          m.profile_store_account_name AS "mappingProfileStoreAccountName",
          total.total AS "totalCount",
          t.id AS "txId",
          t.transaction_id AS "txTransactionId",
          t.original_transaction_id AS "txOriginalTransactionId",
          t.product_id AS "txProductId",
          t.user_id AS "txUserId",
          t.bundle_id AS "txBundleId",
          t.purchase_date AS "txPurchaseDate",
          t.expires_date AS "txExpiresDate",
          t.state AS "txState",
          t.revenue_micros AS "txRevenueMicros",
          t.price_milliunits AS "txPriceMilliunits",
          t.currency AS "txCurrency",
          t.is_trial AS "txIsTrial",
          t.transaction_reason AS "txTransactionReason",
          t.offer_discount_type AS "txOfferDiscountType",
          t.offer_period AS "txOfferPeriod",
          t.billing_plan_type AS "txBillingPlanType",
          t.storefront AS "txStorefront",
          t.revocation_date AS "txRevocationDate",
          t.environment AS "txEnvironment",
          t.raw_receipt::jsonb ->> 'source' AS "txRawReceiptSource",
          t.raw_receipt::jsonb ->> 'subtype' AS "txRawReceiptSubtype",
          t.raw_receipt::jsonb -> 'decodedRenewalInfo' AS "txDecodedRenewalInfo",
          jsonb_typeof(t.raw_receipt::jsonb -> 'decodedNotification') = 'object' AS "txHasDecodedNotification",
          t.raw_receipt::jsonb ? 'signedTransactionInfo' AS "txHasSignedTransactionInfo",
          t.verified_at AS "txVerifiedAt",
          t.created_at AS "txCreatedAt",
          paid.purchase_date AS "paidContinuationPurchaseDate",
          paid.transaction_id AS "paidContinuationTransactionId",
          c.id AS "checkId",
          c.store_profile_id AS "checkStoreProfileId",
          c.transaction_id AS "checkTransactionId",
          c.original_transaction_id AS "checkOriginalTransactionId",
          c.user_id AS "checkUserId",
          c.bundle_id AS "checkBundleId",
          c.product_id AS "checkProductId",
          c.environment AS "checkEnvironment",
          c.app_instance_id AS "checkAppInstanceId",
          c.firebase_app_id AS "checkFirebaseAppId",
          c.adjust_adid AS "checkAdjustAdid",
          c.idfa AS "checkIdfa",
          c.idfv AS "checkIdfv",
          c.ga4_event_name AS "checkGa4EventName",
          c.check_at AS "checkAt",
          c.status AS "checkStatus",
          c.renewed AS "checkRenewed",
          c.renewal_status AS "checkRenewalStatus",
          c.ga4_sent_at AS "checkGa4SentAt",
          c.attempts AS "checkAttempts",
          c.last_error AS "checkLastError",
          c.raw_context AS "checkRawContext",
          c.created_at AS "checkCreatedAt",
          c.updated_at AS "checkUpdatedAt"
        FROM mapping m
        CROSS JOIN transaction_total total
        LEFT JOIN paged_transactions t ON true
        LEFT JOIN LATERAL (
          SELECT
            paid_tx.transaction_id,
            paid_tx.purchase_date
          FROM public.ios_iap_transactions paid_tx
          WHERE ${iosFreeTrialSqlCondition()}
            AND paid_tx.transaction_id <> t.transaction_id
            AND paid_tx.original_transaction_id = coalesce(
              t.original_transaction_id,
              t.transaction_id
            )
            AND paid_tx.bundle_id IS NOT DISTINCT FROM t.bundle_id
            AND paid_tx.store_profile_id IS NOT DISTINCT FROM t.store_profile_id
            AND paid_tx.environment = t.environment
            AND NOT (
              coalesce(paid_tx.is_trial, false)
              OR coalesce(lower(paid_tx.offer_discount_type) = 'free_trial', false)
              OR (
                paid_tx.offer_type = 1
                AND coalesce(paid_tx.price_milliunits, 0) = 0
                AND coalesce(paid_tx.revenue_micros, 0) = 0
              )
            )
            AND greatest(
              coalesce(paid_tx.revenue_micros, 0),
              coalesce(paid_tx.price_milliunits, 0) * 1000
            ) > 0
            AND paid_tx.purchase_date >= coalesce(t.expires_date, t.purchase_date)
          ORDER BY paid_tx.purchase_date ASC, paid_tx.verified_at ASC
          LIMIT 1
        ) paid ON true
        LEFT JOIN public.ios_iap_two_hour_checks c ON c.transaction_id = t.transaction_id
        ${orderBy}
      `);

  const mapping = iosMappingFromListPageRow(rows[0]);
  const transactions = rows
    .map(iosTransactionFromListPageRow)
    .filter((transaction): transaction is IosIapTransactionSummaryRecord =>
      Boolean(transaction),
    );
  const twoHourChecks = rows
    .map(iosTwoHourCheckFromListPageRow)
    .filter((check): check is IosIapTwoHourCheckRecord => Boolean(check));
  const rawTotal = rows[0]?.totalCount ?? null;
  const total =
    rawTotal === null
      ? null
      : typeof rawTotal === "bigint"
        ? Number(rawTotal)
        : rawTotal;

  return { mapping, total, transactions, twoHourChecks };
}

export async function getIosTransactionsByBundleIdPage(
  bundleId: string,
  storeProfileId: string | undefined,
  options: IosTransactionPageOptions,
) {
  const where = iosTransactionWhere(bundleId, storeProfileId, options);
  const loadRows = () =>
    prisma.iosIapTransaction.findMany({
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
    return [await loadRows(), null] as const;
  }

  const [rows, total] = await Promise.all([
    loadRows(),
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
  const conditions = [Prisma.sql`bundle_id = ${bundleId}`];
  const environment = options.environment?.trim().toLowerCase();
  if (environment === "sandbox" || environment === "test") {
    conditions.push(Prisma.sql`lower(environment) = 'sandbox'`);
  } else if (environment === "all") {
    conditions.push(
      Prisma.sql`lower(environment) IN ('production', 'sandbox')`,
    );
  } else {
    conditions.push(Prisma.sql`lower(environment) = 'production'`);
  }
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
    {
      includeTest: environment !== "production",
      revenueGranularity: options.revenueGranularity,
    },
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
  options?: Partial<IosTransactionPageOptions>,
) {
  const rows = await prisma.iosIapTransaction.groupBy({
    by: ["state"],
    where: iosTransactionWhere(bundleId, storeProfileId, options),
    orderBy: { state: "asc" },
  });

  return rows.map((row) => row.state);
}
