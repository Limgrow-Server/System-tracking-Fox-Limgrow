import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { searchTextVariants } from "@/lib/search";
import { convertCurrencyAmountToVnd } from "@/lib/server/currency-conversion";
import type { IapAppMetrics, IapRevenueBucket } from "@/lib/tracking/page-data";

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
  search?: string;
  storeAccountName?: string;
};

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
  options?: { includeTest?: boolean },
) {
  const metricScopeSql = options?.includeTest
    ? Prisma.sql`true`
    : Prisma.sql`not is_test`;

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
        select date_trunc('month', coalesce(max(purchase_date), '2026-06-01'::timestamptz)) as chart_end
        from metric_source
      ),
      months as (
        select generate_series(
          (select chart_end from anchor) - interval '11 months',
          (select chart_end from anchor),
          interval '1 month'
        ) as month_start
      )
      select
        to_char(months.month_start, 'Mon') as label,
        upper(coalesce(nullif(trim(metric_source.currency), ''), 'VND')) as currency,
        coalesce(sum((metric_source.revenue_micros::numeric / 1000000.0)) filter (
          where not metric_source.is_test
            and coalesce(metric_source.revenue_micros, 0) > 0
        ), 0)::float8 as prod,
        coalesce(sum((metric_source.revenue_micros::numeric / 1000000.0)) filter (
          where metric_source.is_test
            and coalesce(metric_source.revenue_micros, 0) > 0
        ), 0)::float8 as sand
      from months
      left join metric_source
        on date_trunc('month', metric_source.purchase_date) = months.month_start
      group by months.month_start, upper(coalesce(nullif(trim(metric_source.currency), ''), 'VND'))
      order by months.month_start
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
    orderBy: { verifiedAt: "desc" },
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
    { includeTest: environment !== "production" },
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
    environment: { equals: "production", mode: "insensitive" },
  };
  const state = options?.state?.trim();
  const trial = options?.trial?.trim();
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
    orderBy: { verifiedAt: "desc" },
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
    Prisma.sql`lower(environment) = 'production'`,
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
      environment: { equals: "production", mode: "insensitive" },
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
    environment: { equals: "production", mode: "insensitive" },
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
