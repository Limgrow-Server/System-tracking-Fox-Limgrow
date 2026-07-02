import "server-only";

import { getAndroidCredentialStoreOptions } from "@/lib/server/services/credentials/android-credential.service";
import { getAndroidStoreMappingPageResult } from "@/lib/server/services/store-mappings/android-store-mapping.service";
import type { StoreMappingPageData } from "@/lib/tracking/page-data";

export async function getAndroidStoreMappingPageData(): Promise<StoreMappingPageData> {
  const [storeMappingPage, storeOptions] = await Promise.all([
    getAndroidStoreMappingPageResult({ page: 1, pageSize: 10, skip: 0, take: 10 }),
    getAndroidCredentialStoreOptions(),
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
