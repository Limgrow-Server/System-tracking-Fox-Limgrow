import "server-only";

import { canAccessReviewApp } from "@/lib/auth/app-scope";
import type { ConsoleSession } from "@/lib/auth/rbac";
import { getReplyConfigPageData } from "@/lib/server/services/reviews/android-review.service";
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
    current.lastFetchedAt = latestDate(current.lastFetchedAt, app.lastFetchedAt);
    stores.set(app.storeProfileId, current);
  }

  return Array.from(stores.values()).sort((left, right) =>
    left.storeAccountName.localeCompare(right.storeAccountName),
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
): Promise<ReplyStoreListPageData> {
  const data = await getReplyConfigPageData();
  const scopedData = scopedReplyConfigData(data, session);

  return {
    stores: buildStoreSummaries(scopedData),
  };
}

export async function getReplyConfigPageDataLoader(
  storeProfileId: string,
  session: ConsoleSession,
): Promise<ReplyConfigPageData | null> {
  const data = await getReplyConfigPageData();
  const scopedData = scopedReplyConfigData(data, session);
  const stores = buildStoreSummaries(scopedData);
  const store = stores.find((item) => item.storeProfileId === storeProfileId);
  if (!store) return null;

  const appIds = new Set(store.apps.map((app) => app.mappingId));

  return {
    apps: scopedData.apps.filter((app) => appIds.has(app.mappingId)),
    store,
    templatesByMappingId: Object.fromEntries(
      Object.entries(scopedData.templatesByMappingId).filter(([mappingId]) =>
        appIds.has(mappingId),
      ),
    ),
  };
}
