import "server-only";

import { getIosCredentialConfigsPage } from "@/lib/server/services/credentials/ios-credential.service";
import type { ConfigsPageData } from "@/lib/tracking/page-data";

export async function getIosConfigsPageData(): Promise<ConfigsPageData> {
  const credentialConfigs = await getIosCredentialConfigsPage({ page: 1, pageSize: 10, skip: 0, take: 10 });

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
