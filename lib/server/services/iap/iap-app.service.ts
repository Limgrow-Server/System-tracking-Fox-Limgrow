import "server-only";

import { unstable_cache } from "next/cache";

import { CACHE_TAGS } from "@/lib/server/cache-tags";
import { valuesMatchSearch } from "@/lib/search";
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
import type {
  IapAppCard,
  IapAppMetrics,
  IapAppTransaction,
} from "@/lib/tracking/page-data";
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
  const search = options?.search;
  const storeAccountName = options?.storeAccountName?.trim().toLowerCase();

  return apps.filter((app) => {
    const matchesPlatform = !platform || app.platform === platform;
    const matchesStore =
      !storeAccountName ||
      app.storeAccountName.toLowerCase() === storeAccountName;
    const matchesSearch = valuesMatchSearch([
      app.appName,
      app.identifier,
      app.storeAccountName,
      app.appId,
    ], search);

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

type IapTransactionPageOptions = PaginationQuery & {
  environment?: string;
  includeContext?: boolean;
  knownTotal?: number;
  kind?: string;
  state?: string;
  trial?: string;
};

type IapTransactionPageResult = {
  appCard: IapAppCard;
  metrics?: IapAppMetrics;
  transactionStates?: string[];
  transactions: PaginatedResult<IapAppTransaction>;
};

function emptyIapAppMetrics(): IapAppMetrics {
  return {
    activeCount: 0,
    canceledCount: 0,
    latestTimestamp: 0,
    last7Orders: 0,
    last7Revenue: 0,
    previous7Orders: 0,
    previous7Revenue: 0,
    revenueBuckets: [],
    totalCount: 0,
    totalRevenue: 0,
  };
}

export async function getIapAppTransactionsPage(
  mappingId: string,
  platform: string,
  options: IapTransactionPageOptions,
): Promise<IapTransactionPageResult> {
  const includeContext = options.includeContext !== false;

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

    const transactionPagePromise = getAndroidTransactionsByPackageAndProfilePage(
      mapping.packageName,
      mapping.storeProfileId,
      {
        ...options,
        includeTotal: includeContext || options.knownTotal === undefined,
      },
    );
    const fallbackTotal = options.knownTotal ?? 0;

    if (!includeContext) {
      const [rawTransactions, total] = await transactionPagePromise;

      return {
        appCard,
        transactions: paginatedResult(
          rawTransactions.map(iapAndroidToDto),
          total ?? fallbackTotal,
          options,
        ),
      };
    }

    const [[rawTransactions, total], metrics, transactionStates] =
      await Promise.all([
        transactionPagePromise,
        getAndroidTransactionsByPackageAndProfileMetrics(
          mapping.packageName,
          mapping.storeProfileId,
          options,
        ),
        getAndroidTransactionStatesByPackageAndProfile(
          mapping.packageName,
          mapping.storeProfileId,
          options,
        ),
      ]);

    return {
      appCard,
      metrics,
      transactionStates,
      transactions: paginatedResult(
        rawTransactions.map(iapAndroidToDto),
        total ?? 0,
        options,
      ),
    };
  }

  if (platform === "ios") {
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

    const transactionPagePromise = getIosTransactionsByBundleIdPage(
      mapping.bundleId,
      mapping.storeProfileId,
      {
        ...options,
        includeTotal: includeContext || options.knownTotal === undefined,
      },
    );
    const fallbackTotal = options.knownTotal ?? 0;

    if (!includeContext) {
      const [rawTransactions, total] = await transactionPagePromise;

      return {
        appCard,
        transactions: paginatedResult(
          rawTransactions.map(iosIapTransactionToSummary),
          total ?? fallbackTotal,
          options,
        ),
      };
    }

    const [[rawTransactions, total], metrics, transactionStates] =
      await Promise.all([
        transactionPagePromise,
        getIosTransactionsByBundleIdMetrics(
          mapping.bundleId,
          mapping.storeProfileId,
          options,
        ),
        getIosTransactionStatesByBundleId(
          mapping.bundleId,
          mapping.storeProfileId,
        ),
      ]);

    return {
      appCard,
      metrics,
      transactionStates,
      transactions: paginatedResult(
        rawTransactions.map(iosIapTransactionToSummary),
        total ?? 0,
        options,
      ),
    };
  }

  throw new Error("Invalid platform");
}

export async function getIapAppDetail(
  mappingId: string,
  platform: string,
  options: PaginationQuery & {
    environment?: string;
    includeContext?: boolean;
    includeTrialAnalytics?: boolean;
    kind?: string;
    state?: string;
    trial?: string;
  },
): Promise<{
  appCard: IapAppCard;
  metrics: IapAppMetrics;
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

    const transactionPagePromise = getAndroidTransactionsByPackageAndProfilePage(
      mapping.packageName,
      mapping.storeProfileId,
      options,
    );

    if (options.includeContext === false) {
      const [rawTransactions, total] = await transactionPagePromise;

      return {
        appCard,
        trialAnalytics: null,
        metrics: emptyIapAppMetrics(),
        transactionStates: [],
        transactions: paginatedResult(
          rawTransactions.map(iapAndroidToDto),
          total ?? 0,
          options,
        ),
      };
    }

    const [[rawTransactions, total], metrics, transactionStates] =
      await Promise.all([
        transactionPagePromise,
        getAndroidTransactionsByPackageAndProfileMetrics(
          mapping.packageName,
          mapping.storeProfileId,
          options,
        ),
        getAndroidTransactionStatesByPackageAndProfile(
          mapping.packageName,
          mapping.storeProfileId,
          options,
        ),
      ]);

    return {
      appCard,
      trialAnalytics: null,
      metrics,
      transactionStates,
      transactions: paginatedResult(
        rawTransactions.map(iapAndroidToDto),
        total ?? 0,
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

    const transactionPagePromise = getIosTransactionsByBundleIdPage(
      mapping.bundleId,
      mapping.storeProfileId,
      options,
    );

    if (options.includeContext === false) {
      const [rawTransactions, total] = await transactionPagePromise;

      return {
        appCard,
        trialAnalytics: null,
        metrics: emptyIapAppMetrics(),
        transactionStates: [],
        transactions: paginatedResult(
          rawTransactions.map(iosIapTransactionToSummary),
          total ?? 0,
          options,
        ),
      };
    }

    const [[rawTransactions, total], metrics, transactionStates, trialAnalytics] =
      await Promise.all([
        transactionPagePromise,
        getIosTransactionsByBundleIdMetrics(
          mapping.bundleId,
          mapping.storeProfileId,
          options,
        ),
        getIosTransactionStatesByBundleId(
          mapping.bundleId,
          mapping.storeProfileId,
        ),
        options.includeTrialAnalytics === false
          ? Promise.resolve(null)
          : getIosTrialConversionAnalytics(
              mapping.bundleId,
              mapping.storeProfileId,
            ),
      ]);

    return {
      appCard,
      trialAnalytics,
      metrics,
      transactionStates,
      transactions: paginatedResult(
        rawTransactions.map(iosIapTransactionToSummary),
        total ?? 0,
        options,
      ),
    };
  }

  throw new Error("Invalid platform");
}

export async function getIapAppContext(
  mappingId: string,
  platform: string,
  options: {
    environment?: string;
    kind?: string;
    state?: string;
    trial?: string;
  },
): Promise<{
  appCard: IapAppCard;
  metrics: IapAppMetrics;
  transactionStates: string[];
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
    const [metrics, transactionStates] = await Promise.all([
      getAndroidTransactionsByPackageAndProfileMetrics(
        mapping.packageName,
        mapping.storeProfileId,
        options,
      ),
      getAndroidTransactionStatesByPackageAndProfile(
        mapping.packageName,
        mapping.storeProfileId,
        options,
      ),
    ]);

    return { appCard, metrics, transactionStates };
  }

  if (platform === "ios") {
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
    const [metrics, transactionStates] = await Promise.all([
      getIosTransactionsByBundleIdMetrics(
        mapping.bundleId,
        mapping.storeProfileId,
        options,
      ),
      getIosTransactionStatesByBundleId(
        mapping.bundleId,
        mapping.storeProfileId,
      ),
    ]);

    return { appCard, metrics, transactionStates };
  }

  throw new Error("Invalid platform");
}

export async function getIapAppTrialAnalytics(
  mappingId: string,
  platform: string,
): Promise<{
  appCard: IapAppCard;
  trialAnalytics: Awaited<ReturnType<typeof getIosTrialConversionAnalytics>> | null;
}> {
  if (platform !== "ios") {
    const mapping = await getAndroidMappingById(mappingId);
    if (!mapping) throw new Error("Android mapping not found");

    return {
      appCard: {
        mappingId: mapping.id,
        platform: "android",
        appName: mapping.appName,
        identifier: mapping.packageName,
        appIconUrl: mapping.appIconUrl,
        appLink: mapping.appLink,
        storeAccountName:
          mapping.storeProfile?.storeAccountName ?? mapping.storeAccountName,
        storeProfileId: mapping.storeProfileId,
      },
      trialAnalytics: null,
    };
  }

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

  return {
    appCard,
    trialAnalytics: await getIosTrialConversionAnalytics(
      mapping.bundleId,
      mapping.storeProfileId,
    ),
  };
}
