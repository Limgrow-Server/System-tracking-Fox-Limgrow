import "server-only";

import { unstable_cache } from "next/cache";

import { CACHE_TAGS } from "@/lib/server/cache-tags";
import { valuesMatchSearch } from "@/lib/search";
import {
  getActiveIapAppMappingsPage,
  getActiveIapStoreNames,
  getAllActiveStoreMappings,
  getAndroidIapTransactionById,
  getAndroidMappingById,
  getAndroidTransactionStatesByPackageAndProfile,
  getAndroidTransactionsByPackageAndProfileMetrics,
  getAndroidTransactionsByPackageAndProfilePage,
  getIosIapTransactionById,
  getIosMappingById,
  getIosTransactionStatesByBundleId,
  getIosTransactionsByBundleIdMetrics,
  getIosTransactionsByBundleIdPage,
  getIosTransactionsListPageByMappingId,
} from "@/lib/server/repositories/iap/iap-app.repository";
import { getIosIapTwoHourChecksForTransactions } from "@/lib/server/repositories/iap/ios-iap-two-hour-check.repository";
import {
  paginatedResult,
  type PaginatedResult,
  type PaginationQuery,
} from "@/lib/server/api/pagination";
import type {
  IapAppCard,
  IapAppMetrics,
  IapAppTransaction,
  IapRevenueGranularity,
} from "@/lib/tracking/page-data";
import { iapAndroidToDto } from "@/lib/server/services/iap/android-iap.service";
import { getIosTrialConversionAnalytics } from "@/lib/server/services/iap/ios-iap-analytics.service";
import {
  iosIapTransactionToSummary,
  iosIapTwoHourCheckToTracking,
} from "@/lib/tracking/mappers/ios";
import type { IosIapTwoHourCheck } from "@/lib/tracking/types";

type IapAppCardOptions = {
  platform?: string;
  search?: string;
  storeAccountName?: string;
};

type IapAppCardsPageOptions = IapAppCardOptions & PaginationQuery;

function normalizedAppId(value: string | null | undefined) {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") ?? ""
  );
}

function appEnvironment(
  platform: "android" | "ios",
  appId: string | null | undefined,
  requested: string | undefined,
) {
  const testAppId = platform === "android" ? "la000" : "li000";
  if (normalizedAppId(appId) !== testAppId) return "production";

  const environment = requested?.trim().toLowerCase();
  if (environment === "all") return "all";
  if (
    platform === "ios" &&
    (environment === "sandbox" || environment === "test")
  ) {
    return "sandbox";
  }
  if (
    platform === "android" &&
    (environment === "test" || environment === "sandbox")
  ) {
    return "test";
  }
  return "production";
}

type CachedIapAppCard = IapAppCard & {
  appId: string | null;
};

function toPublicIapAppCard(app: CachedIapAppCard): IapAppCard {
  return {
    appId: app.appId,
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

function filterIapAppCards(
  apps: CachedIapAppCard[],
  options?: IapAppCardOptions,
) {
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
    const matchesSearch = valuesMatchSearch(
      [app.appName, app.identifier, app.storeAccountName, app.appId],
      search,
    );

    return matchesPlatform && matchesStore && matchesSearch;
  });
}

const getCachedIapAppCards = unstable_cache(
  async (): Promise<CachedIapAppCard[]> => {
    const { androidMappings, iosMappings } = await getAllActiveStoreMappings();

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

export async function getIapAppCardLists(
  options?: IapAppCardOptions,
): Promise<{ allApps: IapAppCard[]; matchingApps: IapAppCard[] }> {
  const cachedApps = await getCachedIapAppCards();
  const allApps = filterIapAppCards(cachedApps, {
    platform: options?.platform,
  }).map(toPublicIapAppCard);
  const hasSearchFilters = Boolean(
    options?.search?.trim() || options?.storeAccountName?.trim(),
  );
  const matchingApps = hasSearchFilters
    ? filterIapAppCards(cachedApps, options).map(toPublicIapAppCard)
    : allApps;

  return { allApps, matchingApps };
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

export async function getPaginatedIapAppCards(
  options: IapAppCardsPageOptions,
): Promise<{
  appPage: PaginatedResult<IapAppCard>;
  storeNames: string[];
}> {
  const platform =
    options.platform === "android" || options.platform === "ios"
      ? options.platform
      : undefined;
  const [result, storeNames] = await Promise.all([
    getActiveIapAppMappingsPage({
      platform,
      search: options.search,
      storeAccountName: options.storeAccountName,
      skip: options.skip,
      take: options.take,
    }),
    getActiveIapStoreNames({ platform }),
  ]);

  return {
    appPage: paginatedResult(result.apps, result.total, options),
    storeNames,
  };
}

type IapTransactionPageOptions = PaginationQuery & {
  environment?: string;
  includeContext?: boolean;
  knownTotal?: number;
  kind?: string;
  purchaseDateFrom?: string;
  purchaseDateTo?: string;
  revenueGranularity?: string;
  revenueSort?: string;
  state?: string;
  trial?: string;
};

type IapTransactionPageResult = {
  appCard: IapAppCard;
  metrics?: IapAppMetrics;
  transactionStates?: string[];
  transactions: PaginatedResult<IapAppTransaction>;
  twoHourChecks?: IosIapTwoHourCheck[];
};

export type IapTransactionReceiptResult = {
  appCard: IapAppCard;
  rawReceipt: unknown;
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

async function getIosTwoHourChecksForVisibleTransactions(
  transactions: Array<{ transactionId: string }>,
) {
  const transactionIds = transactions
    .map((transaction) => transaction.transactionId)
    .filter(Boolean);
  const checks = await getIosIapTwoHourChecksForTransactions(transactionIds);

  return checks.map(iosIapTwoHourCheckToTracking);
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

    const scopedOptions = {
      ...options,
      environment: appEnvironment(
        "android",
        mapping.appId,
        options.environment,
      ),
    };
    const appCard: IapAppCard = {
      appId: mapping.appId,
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

    const loadTransactionPage = () =>
      getAndroidTransactionsByPackageAndProfilePage(
        mapping.packageName,
        mapping.storeProfileId,
        {
          ...scopedOptions,
          includeTotal: includeContext || options.knownTotal === undefined,
        },
      );
    const fallbackTotal = options.knownTotal ?? 0;

    if (!includeContext) {
      const [rawTransactions, total] = await loadTransactionPage();

      return {
        appCard,
        transactions: paginatedResult(
          rawTransactions.map((transaction) => iapAndroidToDto(transaction)),
          total ?? fallbackTotal,
          scopedOptions,
        ),
      };
    }

    const [[rawTransactions, total], metrics, transactionStates] =
      await Promise.all([
        loadTransactionPage(),
        getAndroidTransactionsByPackageAndProfileMetrics(
          mapping.packageName,
          mapping.storeProfileId,
          scopedOptions,
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
        rawTransactions.map((transaction) => iapAndroidToDto(transaction)),
        total ?? 0,
        options,
      ),
    };
  }

  if (platform === "ios") {
    if (!includeContext) {
      const {
        mapping,
        total,
        transactions: rawTransactions,
        twoHourChecks,
      } = await getIosTransactionsListPageByMappingId(mappingId, {
        ...options,
        includeTotal: false,
      });
      if (!mapping) throw new Error("iOS mapping not found");

      const appCard: IapAppCard = {
        appId: mapping.appId,
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
      const fallbackTotal = options.knownTotal ?? 0;

      return {
        appCard,
        transactions: paginatedResult(
          rawTransactions.map((transaction) =>
            iosIapTransactionToSummary(transaction),
          ),
          total ?? fallbackTotal,
          options,
        ),
        twoHourChecks: twoHourChecks.map(iosIapTwoHourCheckToTracking),
      };
    }

    const mapping = await getIosMappingById(mappingId);
    if (!mapping) throw new Error("iOS mapping not found");

    const scopedOptions = {
      ...options,
      environment: appEnvironment("ios", mapping.appId, options.environment),
    };
    const appCard: IapAppCard = {
      appId: mapping.appId,
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

    const loadTransactionPage = () =>
      getIosTransactionsByBundleIdPage(
        mapping.bundleId,
        mapping.storeProfileId,
        {
          ...scopedOptions,
          includeTotal: includeContext || options.knownTotal === undefined,
        },
      );

    const [[rawTransactions, total], metrics, transactionStates] =
      await Promise.all([
        loadTransactionPage(),
        getIosTransactionsByBundleIdMetrics(
          mapping.bundleId,
          mapping.storeProfileId,
          scopedOptions,
        ),
        getIosTransactionStatesByBundleId(
          mapping.bundleId,
          mapping.storeProfileId,
          scopedOptions,
        ),
      ]);

    return {
      appCard,
      metrics,
      transactionStates,
      transactions: paginatedResult(
        rawTransactions.map((transaction) =>
          iosIapTransactionToSummary(transaction),
        ),
        total ?? 0,
        options,
      ),
      twoHourChecks:
        await getIosTwoHourChecksForVisibleTransactions(rawTransactions),
    };
  }

  throw new Error("Invalid platform");
}

export async function getIapTransactionReceipt(
  id: string,
  platform: string,
): Promise<IapTransactionReceiptResult> {
  if (platform === "android") {
    const transaction = await getAndroidIapTransactionById(id);
    if (!transaction) throw new Error("Android IAP transaction not found");

    return {
      appCard: {
        appIconUrl: null,
        appLink: null,
        appName: transaction.productId,
        identifier: transaction.packageName,
        mappingId: transaction.packageName,
        platform: "android",
        storeAccountName: transaction.storeProfile?.storeAccountName ?? "",
        storeProfileId: transaction.storeProfileId ?? "",
      },
      rawReceipt: transaction.rawReceipt,
    };
  }

  if (platform === "ios") {
    const transaction = await getIosIapTransactionById(id);
    if (!transaction) throw new Error("iOS IAP transaction not found");

    return {
      appCard: {
        appIconUrl: null,
        appLink: null,
        appName: transaction.productId,
        identifier: transaction.bundleId ?? "",
        mappingId: transaction.bundleId ?? transaction.transactionId,
        platform: "ios",
        storeAccountName: transaction.storeProfile?.storeAccountName ?? "",
        storeProfileId: transaction.storeProfileId ?? "",
      },
      rawReceipt: transaction.rawReceipt,
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
    purchaseDateFrom?: string;
    purchaseDateTo?: string;
    revenueGranularity?: IapRevenueGranularity;
    revenueSort?: string;
    state?: string;
    trial?: string;
  },
): Promise<{
  appCard: IapAppCard;
  metrics: IapAppMetrics;
  trialAnalytics: Awaited<
    ReturnType<typeof getIosTrialConversionAnalytics>
  > | null;
  transactionStates: string[];
  transactions: PaginatedResult<IapAppTransaction>;
  twoHourChecks: IosIapTwoHourCheck[];
}> {
  if (platform === "android") {
    const mapping = await getAndroidMappingById(mappingId);
    if (!mapping) throw new Error("Android mapping not found");

    const scopedOptions = {
      ...options,
      environment: appEnvironment(
        "android",
        mapping.appId,
        options.environment,
      ),
    };
    const appCard: IapAppCard = {
      appId: mapping.appId,
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

    const loadTransactionPage = () =>
      getAndroidTransactionsByPackageAndProfilePage(
        mapping.packageName,
        mapping.storeProfileId,
        scopedOptions,
      );

    if (options.includeContext === false) {
      const [rawTransactions, total] = await loadTransactionPage();

      return {
        appCard,
        trialAnalytics: null,
        metrics: emptyIapAppMetrics(),
        transactionStates: [],
        transactions: paginatedResult(
          rawTransactions.map((transaction) => iapAndroidToDto(transaction)),
          total ?? 0,
          scopedOptions,
        ),
        twoHourChecks: [],
      };
    }

    const [[rawTransactions, total], metrics, transactionStates] =
      await Promise.all([
        loadTransactionPage(),
        getAndroidTransactionsByPackageAndProfileMetrics(
          mapping.packageName,
          mapping.storeProfileId,
          scopedOptions,
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
        rawTransactions.map((transaction) => iapAndroidToDto(transaction)),
        total ?? 0,
        options,
      ),
      twoHourChecks: [],
    };
  } else if (platform === "ios") {
    if (options.includeContext === false) {
      const {
        mapping,
        total,
        transactions: rawTransactions,
        twoHourChecks,
      } = await getIosTransactionsListPageByMappingId(mappingId, {
        ...options,
        includeTotal: true,
      });
      if (!mapping) throw new Error("iOS mapping not found");

      const appCard: IapAppCard = {
        appId: mapping.appId,
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
        trialAnalytics: null,
        metrics: emptyIapAppMetrics(),
        transactionStates: [],
        transactions: paginatedResult(
          rawTransactions.map((transaction) =>
            iosIapTransactionToSummary(transaction),
          ),
          total ?? 0,
          options,
        ),
        twoHourChecks: twoHourChecks.map(iosIapTwoHourCheckToTracking),
      };
    }

    const mapping = await getIosMappingById(mappingId);
    if (!mapping) throw new Error("iOS mapping not found");

    const scopedOptions = {
      ...options,
      environment: appEnvironment("ios", mapping.appId, options.environment),
    };
    const appCard: IapAppCard = {
      appId: mapping.appId,
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

    const loadTransactionPage = () =>
      getIosTransactionsByBundleIdPage(
        mapping.bundleId,
        mapping.storeProfileId,
        scopedOptions,
      );

    const trialAnalyticsPromise =
      options.includeTrialAnalytics === false
        ? Promise.resolve(null)
        : getIosTrialConversionAnalytics(
            mapping.bundleId,
            mapping.storeProfileId,
          );
    const [
      [rawTransactions, total],
      metrics,
      transactionStates,
      trialAnalytics,
    ] = await Promise.all([
      loadTransactionPage(),
      getIosTransactionsByBundleIdMetrics(
        mapping.bundleId,
        mapping.storeProfileId,
        scopedOptions,
      ),
      getIosTransactionStatesByBundleId(
        mapping.bundleId,
        mapping.storeProfileId,
        scopedOptions,
      ),
      trialAnalyticsPromise,
    ]);

    return {
      appCard,
      trialAnalytics,
      metrics,
      transactionStates,
      transactions: paginatedResult(
        rawTransactions.map((transaction) =>
          iosIapTransactionToSummary(transaction),
        ),
        total ?? 0,
        options,
      ),
      twoHourChecks:
        await getIosTwoHourChecksForVisibleTransactions(rawTransactions),
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
    revenueGranularity?: string;
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

    const scopedOptions = {
      ...options,
      environment: appEnvironment(
        "android",
        mapping.appId,
        options.environment,
      ),
    };
    const appCard: IapAppCard = {
      appId: mapping.appId,
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
        scopedOptions,
      ),
      getAndroidTransactionStatesByPackageAndProfile(
        mapping.packageName,
        mapping.storeProfileId,
        scopedOptions,
      ),
    ]);

    return { appCard, metrics, transactionStates };
  }

  if (platform === "ios") {
    const mapping = await getIosMappingById(mappingId);
    if (!mapping) throw new Error("iOS mapping not found");

    const scopedOptions = {
      ...options,
      environment: appEnvironment("ios", mapping.appId, options.environment),
    };
    const appCard: IapAppCard = {
      appId: mapping.appId,
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
        scopedOptions,
      ),
      getIosTransactionStatesByBundleId(
        mapping.bundleId,
        mapping.storeProfileId,
        scopedOptions,
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
  trialAnalytics: Awaited<
    ReturnType<typeof getIosTrialConversionAnalytics>
  > | null;
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
