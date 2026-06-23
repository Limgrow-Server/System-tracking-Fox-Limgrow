import "server-only";

import { getIosCredentialConfigs } from "@/lib/server/services/credentials/ios-credential.service";
import { getIosStoreMappingDtos } from "@/lib/server/services/store-mappings/ios-store-mapping.service";
import type { StoreMappingPageData } from "@/lib/tracking/page-data";

export async function getIosStoreMappingPageData(): Promise<StoreMappingPageData> {
  const [storeMappings, credentialConfigs] = await Promise.all([
    getIosStoreMappingDtos({ take: 200 }),
    getIosCredentialConfigs(),
  ]);

  return {
    credentialSecrets: credentialConfigs.credentials,
    storeMappings,
  };
}
