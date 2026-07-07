import "server-only";

import {
  Prisma,
  type ReviewFetchRunStatus,
  type ReviewFetchScheduleStatus,
  type ReviewReplyTemplate,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { searchTextVariants } from "@/lib/search";
import { firstAppleAppStoreId } from "@/lib/tracking/identity";

const REVIEW_FETCH_GLOBAL_SCOPE = "global";

export type ReviewAppScopeRecord = {
  appName: string;
  identifier: string;
  mappingId: string;
  platform: "android" | "ios";
  storeAvatarUrl: string | null;
  storeContactEmail: string | null;
  storeLink: string | null;
  storeAccountName: string;
  storeProfileId: string;
  storeSupportPhone: string | null;
  storeWebsiteUrl: string | null;
};

export type ReviewAppScopePageOptions = {
  platform?: string;
  search?: string;
  skip: number;
  storeProfileId?: string;
  take: number;
};

type CountRow = {
  total: number | bigint | null;
};

type ReviewStoreOptionRow = {
  id: string | null;
  name: string | null;
};

export type ReviewStoreScopeRecord = {
  appCount: number | bigint | null;
  contactEmail: string | null;
  platform: "android" | "ios";
  storeAccountName: string;
  storeAvatarUrl: string | null;
  storeLink: string | null;
  storeProfileId: string;
  supportPhone: string | null;
  websiteUrl: string | null;
};

export type ReviewStoreScopePageOptions = {
  platform?: string;
  search?: string;
  skip: number;
  take: number;
};

type ReviewFetchScheduleUpsertInput = {
  createdBy: string;
  intervalHours: number;
  nextRunAt: Date;
  status: ReviewFetchScheduleStatus;
  updatedBy: string;
};

export type ReviewReplyTemplateRecord = Pick<
  ReviewReplyTemplate,
  | "id"
  | "isActive"
  | "rating"
  | "replyText"
  | "updatedAt"
  | "updatedBy"
> & {
  platform: "android" | "ios";
  storeMappingId: string;
};

export type ReviewReplyTemplateTargetInput =
  | string
  | {
      platform: "android" | "ios";
      storeMappingId: string;
    };

function activeStatusSql() {
  return Prisma.sql`'active'::mapping_status`;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
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

function storeProfileSql(storeProfileId: string | undefined) {
  const normalized = storeProfileId?.trim();
  if (!normalized || normalized === "all") return Prisma.empty;
  if (!isUuid(normalized)) return Prisma.sql`AND false`;

  return Prisma.sql`AND mapping."store_profile_id" = ${normalized}::uuid`;
}

function androidReviewAppScopeSql(options?: Pick<ReviewAppScopePageOptions, "search" | "storeProfileId">) {
  return Prisma.sql`
    SELECT
      mapping."app_name" AS "appName",
      mapping."package_name" AS "identifier",
      mapping."id"::text AS "mappingId",
      'android' AS "platform",
      profile."avatar_url" AS "storeAvatarUrl",
      profile."contact_email" AS "storeContactEmail",
      profile."link_store" AS "storeLink",
      coalesce(profile."store_account_name", mapping."store_account_name") AS "storeAccountName",
      mapping."store_profile_id"::text AS "storeProfileId",
      profile."support_phone" AS "storeSupportPhone",
      profile."website_url" AS "storeWebsiteUrl"
    FROM "android_store_mappings" mapping
    LEFT JOIN "android_store_profiles" profile
      ON profile."id" = mapping."store_profile_id"
    WHERE mapping."status" = ${activeStatusSql()}
      ${storeProfileSql(options?.storeProfileId)}
      ${searchSql(options?.search, [
        Prisma.sql`mapping."app_name"`,
        Prisma.sql`mapping."app_id"`,
        Prisma.sql`mapping."package_name"`,
        Prisma.sql`mapping."store_account_name"`,
        Prisma.sql`profile."store_account_name"`,
      ])}
  `;
}

function iosReviewAppScopeSql(options?: Pick<ReviewAppScopePageOptions, "search" | "storeProfileId">) {
  return Prisma.sql`
    SELECT
      mapping."app_name" AS "appName",
      mapping."bundle_id" AS "identifier",
      mapping."id"::text AS "mappingId",
      'ios' AS "platform",
      profile."avatar_url" AS "storeAvatarUrl",
      store_target."contact_email" AS "storeContactEmail",
      profile."link_store" AS "storeLink",
      coalesce(profile."store_account_name", mapping."store_account_name") AS "storeAccountName",
      mapping."store_profile_id"::text AS "storeProfileId",
      store_target."support_phone" AS "storeSupportPhone",
      store_target."website_url" AS "storeWebsiteUrl"
    FROM "ios_store_mappings" mapping
    LEFT JOIN "ios_store_profiles" profile
      ON profile."id" = mapping."store_profile_id"
    LEFT JOIN "review_store_targets" store_target
      ON store_target."ios_store_profile_id" = mapping."store_profile_id"
    WHERE mapping."status" = ${activeStatusSql()}
      ${storeProfileSql(options?.storeProfileId)}
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

function reviewAppScopeBaseSql(options?: ReviewAppScopePageOptions) {
  if (options?.platform === "android") {
    return androidReviewAppScopeSql(options);
  }

  if (options?.platform === "ios") {
    return iosReviewAppScopeSql(options);
  }

  return Prisma.sql`
    ${androidReviewAppScopeSql(options)}
    UNION ALL
    ${iosReviewAppScopeSql(options)}
  `;
}

export async function getActiveReviewAppScopesPage(
  options: ReviewAppScopePageOptions,
) {
  const baseSql = reviewAppScopeBaseSql(options);
  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<ReviewAppScopeRecord[]>(Prisma.sql`
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

  return {
    scopes: rows,
    total: Number(countRows[0]?.total ?? 0),
  };
}

export async function getActiveReviewStoreOptions(options?: {
  platform?: string;
}) {
  const baseSql = reviewAppScopeBaseSql({ platform: options?.platform, skip: 0, take: 1 });
  const rows = await prisma.$queryRaw<ReviewStoreOptionRow[]>(Prisma.sql`
    SELECT DISTINCT "storeProfileId" AS id, "storeAccountName" AS name
    FROM (${baseSql}) apps
    WHERE "storeProfileId" IS NOT NULL
      AND "storeAccountName" IS NOT NULL
      AND "storeAccountName" <> ''
    ORDER BY "storeAccountName" ASC
  `);

  return rows
    .map((row) => ({
      id: row.id?.trim() ?? "",
      name: row.name?.trim() ?? "",
    }))
    .filter((row) => row.id && row.name);
}

export async function getActiveReviewStoreScopesPage(
  options: ReviewStoreScopePageOptions,
) {
  const baseSql = reviewAppScopeBaseSql({
    platform: options.platform,
    skip: 0,
    take: 1,
  });
  const storeSearchSql = searchSql(options.search, [
    Prisma.sql`"storeAccountName"`,
  ]);
  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<ReviewStoreScopeRecord[]>(Prisma.sql`
      SELECT
        COUNT(*)::int AS "appCount",
        max("storeContactEmail") AS "contactEmail",
        min("platform") AS "platform",
        "storeAccountName",
        max("storeAvatarUrl") AS "storeAvatarUrl",
        max("storeLink") AS "storeLink",
        "storeProfileId",
        max("storeSupportPhone") AS "supportPhone",
        max("storeWebsiteUrl") AS "websiteUrl"
      FROM (${baseSql}) apps
      WHERE "storeProfileId" IS NOT NULL
        AND "storeAccountName" IS NOT NULL
        AND "storeAccountName" <> ''
        ${storeSearchSql}
      GROUP BY "storeProfileId", "storeAccountName"
      ORDER BY "storeAccountName" ASC, "storeProfileId" ASC
      LIMIT ${options.take}
      OFFSET ${options.skip}
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(*)::int AS total
      FROM (
        SELECT 1
        FROM (${baseSql}) apps
        WHERE "storeProfileId" IS NOT NULL
          AND "storeAccountName" IS NOT NULL
          AND "storeAccountName" <> ''
          ${storeSearchSql}
        GROUP BY "storeProfileId", "storeAccountName"
      ) stores
    `),
  ]);

  return {
    stores: rows,
    total: Number(countRows[0]?.total ?? 0),
  };
}

export async function getActiveReviewAppScopesForStoreProfiles(
  storeProfileIds: string[],
) {
  const uniqueStoreIds = Array.from(new Set(storeProfileIds)).filter(isUuid);
  if (!uniqueStoreIds.length) return Promise.resolve([]);

  const baseSql = reviewAppScopeBaseSql({ skip: 0, take: 1 });

  return prisma.$queryRaw<ReviewAppScopeRecord[]>(Prisma.sql`
    SELECT *
    FROM (${baseSql}) apps
    WHERE "storeProfileId" IN (${Prisma.join(uniqueStoreIds)})
    ORDER BY "appName" ASC, "identifier" ASC, "mappingId" ASC
  `);
}

async function ensureReviewSyncState(
  tx: Prisma.TransactionClient,
  reviewAppTargetId: string,
) {
  await tx.reviewSyncState.upsert({
    where: { reviewAppTargetId },
    create: { reviewAppTargetId },
    update: {},
  });
}

async function ensureAndroidReviewTargetsQuery(
  tx: Prisma.TransactionClient,
  storeMappingId: string,
) {
  const mapping = await tx.androidStoreMapping.findUnique({
    where: { id: storeMappingId },
    select: {
      appName: true,
      id: true,
      packageName: true,
      status: true,
      storeProfileId: true,
      storeProfile: {
        select: {
          contactEmail: true,
          id: true,
          status: true,
          storeAccountName: true,
          supportPhone: true,
          websiteUrl: true,
        },
      },
    },
  });

  if (!mapping) {
    throw new Error(`Android store mapping was not found: ${storeMappingId}.`);
  }

  const storeTarget = await tx.reviewStoreTarget.upsert({
    where: { androidStoreProfileId: mapping.storeProfileId },
    create: {
      androidStoreProfileId: mapping.storeProfileId,
      contactEmail: mapping.storeProfile.contactEmail,
      platform: "ANDROID",
      status: mapping.storeProfile.status,
      storeAccountName: mapping.storeProfile.storeAccountName,
      supportPhone: mapping.storeProfile.supportPhone,
      websiteUrl: mapping.storeProfile.websiteUrl,
    },
    update: {
      status: mapping.storeProfile.status,
      storeAccountName: mapping.storeProfile.storeAccountName,
    },
    select: { id: true },
  });

  const appTarget = await tx.reviewAppTarget.upsert({
    where: { androidStoreMappingId: mapping.id },
    create: {
      androidStoreMappingId: mapping.id,
      appIdentifier: mapping.packageName,
      appName: mapping.appName,
      platform: "ANDROID",
      reviewStoreTargetId: storeTarget.id,
      status: mapping.status,
    },
    update: {
      appIdentifier: mapping.packageName,
      appName: mapping.appName,
      reviewStoreTargetId: storeTarget.id,
      status: mapping.status,
    },
    select: { id: true },
  });

  await ensureReviewSyncState(tx, appTarget.id);

  return appTarget.id;
}

async function ensureIosReviewTargetsQuery(
  tx: Prisma.TransactionClient,
  storeMappingId: string,
) {
  const mapping = await tx.iosStoreMapping.findUnique({
    where: { id: storeMappingId },
    select: {
      appId: true,
      appName: true,
      appleAppId: true,
      appLink: true,
      bundleId: true,
      id: true,
      status: true,
      storeProfileId: true,
      storeProfile: {
        select: {
          id: true,
          status: true,
          storeAccountName: true,
        },
      },
    },
  });

  if (!mapping) {
    throw new Error(`iOS store mapping was not found: ${storeMappingId}.`);
  }

  const appleAppId = firstAppleAppStoreId(
    mapping.appleAppId,
    mapping.appLink,
  );
  const appIdentifier = appleAppId ?? mapping.bundleId;

  if (appleAppId && mapping.appleAppId !== appleAppId) {
    await tx.iosStoreMapping.update({
      where: { id: mapping.id },
      data: { appleAppId },
      select: { id: true },
    });
  }

  const storeTarget = await tx.reviewStoreTarget.upsert({
    where: { iosStoreProfileId: mapping.storeProfileId },
    create: {
      iosStoreProfileId: mapping.storeProfileId,
      platform: "IOS",
      status: mapping.storeProfile.status,
      storeAccountName: mapping.storeProfile.storeAccountName,
    },
    update: {
      status: mapping.storeProfile.status,
      storeAccountName: mapping.storeProfile.storeAccountName,
    },
    select: { id: true },
  });

  const appTarget = await tx.reviewAppTarget.upsert({
    where: { iosStoreMappingId: mapping.id },
    create: {
      appIdentifier,
      appName: mapping.appName,
      iosStoreMappingId: mapping.id,
      platform: "IOS",
      reviewStoreTargetId: storeTarget.id,
      status: mapping.status,
    },
    update: {
      appIdentifier,
      appName: mapping.appName,
      reviewStoreTargetId: storeTarget.id,
      status: mapping.status,
    },
    select: { id: true },
  });

  await ensureReviewSyncState(tx, appTarget.id);

  return appTarget.id;
}

export function ensureAndroidReviewTargetsForMapping(
  storeMappingId: string,
  tx?: Prisma.TransactionClient,
) {
  if (tx) {
    return ensureAndroidReviewTargetsQuery(tx, storeMappingId);
  }

  return prisma.$transaction((transaction) =>
    ensureAndroidReviewTargetsQuery(transaction, storeMappingId),
  );
}

export function ensureIosReviewTargetsForMapping(
  storeMappingId: string,
  tx?: Prisma.TransactionClient,
) {
  if (tx) {
    return ensureIosReviewTargetsQuery(tx, storeMappingId);
  }

  return prisma.$transaction((transaction) =>
    ensureIosReviewTargetsQuery(transaction, storeMappingId),
  );
}

export function ensureReviewTargetsForMapping(
  storeMappingId: string,
  platform: "android" | "ios",
  tx?: Prisma.TransactionClient,
) {
  return platform === "ios"
    ? ensureIosReviewTargetsForMapping(storeMappingId, tx)
    : ensureAndroidReviewTargetsForMapping(storeMappingId, tx);
}

async function reviewAppTargetIdForMapping(
  storeMappingId: string,
  platform: "android" | "ios",
) {
  const target = await prisma.reviewAppTarget.findUnique({
    where:
      platform === "ios"
        ? { iosStoreMappingId: storeMappingId }
        : { androidStoreMappingId: storeMappingId },
    select: { id: true },
  });

  if (!target) {
    return ensureReviewTargetsForMapping(storeMappingId, platform);
  }

  return target.id;
}

function reviewReplyTemplateRecord(
  template: ReviewReplyTemplate & {
    appTarget: {
      androidStoreMappingId: string | null;
      iosStoreMappingId: string | null;
    };
  },
): ReviewReplyTemplateRecord | null {
  const platform = template.appTarget.iosStoreMappingId ? "ios" : "android";
  const storeMappingId =
    template.appTarget.androidStoreMappingId ?? template.appTarget.iosStoreMappingId;
  if (!storeMappingId) return null;

  return {
    id: template.id,
    isActive: template.isActive,
    platform,
    rating: template.rating,
    replyText: template.replyText,
    storeMappingId,
    updatedAt: template.updatedAt,
    updatedBy: template.updatedBy,
  };
}

function reviewReplyTemplateTargetIds(targets: ReviewReplyTemplateTargetInput[]) {
  const androidIds = new Set<string>();
  const iosIds = new Set<string>();

  for (const target of targets) {
    if (typeof target === "string") {
      androidIds.add(target);
      continue;
    }

    if (target.platform === "ios") {
      iosIds.add(target.storeMappingId);
    } else {
      androidIds.add(target.storeMappingId);
    }
  }

  return {
    androidIds: Array.from(androidIds),
    iosIds: Array.from(iosIds),
  };
}

export function getGlobalReviewFetchSchedule() {
  return prisma.reviewFetchSchedule.findUnique({
    where: { scope: REVIEW_FETCH_GLOBAL_SCOPE },
  });
}

function upsertReviewFetchScheduleQuery(input: ReviewFetchScheduleUpsertInput) {
  return prisma.reviewFetchSchedule.upsert({
    where: { scope: REVIEW_FETCH_GLOBAL_SCOPE },
    create: {
      createdBy: input.createdBy,
      intervalHours: input.intervalHours,
      nextRunAt: input.nextRunAt,
      scope: REVIEW_FETCH_GLOBAL_SCOPE,
      status: input.status,
      updatedBy: input.updatedBy,
    },
    update: {
      intervalHours: input.intervalHours,
      lastErrorCode: null,
      lastErrorMessage: null,
      lockedAt: null,
      lockedBy: null,
      nextRunAt: input.nextRunAt,
      status: input.status,
      updatedBy: input.updatedBy,
    },
  });
}

export function upsertGlobalReviewFetchSchedule(
  input: ReviewFetchScheduleUpsertInput,
) {
  return upsertReviewFetchScheduleQuery(input);
}

export function updateGlobalReviewFetchScheduleStatus(input: {
  nextRunAt?: Date;
  status: ReviewFetchScheduleStatus;
  updatedBy: string;
}) {
  return prisma.reviewFetchSchedule.update({
    where: { scope: REVIEW_FETCH_GLOBAL_SCOPE },
    data: {
      lockedAt: null,
      lockedBy: null,
      nextRunAt: input.nextRunAt,
      status: input.status,
      updatedBy: input.updatedBy,
    },
  });
}

export function deleteGlobalReviewFetchSchedule() {
  return prisma.reviewFetchSchedule.delete({
    where: { scope: REVIEW_FETCH_GLOBAL_SCOPE },
  });
}

export async function claimDueReviewFetchSchedules(input: {
  limit?: number;
  lockedBy: string;
  lockStaleBefore: Date;
  now: Date;
}) {
  return prisma.$transaction(async (tx) => {
    const dueSchedules = await tx.reviewFetchSchedule.findMany({
      where: {
        nextRunAt: { lte: input.now },
        status: "ACTIVE",
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: input.lockStaleBefore } },
        ],
      },
      orderBy: { nextRunAt: "asc" },
      select: { id: true },
      take: input.limit,
    });
    const ids = dueSchedules.map((schedule) => schedule.id);
    if (!ids.length) return [];

    await tx.reviewFetchSchedule.updateMany({
      where: {
        id: { in: ids },
        nextRunAt: { lte: input.now },
        status: "ACTIVE",
        OR: [
          { lockedAt: null },
          { lockedAt: { lt: input.lockStaleBefore } },
        ],
      },
      data: {
        lockedAt: input.now,
        lockedBy: input.lockedBy,
      },
    });

    return tx.reviewFetchSchedule.findMany({
      where: { id: { in: ids }, lockedBy: input.lockedBy },
      orderBy: { nextRunAt: "asc" },
    });
  });
}

export function markReviewFetchSchedulesMaterialized(
  inputs: Array<{
    nextRunAt: Date;
    scheduleId: string;
  }>,
) {
  if (!inputs.length) return Promise.resolve([]);

  return prisma.$transaction(
    inputs.map((input) =>
      prisma.reviewFetchSchedule.update({
        where: { id: input.scheduleId },
        data: {
          lockedAt: null,
          lockedBy: null,
          nextRunAt: input.nextRunAt,
        },
      }),
    ),
  );
}

export function finishReviewFetchScheduleRun(
  scheduleId: string,
  input: {
    errorCode?: string | null;
    errorMessage?: string | null;
    lastRunAt: Date;
    lastStatus: ReviewFetchRunStatus;
    nextRunAt?: Date;
  },
) {
  return prisma.reviewFetchSchedule.update({
    where: { id: scheduleId },
    data: {
      lastErrorCode: input.errorCode ?? null,
      lastErrorMessage: input.errorMessage ?? null,
      lastRunAt: input.lastRunAt,
      lastStatus: input.lastStatus,
      lockedAt: null,
      lockedBy: null,
      nextRunAt: input.nextRunAt,
      runCount: { increment: 1 },
    },
  });
}

export async function getReviewReplyTemplateForRating(
  input: {
    platform?: "android" | "ios";
    rating: number;
    storeMappingId: string;
  },
) {
  const platform = input.platform ?? "android";
  const template = await prisma.reviewReplyTemplate.findFirst({
    where: {
      appTarget: {
        ...(platform === "ios"
          ? { iosStoreMappingId: input.storeMappingId }
          : { androidStoreMappingId: input.storeMappingId }),
      },
      rating: input.rating,
    },
    include: {
      appTarget: {
        select: {
          androidStoreMappingId: true,
          iosStoreMappingId: true,
        },
      },
    },
  });

  return template ? reviewReplyTemplateRecord(template) : null;
}

export async function getReviewReplyTemplates(
  targets: ReviewReplyTemplateTargetInput[],
) {
  if (!targets.length) return Promise.resolve([]);

  const { androidIds, iosIds } = reviewReplyTemplateTargetIds(targets);
  if (!androidIds.length && !iosIds.length) return Promise.resolve([]);

  const templates = await prisma.reviewReplyTemplate.findMany({
    where: {
      OR: [
        ...(androidIds.length
          ? [
              {
                appTarget: {
                  androidStoreMappingId: { in: androidIds },
                },
              },
            ]
          : []),
        ...(iosIds.length
          ? [
              {
                appTarget: {
                  iosStoreMappingId: { in: iosIds },
                },
              },
            ]
          : []),
      ],
    },
    include: {
      appTarget: {
        select: {
          androidStoreMappingId: true,
          iosStoreMappingId: true,
        },
      },
    },
    orderBy: [{ rating: "desc" }],
  });

  return templates.flatMap((template) => {
    const record = reviewReplyTemplateRecord(template);
    return record ? [record] : [];
  });
}

export async function updateReviewStoreTargetReplyInfo(
  platform: "android" | "ios",
  storeProfileId: string,
  data: {
    contactEmail: string | null;
    supportPhone: string | null;
    websiteUrl: string | null;
  },
) {
  if (platform === "android") {
    const store = await prisma.$transaction(async (tx) => {
      const updatedStore = await tx.androidStoreProfile.update({
        where: { id: storeProfileId },
        data,
      });

      await tx.reviewStoreTarget.upsert({
        where: { androidStoreProfileId: storeProfileId },
        create: {
          androidStoreProfileId: storeProfileId,
          contactEmail: updatedStore.contactEmail,
          platform: "ANDROID",
          status: updatedStore.status,
          storeAccountName: updatedStore.storeAccountName,
          supportPhone: updatedStore.supportPhone,
          websiteUrl: updatedStore.websiteUrl,
        },
        update: {
          contactEmail: updatedStore.contactEmail,
          supportPhone: updatedStore.supportPhone,
          websiteUrl: updatedStore.websiteUrl,
        },
      });

      return updatedStore;
    });

    return {
      contactEmail: store.contactEmail,
      id: store.id,
      storeAccountName: store.storeAccountName,
      supportPhone: store.supportPhone,
      websiteUrl: store.websiteUrl,
    };
  }

  const target = await prisma.$transaction(async (tx) => {
    const store = await tx.iosStoreProfile.findUniqueOrThrow({
      where: { id: storeProfileId },
      select: {
        id: true,
        status: true,
        storeAccountName: true,
      },
    });

    return tx.reviewStoreTarget.upsert({
      where: { iosStoreProfileId: storeProfileId },
      create: {
        contactEmail: data.contactEmail,
        iosStoreProfileId: storeProfileId,
        platform: "IOS",
        status: store.status,
        storeAccountName: store.storeAccountName,
        supportPhone: data.supportPhone,
        websiteUrl: data.websiteUrl,
      },
      update: data,
      include: {
        iosStoreProfile: {
          select: {
            id: true,
            storeAccountName: true,
          },
        },
      },
    });
  });

  return {
    contactEmail: target.contactEmail,
    id: target.iosStoreProfile?.id ?? storeProfileId,
    storeAccountName:
      target.iosStoreProfile?.storeAccountName ?? target.storeAccountName,
    supportPhone: target.supportPhone,
    websiteUrl: target.websiteUrl,
  };
}

export async function upsertReviewReplyTemplate(data: {
  createdBy?: string | null;
  isActive: boolean;
  platform?: "android" | "ios";
  rating: number;
  replyText: string;
  storeMappingId: string;
  updatedBy?: string | null;
}) {
  const platform = data.platform ?? "android";
  const reviewAppTargetId = await reviewAppTargetIdForMapping(
    data.storeMappingId,
    platform,
  );
  const template = await prisma.reviewReplyTemplate.upsert({
    where: {
      reviewAppTargetId_rating: {
        rating: data.rating,
        reviewAppTargetId,
      },
    },
    create: {
      createdBy: data.createdBy,
      isActive: data.isActive,
      rating: data.rating,
      replyText: data.replyText,
      reviewAppTargetId,
      updatedBy: data.updatedBy,
    },
    update: {
      isActive: data.isActive,
      replyText: data.replyText,
      updatedBy: data.updatedBy,
    },
    include: {
      appTarget: {
        select: {
          androidStoreMappingId: true,
          iosStoreMappingId: true,
        },
      },
    },
  });

  const record = reviewReplyTemplateRecord(template);
  if (!record) {
    throw new Error(
      `Review app target was not found for ${platform} mapping ${data.storeMappingId}.`,
    );
  }

  return record;
}
