import "server-only";

import { getIosCredentialStoreOptions } from "@/lib/server/services/credentials/ios-credential.service";
import { getIosStoreMappingPageResult } from "@/lib/server/services/store-mappings/ios-store-mapping.service";
import type { StoreMappingPageData } from "@/lib/tracking/page-data";

export async function getIosStoreMappingPageData(): Promise<StoreMappingPageData> {
  const [storeMappingPage, storeOptions] = await Promise.all([
    getIosStoreMappingPageResult({ page: 1, pageSize: 10, skip: 0, take: 10 }),
    getIosCredentialStoreOptions(),
  ]);

  return {
    credentialSecrets: [],
    storeMappingPagination: {
      page: storeMappingPage.page,
      pageSize: storeMappingPage.pageSize,
      total: storeMappingPage.total,
      totalPages: storeMappingPage.totalPages,
    },
    storeMappings: storeMappingPage.data,
    storeOptions,
  };
}
