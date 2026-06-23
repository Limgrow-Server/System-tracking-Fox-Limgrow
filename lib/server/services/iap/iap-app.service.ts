import "server-only";

import {
  getAllActiveStoreMappings,
  getAndroidMappingById,
  getIosMappingById,
  getAndroidTransactionsByPackageAndProfile,
  getIosTransactionsByBundleId,
} from "@/lib/server/repositories/iap/iap-app.repository";
import type { IapAppCard, IapAppTransaction } from "@/lib/tracking/page-data";
import { iapAndroidToDto } from "@/lib/server/services/iap/android-iap.service";
import { iosIapTransactionToSummary } from "@/lib/tracking/mappers/ios";

export async function getIapAppCards(): Promise<IapAppCard[]> {
  const { androidMappings, iosMappings } = await getAllActiveStoreMappings();

  const androidCards: IapAppCard[] = androidMappings.map((m) => ({
    mappingId: m.id,
    platform: "android",
    appName: m.appName,
    identifier: m.packageName,
    appIconUrl: m.appIconUrl,
    appLink: m.appLink,
    storeAccountName: m.storeAccountName,
    storeProfileId: m.storeProfileId,
  }));

  const iosCards: IapAppCard[] = iosMappings.map((m) => ({
    mappingId: m.id,
    platform: "ios",
    appName: m.appName,
    identifier: m.bundleId,
    appIconUrl: m.appIconUrl,
    appLink: m.appLink,
    storeAccountName: m.storeAccountName,
    storeProfileId: m.storeProfileId,
  }));

  return [...androidCards, ...iosCards].sort((a, b) =>
    a.appName.localeCompare(b.appName),
  );
}

export async function getIapAppDetail(
  mappingId: string,
  platform: string,
): Promise<{ appCard: IapAppCard; transactions: IapAppTransaction[] }> {
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
      storeAccountName: mapping.storeAccountName,
      storeProfileId: mapping.storeProfileId,
    };

    const rawTransactions = await getAndroidTransactionsByPackageAndProfile(
      mapping.packageName,
      mapping.storeProfileId,
    );
    return {
      appCard,
      transactions: rawTransactions.map(iapAndroidToDto),
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
      storeAccountName: mapping.storeAccountName,
      storeProfileId: mapping.storeProfileId,
    };

    const rawTransactions = await getIosTransactionsByBundleId(
      mapping.bundleId,
      mapping.storeProfileId,
    );
    return {
      appCard,
      transactions: rawTransactions.map(iosIapTransactionToSummary),
    };
  }

  throw new Error("Invalid platform");
}
