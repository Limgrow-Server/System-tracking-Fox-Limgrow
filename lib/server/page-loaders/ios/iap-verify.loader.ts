import "server-only";

import { getIosCredentialConfigs } from "@/lib/server/services/credentials/ios-credential.service";
import { getRecentIosIapTransactions } from "@/lib/server/repositories/ios/iap-transaction.repository";
import { getIosStoreMappingDtos } from "@/lib/server/services/store-mappings/ios-store-mapping.service";
import { iosIapTransactionToSummary } from "@/lib/tracking/mappers/ios";
import type { IosIapVerifyPageData } from "@/lib/tracking/page-data";

export async function getIosIapVerifyPageData(): Promise<IosIapVerifyPageData> {
  const [storeMappings, credentialConfigs, recentTransactions] = await Promise.all([
    getIosStoreMappingDtos({ take: 300 }),
    getIosCredentialConfigs(),
    getRecentIosIapTransactions(20),
  ]);

  return {
    credentialSecrets: credentialConfigs.credentials.filter(
      (credential) =>
        credential.platform === "ios" &&
        credential.status === "active" &&
        credential.credential_purpose === "iap"
    ),
    recentTransactions: recentTransactions.map(iosIapTransactionToSummary),
    storeMappings: storeMappings.filter((mapping) => mapping.status === "active"),
  };
}
