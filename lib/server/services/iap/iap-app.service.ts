import "server-only";

import { unstable_cache } from "next/cache";

import { CACHE_TAGS } from "@/lib/server/cache-tags";
import {
  getAllActiveStoreMappings,
  getAndroidMappingById,
  getAndroidTransactionStatesByPackageAndProfile,
  getAndroidTransactionsByPackageAndProfileMetrics,
  getAndroidTransactionsByPackageAndProfilePage,
  getIosMappingById,
  getIosTransactionStatesByBundleId,
  getIosTransactionsByBundleIdMetrics,
  getIosTransactionsByBundleIdPage,
} from "@/lib/server/repositories/iap/iap-app.repository";
import {
  paginatedResult,
  type PaginatedResult,
  type PaginationQuery,
} from "@/lib/server/api/pagination";
import type { IapAppCard, IapAppTransaction } from "@/lib/tracking/page-data";
import { iapAndroidToDto } from "@/lib/server/services/iap/android-iap.service";
import { getIosTrialConversionAnalytics } from "@/lib/server/services/iap/ios-iap-analytics.service";
import { iosIapTransactionToSummary } from "@/lib/tracking/mappers/ios";

type IapAppCardOptions = {
  platform?: string;
  search?: string;
  storeAccountName?: string;
};

type CachedIapAppCard = IapAppCard & {
  appId: string | null;
};

function toPublicIapAppCard(app: CachedIapAppCard): IapAppCard {
  return {
    appIconUrl: app.appIconUrl,
    appLink: app.appLink,
    appName: app.appName,
    identifier: app.identifier,
    mappingId: app.mappingId,
    platform: app.platform,
    storeAccountName: app.storeAccountName,
    storeProfileId: app.storeProfileId,
  };
}

function filterIapAppCards(apps: CachedIapAppCard[], options?: IapAppCardOptions) {
  const platform =
    options?.platform === "android" || options?.platform === "ios"
      ? options.platform
      : "";
  const search = options?.search?.trim().toLowerCase();
  const storeAccountName = options?.storeAccountName?.trim().toLowerCase();

  return apps.filter((app) => {
    const matchesPlatform = !platform || app.platform === platform;
    const matchesStore =
      !storeAccountName ||
      app.storeAccountName.toLowerCase() === storeAccountName;
    const matchesSearch =
      !search ||
      app.appName.toLowerCase().includes(search) ||
      app.identifier.toLowerCase().includes(search) ||
      app.storeAccountName.toLowerCase().includes(search) ||
      Boolean(app.appId?.toLowerCase().includes(search));

    return matchesPlatform && matchesStore && matchesSearch;
  });
}

const getCachedIapAppCards = unstable_cache(
  async (): Promise<CachedIapAppCard[]> => {
    const { androidMappings, iosMappings } =
      await getAllActiveStoreMappings();

    const androidCards: CachedIapAppCard[] = androidMappings.map((m) => ({
      appId: m.appId,
      mappingId: m.id,
      platform: "android",
      appName: m.appName,
      identifier: m.packageName,
      appIconUrl: m.appIconUrl,
      appLink: m.appLink,
      storeAccountName: m.storeProfile?.storeAccountName ?? m.storeAccountName,
      storeProfileId: m.storeProfileId,
    }));

    const iosCards: CachedIapAppCard[] = iosMappings.map((m) => ({
      appId: m.appId,
      mappingId: m.id,
      platform: "ios",
      appName: m.appName,
      identifier: m.bundleId,
      appIconUrl: m.appIconUrl,
      appLink: m.appLink,
      storeAccountName: m.storeProfile?.storeAccountName ?? m.storeAccountName,
      storeProfileId: m.storeProfileId,
    }));

    return [...androidCards, ...iosCards].sort((a, b) =>
      a.appName.localeCompare(b.appName),
    );
  },
  ["iap-app-cards"],
  {
    revalidate: 300,
    tags: [CACHE_TAGS.androidStoreMappings, CACHE_TAGS.iosStoreMappings],
  },
);

export async function getIapAppCards(
  options?: IapAppCardOptions,
): Promise<IapAppCard[]> {
  return filterIapAppCards(await getCachedIapAppCards(), options).map(
    toPublicIapAppCard,
  );
}

export function getIapAppCardsPage(
  apps: IapAppCard[],
  pagination: PaginationQuery,
) {
  return paginatedResult(
    apps.slice(pagination.skip, pagination.skip + pagination.take),
    apps.length,
    pagination,
  );
}

export async function getIapAppDetail(
  mappingId: string,
  platform: string,
  options: PaginationQuery & {
    kind?: string;
    state?: string;
    trial?: string;
  },
): Promise<{
  appCard: IapAppCard;
  metricTransactions: IapAppTransaction[];
  trialAnalytics: Awaited<ReturnType<typeof getIosTrialConversionAnalytics>> | null;
  transactionStates: string[];
  transactions: PaginatedResult<IapAppTransaction>;
}> {
  if (platform === "android") {
    const mapping = await getAndroidMappingById(mappingId);
    if (!mapping) throw new Error("Android mapping not found");

    const appCard: IapAppCard = {
      mappingId: mapping.id,
      platform: "android",
      appName: mapping.appName,
      identifier: mapping.packageName,
      appIconUrl: mapping.appIconUrl,
      appLink: mapping.appLink,
      storeAccountName:
        mapping.storeProfile?.storeAccountName ?? mapping.storeAccountName,
      storeProfileId: mapping.storeProfileId,
    };

    const [[rawTransactions, total], metricTransactions, transactionStates] =
      await Promise.all([
        getAndroidTransactionsByPackageAndProfilePage(
          mapping.packageName,
          mapping.storeProfileId,
          options,
        ),
        getAndroidTransactionsByPackageAndProfileMetrics(
          mapping.packageName,
          mapping.storeProfileId,
          options,
        ),
        getAndroidTransactionStatesByPackageAndProfile(
          mapping.packageName,
          mapping.storeProfileId,
        ),
      ]);

    return {
      appCard,
      metricTransactions: metricTransactions.map(iapAndroidToDto),
      trialAnalytics: null,
      transactionStates,
      transactions: paginatedResult(
        rawTransactions.map(iapAndroidToDto),
        total,
        options,
      ),
    };
  } else if (platform === "ios") {
    const mapping = await getIosMappingById(mappingId);
    if (!mapping) throw new Error("iOS mapping not found");

    const appCard: IapAppCard = {
      mappingId: mapping.id,
      platform: "ios",
      appName: mapping.appName,
      identifier: mapping.bundleId,
      appIconUrl: mapping.appIconUrl,
      appLink: mapping.appLink,
      storeAccountName:
        mapping.storeProfile?.storeAccountName ?? mapping.storeAccountName,
      storeProfileId: mapping.storeProfileId,
    };

    const [
      [rawTransactions, total],
      metricTransactions,
      transactionStates,
      trialAnalytics,
    ] = await Promise.all([
        getIosTransactionsByBundleIdPage(
          mapping.bundleId,
          mapping.storeProfileId,
          options,
        ),
        getIosTransactionsByBundleIdMetrics(
          mapping.bundleId,
          mapping.storeProfileId,
          options,
        ),
        getIosTransactionStatesByBundleId(
          mapping.bundleId,
          mapping.storeProfileId,
        ),
        getIosTrialConversionAnalytics(mapping.bundleId, mapping.storeProfileId),
      ]);

    return {
      appCard,
      metricTransactions: metricTransactions.map(iosIapTransactionToSummary),
      trialAnalytics,
      transactionStates,
      transactions: paginatedResult(
        rawTransactions.map(iosIapTransactionToSummary),
        total,
        options,
      ),
    };
  }

  throw new Error("Invalid platform");
}
