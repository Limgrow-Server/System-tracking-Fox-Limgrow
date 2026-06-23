import "server-only";

import { getReplyConfigPageData } from "@/lib/server/services/reviews/android-review.service";
import type {
  ReplyConfigPageData,
  ReplyStoreListPageData,
  ReplyStoreSummary,
} from "@/lib/tracking/page-data";

function latestDate(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function buildStoreSummaries(data: Awaited<ReturnType<typeof getReplyConfigPageData>>) {
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

export async function getReplyStoreListPageDataLoader(): Promise<ReplyStoreListPageData> {
  const data = await getReplyConfigPageData();

  return {
    stores: buildStoreSummaries(data),
  };
}

export async function getReplyConfigPageDataLoader(
  storeProfileId: string,
): Promise<ReplyConfigPageData | null> {
  const data = await getReplyConfigPageData();
  const stores = buildStoreSummaries(data);
  const store = stores.find((item) => item.storeProfileId === storeProfileId);
  if (!store) return null;

  const appIds = new Set(store.apps.map((app) => app.mappingId));

  return {
    apps: data.apps.filter((app) => appIds.has(app.mappingId)),
    store,
    templatesByMappingId: Object.fromEntries(
      Object.entries(data.templatesByMappingId).filter(([mappingId]) =>
        appIds.has(mappingId),
      ),
    ),
  };
}
