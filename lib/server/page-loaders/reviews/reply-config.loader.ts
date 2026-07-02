import "server-only";

import { canAccessReviewApp } from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import { valuesMatchSearch } from "@/lib/search";
import { paginatedResult, type PaginationQuery } from "@/lib/server/api/pagination";
import { getReplyConfigPageData } from "@/lib/server/services/reviews/review.service";
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

function filterReplyStores(stores: ReplyStoreSummary[], search?: string) {
  return stores.filter((store) =>
    valuesMatchSearch([
      store.storeAccountName,
      store.contactEmail,
      store.supportPhone,
      store.websiteUrl,
      ...store.apps.flatMap((app) => [app.appName, app.identifier]),
    ], search),
  );
}

function filterReplyApps(apps: ReviewAppCard[], search?: string) {
  return apps.filter((app) =>
    valuesMatchSearch([app.appName, app.identifier, app.storeAccountName], search),
  );
}

function scopedReplyConfigData(
  data: Awaited<ReturnType<typeof getReplyConfigPageData>>,
  session: ConsoleSession,
): ReplyConfigRows {
  const apps = data.apps.filter((app) => canAccessReviewApp(session, app));
  const appIds = new Set(apps.map((app) => app.mappingId));

  return {
    apps,
    templatesByMappingId: Object.fromEntries(
      Object.entries(data.templatesByMappingId).filter(([mappingId]) =>
        appIds.has(mappingId),
      ),
    ),
  };
}

export async function getReplyStoreListPageDataLoader(
  session: ConsoleSession,
  options?: Partial<PaginationQuery> & {
    search?: string;
  },
): Promise<ReplyStoreListPageData> {
  const pagination = {
    page: options?.page ?? 1,
    pageSize: options?.pageSize ?? 10,
    skip: options?.skip ?? 0,
    take: options?.take ?? 10,
  };
  const data = await getReplyConfigPageData();
  const scopedData = scopedReplyConfigData(data, session);
  const stores = filterReplyStores(
    buildStoreSummaries(scopedData),
    options?.search,
  );
  const storePage = paginatedResult(
    stores.slice(pagination.skip, pagination.skip + pagination.take),
    stores.length,
    pagination,
  );

  return {
    filters: {
      search: options?.search ?? "",
    },
    storePagination: {
      page: storePage.page,
      pageSize: storePage.pageSize,
      total: storePage.total,
      totalPages: storePage.totalPages,
    },
    stores: storePage.data,
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
  const data = await getReplyConfigPageData();
  const scopedData = scopedReplyConfigData(data, session);
  const stores = buildStoreSummaries(scopedData);
  const store = stores.find((item) => item.storeProfileId === storeProfileId);
  if (!store) return null;

  const appIds = new Set(store.apps.map((app) => app.mappingId));
  const storeApps = scopedData.apps.filter((app) => appIds.has(app.mappingId));
  const filteredApps = filterReplyApps(storeApps, options?.search);
  const appPage = paginatedResult(
    filteredApps.slice(pagination.skip, pagination.skip + pagination.take),
    filteredApps.length,
    pagination,
  );
  const pageAppIds = new Set(appPage.data.map((app) => app.mappingId));

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
    templatesByMappingId: Object.fromEntries(
      Object.entries(scopedData.templatesByMappingId).filter(([mappingId]) =>
        pageAppIds.has(mappingId),
      ),
    ),
  };
}
