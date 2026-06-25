import "server-only";

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
import { iosIapTransactionToSummary } from "@/lib/tracking/mappers/ios";

type IapAppCardOptions = {
  search?: string;
  storeAccountName?: string;
};

export async function getIapAppCards(
  options?: IapAppCardOptions,
): Promise<IapAppCard[]> {
  const { androidMappings, iosMappings } =
    await getAllActiveStoreMappings(options);

  const androidCards: IapAppCard[] = androidMappings.map((m) => ({
    mappingId: m.id,
    platform: "android",
    appName: m.appName,
    identifier: m.packageName,
    appIconUrl: m.appIconUrl,
    appLink: m.appLink,
    storeAccountName: m.storeProfile?.storeAccountName ?? m.storeAccountName,
    storeProfileId: m.storeProfileId,
  }));

  const iosCards: IapAppCard[] = iosMappings.map((m) => ({
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
    search?: string;
    state?: string;
  },
): Promise<{
  appCard: IapAppCard;
  metricTransactions: IapAppTransaction[];
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

    const [[rawTransactions, total], metricTransactions, transactionStates] =
      await Promise.all([
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
      ]);

    return {
      appCard,
      metricTransactions: metricTransactions.map(iosIapTransactionToSummary),
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
