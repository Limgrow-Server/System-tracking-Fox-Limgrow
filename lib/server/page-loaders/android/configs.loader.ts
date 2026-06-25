import "server-only";

import { getAndroidCredentialConfigsPage } from "@/lib/server/services/credentials/android-credential.service";
import type { ConfigsPageData } from "@/lib/tracking/page-data";

export async function getAndroidConfigsPageData(): Promise<ConfigsPageData> {
  const credentialConfigs = await getAndroidCredentialConfigsPage({ page: 1, pageSize: 10, skip: 0, take: 10 });

  return {
    credentialPagination: {
      page: credentialConfigs.page,
      pageSize: credentialConfigs.pageSize,
      total: credentialConfigs.total,
      totalPages: credentialConfigs.totalPages,
    },
    credentialSecrets: credentialConfigs.data,
  };
}
