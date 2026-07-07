import "server-only";

import {
  canAccessReviewApp,
  canAccessScopedRecord,
  hasAllAppAccess,
} from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import { valuesMatchSearch } from "@/lib/search";
import { paginatedResult, type PaginationQuery } from "@/lib/server/api/pagination";
import {
  getActiveReviewAppScopesForStoreProfiles,
  getActiveReviewStoreScopesPage,
  getReviewReplyTemplates,
  type ReviewStoreScopeRecord,
} from "@/lib/server/repositories/reviews/review.repository";
import {
  getReviewAppCardScopes,
  hydrateReviewAppCards,
  type ReviewAppCardScope,
} from "@/lib/server/services/reviews/review.service";
import type {
  ReplyConfigPageData,
  ReplyStoreListPageData,
  ReplyStoreSummary,
  ReviewReplyTemplateDto,
  ReviewAppCard,
} from "@/lib/tracking/page-data";

type ReplyConfigRows = {
  apps: ReviewAppCard[];
  templatesByMappingId: Record<string, ReviewReplyTemplateDto[]>;
};

const RATINGS = [5, 4, 3, 2, 1] as const;

type ReplyStoreScopeSummary = {
  apps: ReviewAppCardScope[];
  platform: "android" | "ios";
  storeAccountName: string;
  storeProfileId: string;
};

function latestDate(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function buildStoreSummaries(data: ReplyConfigRows) {
  const stores = new Map<string, ReplyStoreSummary>();

  for (const app of data.apps) {
    const current =
      stores.get(app.storeProfileId) ??
      ({
        activeTemplateCount: 0,
        appCount: 0,
        apps: [],
        contactEmail: app.storeContactEmail,
        lastFetchedAt: null,
        pendingReplyCount: 0,
        platform: app.platform,
        reviewCount: 0,
        storeAccountName: app.storeAccountName,
        storeAvatarUrl: app.storeAvatarUrl,
        storeLink: app.storeLink,
        storeProfileId: app.storeProfileId,
        supportPhone: app.storeSupportPhone,
        websiteUrl: app.storeWebsiteUrl,
      } satisfies ReplyStoreSummary);

    const activeTemplateCount =
      data.templatesByMappingId[app.mappingId]?.filter(
        (template) => template.isActive && template.replyText.trim(),
      ).length ?? 0;

    current.apps.push(app);
    current.appCount += 1;
    current.activeTemplateCount += activeTemplateCount;
    current.reviewCount += app.reviewCount;
    current.pendingReplyCount += app.pendingReplyCount;
    current.lastFetchedAt = latestDate(
      current.lastFetchedAt,
      app.lastFetchedAt,
    );
    stores.set(app.storeProfileId, current);
  }

  return Array.from(stores.values()).sort((left, right) =>
    left.storeAccountName.localeCompare(right.storeAccountName),
  );
}

function buildStoreScopeSummaries(scopes: ReviewAppCardScope[]) {
  const stores = new Map<string, ReplyStoreScopeSummary>();

  for (const app of scopes) {
    const current =
      stores.get(app.storeProfileId) ??
      ({
        apps: [],
        platform: app.platform,
        storeAccountName: app.storeAccountName,
        storeProfileId: app.storeProfileId,
      } satisfies ReplyStoreScopeSummary);

    current.apps.push(app);
    stores.set(app.storeProfileId, current);
  }

  return Array.from(stores.values()).sort((left, right) =>
    left.storeAccountName.localeCompare(right.storeAccountName),
  );
}

function filterReplyStoreScopes(
  stores: ReplyStoreScopeSummary[],
  platform?: string,
  search?: string,
) {
  const normalizedPlatform =
    platform === "android" || platform === "ios" ? platform : "all";

  return stores.filter(
    (store) =>
      (normalizedPlatform === "all" ||
        store.platform === normalizedPlatform) &&
      valuesMatchSearch([store.storeAccountName], search),
  );
}

function filterReplyApps(apps: ReviewAppCard[], search?: string) {
  return apps.filter((app) =>
    valuesMatchSearch([app.appName, app.identifier, app.storeAccountName], search),
  );
}

function fallbackStoreSummary(store: ReviewStoreScopeRecord): ReplyStoreSummary {
  return {
    activeTemplateCount: 0,
    appCount: Number(store.appCount ?? 0),
    apps: [],
    contactEmail: store.contactEmail,
    lastFetchedAt: null,
    pendingReplyCount: 0,
    platform: store.platform === "ios" ? "ios" : "android",
    reviewCount: 0,
    storeAccountName: store.storeAccountName,
    storeAvatarUrl: store.storeAvatarUrl,
    storeLink: store.storeLink,
    storeProfileId: store.storeProfileId,
    supportPhone: store.supportPhone,
    websiteUrl: store.websiteUrl,
  };
}

function defaultTemplates(storeMappingId: string): ReviewReplyTemplateDto[] {
  return RATINGS.map((rating) => ({
    id: null,
    isActive: false,
    rating,
    replyText: "",
    storeMappingId,
    updatedAt: null,
    updatedBy: null,
  }));
}

async function getTemplatesByMappingId(apps: ReviewAppCard[]) {
  const templates = await getReviewReplyTemplates(
    apps.map((app) => ({
      platform: app.platform,
      storeMappingId: app.mappingId,
    })),
  );
  const templatesByMappingId: Record<string, ReviewReplyTemplateDto[]> = {};

  for (const app of apps) {
    templatesByMappingId[app.mappingId] = defaultTemplates(app.mappingId).map(
      (fallback) => {
        const template = templates.find(
          (item) =>
            item.storeMappingId === app.mappingId &&
            item.rating === fallback.rating,
        );

        return template
          ? {
              id: template.id,
              isActive: template.isActive,
              rating: template.rating,
              replyText: template.replyText,
              storeMappingId: app.mappingId,
              updatedAt: template.updatedAt.toISOString(),
              updatedBy: template.updatedBy,
            }
          : fallback;
      },
    );
  }

  return templatesByMappingId;
}

export async function getReplyStoreListPageDataLoader(
  session: ConsoleSession,
  options?: Partial<PaginationQuery> & {
    platform?: string;
    search?: string;
  },
): Promise<ReplyStoreListPageData> {
  const pagination = {
    page: options?.page ?? 1,
    pageSize: options?.pageSize ?? 10,
    skip: options?.skip ?? 0,
    take: options?.take ?? 10,
  };

  if (hasAllAppAccess(session)) {
    const storePage = await getActiveReviewStoreScopesPage({
      platform: options?.platform,
      search: options?.search,
      skip: pagination.skip,
      take: pagination.take,
    });
    const pageStoreIds = storePage.stores.map((store) => store.storeProfileId);
    const pageApps = await hydrateReviewAppCards(
      await getActiveReviewAppScopesForStoreProfiles(pageStoreIds),
    );
    const summaries = buildStoreSummaries({
      apps: pageApps,
      templatesByMappingId: {},
    });
    const summaryByStoreId = new Map(
      summaries.map((store) => [store.storeProfileId, store]),
    );
    const stores = storePage.stores.map(
      (store) =>
        summaryByStoreId.get(store.storeProfileId) ??
        fallbackStoreSummary(store),
    );

    return {
      filters: {
        platform:
          options?.platform === "android" || options?.platform === "ios"
            ? options.platform
            : "all",
        search: options?.search ?? "",
      },
      storePagination: {
        page: pagination.page,
        pageSize: pagination.pageSize,
        total: storePage.total,
        totalPages: Math.max(1, Math.ceil(storePage.total / pagination.pageSize)),
      },
      stores,
    };
  }

  const scopes = await getReviewAppCardScopes({
    canAccess: (app) => canAccessScopedRecord(session, app),
    platform: options?.platform,
  });
  const storeScopes = filterReplyStoreScopes(
    buildStoreScopeSummaries(scopes),
    options?.platform,
    options?.search,
  );
  const storePage = paginatedResult(
    storeScopes.slice(pagination.skip, pagination.skip + pagination.take),
    storeScopes.length,
    pagination,
  );
  const pageStoreIds = new Set(
    storePage.data.map((store) => store.storeProfileId),
  );
  const orderByStoreId = new Map(
    storePage.data.map((store, index) => [store.storeProfileId, index]),
  );
  const pageApps = await hydrateReviewAppCards(
    scopes.filter((app) => pageStoreIds.has(app.storeProfileId)),
  );
  const stores = buildStoreSummaries({
    apps: pageApps,
    templatesByMappingId: {},
  }).sort(
    (left, right) =>
      (orderByStoreId.get(left.storeProfileId) ?? 0) -
      (orderByStoreId.get(right.storeProfileId) ?? 0),
  );

  return {
    filters: {
      platform:
        options?.platform === "android" || options?.platform === "ios"
          ? options.platform
          : "all",
      search: options?.search ?? "",
    },
    storePagination: {
      page: storePage.page,
      pageSize: storePage.pageSize,
      total: storePage.total,
      totalPages: storePage.totalPages,
    },
    stores,
  };
}

export async function getReplyConfigPageDataLoader(
  storeProfileId: string,
  session: ConsoleSession,
  options?: Partial<PaginationQuery> & {
    search?: string;
  },
): Promise<ReplyConfigPageData | null> {
  const pagination = {
    page: options?.page ?? 1,
    pageSize: options?.pageSize ?? 10,
    skip: options?.skip ?? 0,
    take: options?.take ?? 10,
  };
  const scopes = await getReviewAppCardScopes({
    canAccess: (app) => canAccessScopedRecord(session, app),
  });
  const storeScopes = scopes.filter(
    (app) => app.storeProfileId === storeProfileId,
  );

  if (!storeScopes.length) return null;

  const storeApps = (await hydrateReviewAppCards(storeScopes)).filter((app) =>
    canAccessReviewApp(session, app),
  );
  const store = buildStoreSummaries({
    apps: storeApps,
    templatesByMappingId: {},
  }).find((item) => item.storeProfileId === storeProfileId);

  if (!store) return null;

  const filteredApps = filterReplyApps(storeApps, options?.search);
  const appPage = paginatedResult(
    filteredApps.slice(pagination.skip, pagination.skip + pagination.take),
    filteredApps.length,
    pagination,
  );
  const templatesByMappingId = await getTemplatesByMappingId(appPage.data);

  return {
    appPagination: {
      page: appPage.page,
      pageSize: appPage.pageSize,
      total: appPage.total,
      totalPages: appPage.totalPages,
    },
    apps: appPage.data,
    filters: {
      search: options?.search ?? "",
    },
    store,
    templatesByMappingId,
  };
}
